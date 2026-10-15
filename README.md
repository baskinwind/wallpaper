# Wallpaper

基于 Hono 和 Unsplash API 的壁纸服务，部署在阿里云 ESA，支持随机壁纸、下载追踪和图片预热。

## 实现

- `src/index.ts`：注册路由、跨域配置和健康检查，将 ESA 函数变量传入 Hono 的 `c.env`。
- `src/wallpaper.ts`：调用 Unsplash API 获取集合图片、随机壁纸和下载地址。图片使用 `regular` 规格并设置 `dpr=2`；配置回源地址后，仅替换图片 URL 的协议和域名，保留路径与查询参数。
- `src/admin.ts`：提供图片管理页，按页读取集合，每页最多 30 张，在浏览器中仅预热当前页选中的图片，支持停止和失败重试。

## 配置与部署

1. 创建 [Unsplash API 应用](https://unsplash.com/developers)，获取 Access Key 和集合 ID。
2. 在 ESA「函数和 Pages」中导入仓库，在项目的「基本信息 → 函数变量」中配置：

   | 变量 | 必填 | 说明 |
   | --- | --- | --- |
   | `WALLPAPER_AK` | 是 | Unsplash Access Key，建议加密存储 |
   | `WALLPAPER_COLLECTIONS` | 是 | 集合 ID，多个 ID 用英文逗号分隔 |
   | `WALLPAPER_MIRROR_ORIGIN` | 否 | 图片回源服务地址，如 `https://img.example.com`，仅含协议和域名 |

   使用回源服务时，将其源站配置为 `https://images.unsplash.com`，保留路径和查询参数，并将服务地址填入 `WALLPAPER_MIRROR_ORIGIN`。
3. 按 `esa.jsonc` 部署：入口为 `src/index.ts`，安装命令为 `pnpm install --frozen-lockfile`，构建命令为 `pnpm run build`。使用 Node.js 24 和 pnpm 12，函数打包由 ESA 完成。
4. 访问 `/health` 和 `/wallpaper/random` 验证。修改函数变量后需重新生成版本并部署。

`.env.example` 仅作配置参考，项目不会自动加载 `.env`。

## 使用

| 接口 | 说明 |
| --- | --- |
| `GET /health` | 健康检查，返回 `{"success":true}` |
| `GET /wallpaper/random` | 从配置的集合中随机获取一张壁纸 |
| `GET /wallpaper/list?collection=0&page=1` | 分页获取图片，每页最多 30 张；`collection` 为集合索引，返回 `data.photos` 和下一页参数 `data.next`，结束时为 `null` |
| `POST /wallpaper/track` | 提交下载追踪地址数组，返回 Unsplash 下载地址数组 |
| `GET /admin` | 图片管理页 |

获取随机壁纸：

```sh
curl https://your-api.example.com/wallpaper/random
```

成功响应的 `data` 包含 `url`（原图地址）、`mirror_url`（回源服务地址）、`download`（下载追踪地址），以及图片描述、作者、来源链接等信息。未配置回源地址时，`mirror_url` 为 `null`，客户端可用 `data.mirror_url ?? data.url` 获取图片地址。

用户触发下载时，将 `data.download` 原样放入数组提交，保留追踪参数：

```sh
curl https://your-api.example.com/wallpaper/track \
  -H 'Content-Type: application/json' \
  -d '["https://api.unsplash.com/photos/example/download?ixid=example"]'
```

返回 `{"success":true,"data":["https://images.unsplash.com/..."]}`。

打开 `/admin`，点击「读取图片列表」，通过页码或上一页、下一页切换，每页最多 30 张。选择图片后点击「预热本页选中图片」，预热和失败重试均限定在当前页，任务期间不可翻页。页面使用服务端配置，无需填写密钥或地址；预热并发为 2，失败自动重试 1 次，切换已读页面会保留预热状态，刷新页面会丢失进度。回源服务需允许管理页跨域读取，HTTPS 页面应配置 HTTPS 图片地址。

管理页和列表接口为公开路由，可在 ESA 上限制访问。使用图片时遵循 [Unsplash API Guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines) 的署名和下载追踪要求。

## 本地检查

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm exec eslint .
```

`build` 执行 TypeScript 类型检查，`pnpm run lint` 会自动修复 lint 问题。项目未提供本地开发服务器，`wrangler.toml` 不能直接运行当前 ESA 入口。

# Wallpaper

基于 Hono 和 Unsplash API 的随机壁纸接口，部署在阿里云 ESA。支持从指定 Unsplash 集合中随机获取图片，并可选返回七牛 Kodo + CDN 镜像地址。

## 环境变量

在 ESA 的「函数和 Pages → 目标项目 → 基本信息 → 函数变量」中配置：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `WALLPAPER_AK` | 是 | 自己的 Unsplash Access Key，建议加密存储 |
| `WALLPAPER_COLLECTIONS` | 是 | Unsplash 集合 ID，多个 ID 用英文逗号分隔 |
| `WALLPAPER_MIRROR_ORIGIN` | 否 | 自己的图片 CDN 域名，包含协议，例如 `https://img.example.com` |

镜像域名支持 HTTP 和 HTTPS，可带末尾 `/`，不能包含子路径、查询参数、用户名或密码。未配置时，`data.mirror_url` 返回 `null`，仍可使用 `data.url`。HTTPS 页面请使用 HTTPS 图片域名，避免混合内容问题。

`.env.example` 仅作配置示例；本项目不会自动加载 `.env`。运行时通过 ESA 的 `fetch(request, context, env)` 第三个参数接收变量，再交给 Hono 的 `c.env`，不会把密钥写入构建产物。

生产和测试环境分别配置变量；修改变量后，需要重新生成版本并部署到对应环境才会生效。参见 [ESA 函数变量文档](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/function-variable)。

## 部署到 ESA

1. Fork 项目，并创建自己的 [Unsplash API 应用](https://unsplash.com/developers)，获取 Access Key 和集合 ID。
2. 在 ESA「函数和 Pages」中导入仓库，选择生产分支。
3. 配置上面的函数变量。不使用七牛时，可不设置 `WALLPAPER_MIRROR_ORIGIN`。
4. 按 `esa.jsonc` 构建并部署：入口为 `src/index.ts`，安装命令为 `pnpm install --frozen-lockfile`，构建命令为 `pnpm run build`。
5. 访问 `/health`，再访问 `/wallpaper/random` 验证。

构建环境使用 Node.js 24 和 pnpm 12（具体版本见 `package.json`）。`build` 执行 TypeScript 类型检查，函数打包由 ESA 完成。

## 七牛镜像回源（可选）

这里有两个不同的地址：`WALLPAPER_MIRROR_ORIGIN` 是返回给客户端的七牛 CDN 地址；七牛控制台里的镜像源站地址是 `https://images.unsplash.com`。

1. 创建自己的 Kodo 空间，配置公开读取，并绑定自己的 CDN 加速域名。
2. 按七牛提供的 CNAME 完成 DNS 解析。使用 HTTPS 时，同时配置证书。
3. 在 Kodo 空间的「空间设置 → 镜像回源」中添加规则：
   - 触发条件：文件不存在（404）。
   - 源站地址：`https://images.unsplash.com`。
   - 回源 Host：`images.unsplash.com`。
   - 保留 URL 参数：开启。
   - 回源模式：普通模式。
4. CDN 缓存配置保留全部 URL 参数。
5. 将自己的 CDN 地址填入 ESA 的 `WALLPAPER_MIRROR_ORIGIN`，重新部署。

访问流程为：客户端请求七牛 CDN → Kodo 中没有文件时向 Unsplash 回源 → Kodo 保存图片 → 后续请求由七牛提供。

Unsplash 直链和镜像图片统一使用 `photo.urls.regular`，仅设置 `dpr=2`，保留其尺寸、质量、格式和追踪等其他参数。例如 `regular` 中的 `w=1080` 配合 `dpr=2` 请求 2160 像素宽的图片。`data.url` 保留 Unsplash 域名，`data.mirror_url` 仅替换协议和域名，两者路径和查询参数一致。

**Kodo 镜像文件按路径保存，不按查询参数保存不同版本。** 因此不要通过修改镜像 URL 参数请求不同尺寸。同一路径首次存入小图后，改成大图参数仍会返回原文件。以后调整规格，需要删除对应 Kodo 对象并刷新 CDN 缓存，再重新回源；仅刷新 CDN 不够。

使用 Unsplash API 时请核对并遵守其图片展示、署名和下载追踪要求；镜像存储不等同于遵循其默认的直链展示方式。参见 [Unsplash API Guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines)。

## 接口

### `GET /health`

返回 `{"success":true}`。

### `GET /wallpaper/random`

从配置的集合中随机获取一张图片。响应示例（图片元数据随实际内容变化）：

```json
{
  "success": true,
  "data": {
    "color": "#aabbcc",
    "slug": "example-photo",
    "description": "A landscape",
    "url": "https://images.unsplash.com/photo-example?…&fm=jpg&w=1080&dpr=2&q=80&fit=max",
    "mirror_url": "https://img.example.com/photo-example?…&fm=jpg&w=1080&dpr=2&q=80&fit=max",
    "link": "https://unsplash.com/photos/example-photo",
    "download": "https://api.unsplash.com/photos/example/download?ixid=…",
    "user": {
      "name": "Photographer",
      "link": "https://unsplash.com/@photographer"
    },
    "exif": {},
    "location": {}
  }
}
```

`url` 为 Unsplash 直链；`mirror_url` 为可选的同规格镜像地址。客户端可使用 `data.mirror_url ?? data.url` 选择图片地址。

### `POST /wallpaper/track`

用户触发下载时，将随机接口返回的 `data.download` 原样放入 JSON 数组提交，保留其中的追踪参数：

```sh
curl https://your-api.example.com/wallpaper/track \
  -H 'Content-Type: application/json' \
  -d '["https://api.unsplash.com/photos/example/download?ixid=example"]'
```

返回 `{"success":true,"data":["https://images.unsplash.com/..."]}`。这里返回的仍为 Unsplash 下载地址，不替换成镜像地址。

## 本地检查

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm exec eslint .
```

`pnpm run lint` 会自动修复可修复的问题。仓库目前没有本地开发服务器；部署入口使用 ESA 的参数顺序，现有 `wrangler.toml` 不能直接用于运行该入口，移植到其他平台需要适配入口参数。

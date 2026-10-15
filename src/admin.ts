export const adminPage = String.raw`<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wallpaper · 图片管理</title>
<link rel="icon" href="https://static.breeze.red/main/logo.svg" type="image/svg+xml">
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7f4;color:#293d32;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1120px;padding:40px 24px;margin:auto}header{margin-bottom:28px}.brand{font-size:11px;letter-spacing:.16em;color:#789080}h1{font-size:30px;margin:14px 0 10px}p{color:#768578;line-height:1.7}.panel{padding:24px;background:white;border:1px solid #dfe6df;border-radius:12px}.toolbar{display:flex;gap:10px;flex-wrap:wrap}.pagination{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:20px}.pagination #page-info{color:#768578;font-size:12px}.pagination button[aria-current="page"]{background:#306849;color:white;opacity:1}button{font:inherit;background:#306849;color:white;border:1px solid #306849;padding:10px 16px;border-radius:6px;cursor:pointer}button.secondary{background:white;color:#486a52;border-color:#d5dfd5}button:disabled{opacity:.4;cursor:not-allowed}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:24px 0;background:#f6f8f4;padding:20px;border-radius:8px}.stats strong{font-size:26px;display:block}.stats span{display:block;margin-top:6px;color:#829080;font-size:12px}progress{width:100%;height:5px;accent-color:#44845b}#message{font-size:13px}#message:empty{display:none}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left;min-width:610px}th{font-size:12px;color:#849180;font-weight:500;background:#f8faf6}th,td{padding:14px 10px;border-bottom:1px solid #edf0e9}td{font-size:12px}input{accent-color:#306849}.photo{display:flex;gap:12px;align-items:center}.photo img{width:64px;height:44px;object-fit:cover;border-radius:4px}.photo a{display:block;max-width:300px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.author{margin-top:5px;color:#849080}a{color:#41664d;text-decoration:none}a:hover{text-decoration:underline}.status{border-radius:4px;padding:4px 7px;display:inline-block;background:#edf1ea}.success{background:#e3f2e7;color:#226b3b}.failed{background:#fae9e3;color:#9e4a35}.running{background:#e8eff6;color:#416482}.error{color:#a45a42;font-size:11px;max-width:230px;margin-top:7px;overflow-wrap:anywhere}#empty{text-align:center;padding:45px;color:#8a9789}footer{font-size:12px;margin-top:18px;color:#7d8c7d;line-height:1.8}@media(max-width:650px){main{padding:24px 14px}.panel{padding:16px}.stats{gap:8px;padding:14px}.stats strong{font-size:22px}}
</style></head>
<body><main><header><div class="brand">BREEZE / WALLPAPER</div><h1>图片管理</h1></header>
<section class="panel"><div class="toolbar"><button id="load" class="secondary">读取图片列表</button><button id="warm">预热本页选中图片</button><button id="retry" class="secondary">重试本页失败项</button><button id="stop" class="secondary" disabled>停止</button><button id="reset" class="secondary">刷新当前页</button></div>
<div class="stats"><div><strong id="total">0</strong><span>本页图片</span></div><div><strong id="pending">0</strong><span>待处理</span></div><div><strong id="success">0</strong><span>完整加载</span></div><div><strong id="failed">0</strong><span>失败</span></div></div>
<progress id="progress" value="0" max="1" aria-label="预热进度" hidden></progress><p id="message" role="status" aria-live="polite"></p>
<div class="scroll"><table><thead><tr><th><input type="checkbox" id="all" checked aria-label="全选本页"></th><th>图片 / 作者</th><th>状态</th><th>大小 / 用时</th><th>链接</th></tr></thead><tbody id="rows"></tbody></table></div><div id="empty">尚未读取图片</div>
<nav class="pagination" aria-label="图片分页"><button id="prev" class="secondary" disabled>上一页</button><div id="pages" class="toolbar"></div><button id="next" class="secondary" disabled>下一页</button><span id="page-info" role="status">每页最多 30 张</span></nav></section>
<footer>规格与随机接口一致：regular + dpr=2。默认并发 2，失败自动重试 1 次。<br>图片来自 <a href="https://unsplash.com/?utm_source=wallpaper_admin&utm_medium=referral" target="_blank" rel="noopener noreferrer">Unsplash</a>。</footer>
</main>
<script>
const $ = (id) => document.getElementById(id);
const pages = [];
let pageIndex = -1, controller = null, completed = 0, jobTotal = 0;
function currentPhotos() { return pages[pageIndex]?.photos || []; }
const labels = { pending: '待处理', running: '加载中', success: '完整加载', failed: '失败' };
function message(text) { $('message').textContent = text; }
function safeUrl(value) { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; } }
function link(text, url) { const a = document.createElement('a'); a.textContent = text; a.href = safeUrl(url) || '#'; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
function render() {
  const list = currentPhotos();
  for (const name of ['total', 'pending', 'success', 'failed']) $(name).textContent = name === 'total' ? list.length : list.filter(p => p.status === name).length;
  $('empty').hidden = list.length > 0; $('progress').max = Math.max(1, jobTotal); $('progress').value = completed; $('progress').hidden = jobTotal === 0;
  $('all').checked = list.every(p => p.selected); $('all').indeterminate = list.some(p => p.selected) && !list.every(p => p.selected);
  $('all').disabled = !!controller || !list.length;
  $('load').hidden = pageIndex >= 0;
  for (const id of ['load', 'reset']) $(id).disabled = !!controller;
  $('warm').disabled = !!controller || !list.some(p => p.selected && p.status !== 'success');
  $('retry').disabled = !!controller || !list.some(p => p.status === 'failed');
  $('stop').disabled = !controller;
  $('prev').disabled = !!controller || pageIndex <= 0;
  $('next').disabled = !!controller || !pages[pageIndex]?.next;
  $('page-info').textContent = pageIndex < 0 ? '每页最多 30 张' : '第 ' + (pageIndex + 1) + ' 页 · 本页 ' + list.length + ' 张' + (pages[pageIndex].next ? '' : ' · 已到末页');
  const numbers = document.createDocumentFragment();
  for (let i = Math.max(0, pageIndex - 3); i < Math.min(pages.length, Math.max(7, pageIndex + 4)); i++) {
    const button = document.createElement('button'); button.textContent = i + 1; button.className = 'secondary';
    button.disabled = !!controller || i === pageIndex; button.setAttribute('aria-label', '第 ' + (i + 1) + ' 页');
    if (i === pageIndex) button.setAttribute('aria-current', 'page');
    button.onclick = () => job(signal => load(signal, i)); numbers.append(button);
  }
  $('pages').replaceChildren(numbers);
  const fragment = document.createDocumentFragment();
  for (const p of list) {
    const tr = document.createElement('tr'), cells = Array.from({ length: 5 }, () => { const td = document.createElement('td'); tr.append(td); return td; });
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = p.selected; input.disabled = !!controller; input.setAttribute('aria-label', '选择 ' + p.id); input.onchange = () => { p.selected = input.checked; render(); }; cells[0].append(input);
    const info = document.createElement('div'); info.className = 'photo';
    if (safeUrl(p.thumbnail)) { const img = document.createElement('img'); img.src = p.thumbnail; img.alt = ''; img.loading = 'lazy'; info.append(img); }
    const text = document.createElement('div'); text.append(link(p.description || p.id, p.link));
    const author = link(p.user.name, p.user.link); author.className = 'author'; text.append(author); info.append(text); cells[1].append(info);
    const badge = document.createElement('span'); badge.className = 'status ' + p.status; badge.textContent = labels[p.status]; cells[2].append(badge);
    if (p.error) { const error = document.createElement('div'); error.className = 'error'; error.textContent = p.error; cells[2].append(error); }
    cells[3].textContent = p.bytes ? Math.round(p.bytes / 1024) + ' KB / ' + p.seconds + 's' : '—';
    cells[4].append(link('源图', p.url)); if (p.mirror_url) { cells[4].append(' · ', link('镜像', p.mirror_url)); }
    fragment.append(tr);
  }
  $('rows').replaceChildren(fragment);
}
async function job(fn) {
  if (controller) return;
  controller = new AbortController(); render();
  try { await fn(controller.signal); } catch (e) { message(controller.signal.aborted ? '已停止，当前进度保留，可继续。' : e.message); }
  finally { controller = null; render(); }
}
async function load(signal, target = Math.max(0, pageIndex), refresh = false) {
  if (target < 0 || target > pages.length) return;
  if (!pages[target] || refresh) {
    const params = pages[target]?.params || (target === 0 ? { collection: 0, page: 1 } : pages[target - 1]?.next);
    if (!params) return;
    message('正在读取第 ' + (target + 1) + ' 页…');
    const r = await fetch('/wallpaper/list?' + new URLSearchParams(params), { signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]), cache: 'no-store' });
    const result = await r.json(); if (!r.ok || !result.success) throw new Error((result.message || '读取失败') + '；请重试。');
    signal.throwIfAborted();
    const photos = Array.from(new Map(result.data.photos.map(p => [p.id, { ...p, status: 'pending', selected: true, bytes: 0, error: '' }])).values());
    pages.splice(target, pages.length - target, { params, next: result.data.next, photos });
  }
  pageIndex = target; completed = 0; jobTotal = 0; render();
  $('empty').textContent = '本页暂无图片';
  message('');
}
async function verify(p, signal) {
  if (!safeUrl(p.mirror_url)) throw new Error('服务端未配置有效的镜像域名');
  const started = performance.now();
  const r = await fetch(p.mirror_url, { signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]), credentials: 'omit', cache: 'reload' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const blob = await r.blob(); if (!blob.size) throw new Error('图片内容为空');
  if (blob.type && !blob.type.startsWith('image/')) throw new Error('响应不是图片');
  const size = Number(r.headers.get('Content-Length'));
  if (size && !r.headers.get('Content-Encoding') && size !== blob.size) throw new Error('图片长度不完整');
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] === 255 && head[1] === 216) { const tail = new Uint8Array(await blob.slice(-2).arrayBuffer()); if (tail[0] !== 255 || tail[1] !== 217) throw new Error('JPEG 已截断'); }
  const bitmap = await createImageBitmap(blob); bitmap.close(); signal.throwIfAborted();
  p.bytes = blob.size; p.seconds = ((performance.now() - started) / 1000).toFixed(1);
}
async function warm(signal, failedOnly) {
  const queue = currentPhotos().filter(p => failedOnly ? p.status === 'failed' : p.selected && p.status !== 'success');
  if (!queue.length) { message('没有待预热的图片。'); return; }
  completed = 0; jobTotal = queue.length; let index = 0;
  message('正在预热 ' + jobTotal + ' 张图片…');
  async function worker() {
    while (index < queue.length && !signal.aborted) {
      const p = queue[index++]; p.status = 'running'; p.error = ''; p.bytes = 0; render();
      for (let attempt = 0; attempt < 2; attempt++) {
        try { await verify(p, signal); p.status = 'success'; p.error = ''; break; }
        catch (e) { if (signal.aborted) { p.status = 'pending'; break; } p.status = attempt === 1 ? 'failed' : 'running'; p.error = e instanceof TypeError ? '网络/CORS 或传输中断，未确认成功' : e.message; }
      }
      if (!signal.aborted) completed++; render(); message('预热进度 ' + completed + '/' + jobTotal);
    }
  }
  await Promise.all([worker(), worker()]);
  message(signal.aborted ? '已停止，未完成项可继续预热。' : '本轮结束：' + queue.filter(p => p.status === 'success').length + ' 张完整加载，' + queue.filter(p => p.status === 'failed').length + ' 张失败。');
}
$('load').onclick = () => job(load);
$('reset').onclick = () => job(signal => load(signal, Math.max(0, pageIndex), true));
$('prev').onclick = () => job(signal => load(signal, pageIndex - 1));
$('next').onclick = () => job(signal => load(signal, pageIndex + 1));
$('warm').onclick = () => job(signal => warm(signal, false)); $('retry').onclick = () => job(signal => warm(signal, true));
$('stop').onclick = () => controller?.abort();
$('all').onchange = () => { for (const p of currentPhotos()) p.selected = $('all').checked; render(); };
render();
</script></body></html>`;

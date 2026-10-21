// 本地静态服务器：仅用于在 http:// 源下跑交互测试（file:// 下 iframe 不能跨文档访问）。
// 用法：node tests/serve.mjs [根目录] [端口]
//   node tests/serve.mjs            # 默认把项目根目录挂到 8137
// 然后访问 http://127.0.0.1:8137/tests/e2e.html
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.argv[2] || join(here, '..'));
const port = Number(process.argv[3] || 8137);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png'
};

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = normalize(url).replace(/^([/\\])+/, '');
    const file = join(root, rel || 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log('serving ' + root + ' at http://127.0.0.1:' + port);
});

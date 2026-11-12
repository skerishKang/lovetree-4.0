// 로컬 시험용 정적 서버(#477). tools/postdeploy 검사를 배포 전에 같은 방식으로 돌리려고 쓴다.
// 사용: node tools/postdeploy/serve-dist.mjs <폴더> [포트]
// 브라우저·프로필은 만들지 않는다. 서버만 띄우고 PID를 출력한다(끝낼 때 그 PID만 종료).
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'dist');
const port = Number(process.argv[3] || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const direct = path.join(root, clean);
  const candidates = [direct, path.join(direct, 'index.html'), `${direct}.html`];
  for (const candidate of candidates) {
    if (!candidate.startsWith(root)) continue;
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {}
  }
  return null;
}

const server = createServer(async (req, res) => {
  const found = await resolveFile(req.url || '/');
  // API는 이 서버가 맡지 않는다. 셸이 계정을 못 읽는 로그아웃 상태 그대로 404를 준다.
  if (!found) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(found).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(found).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`serving ${root} at http://127.0.0.1:${port}/ (pid ${process.pid})`);
});

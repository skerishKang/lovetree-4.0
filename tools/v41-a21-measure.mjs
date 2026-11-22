// 첫 화면 첫 로딩 측정 도구. 셸 원본과 첫 화면 번들을 같은 조건으로 재고 겹치는 모듈을 찾는다.
// 사용: node tools/v41-a21-measure.mjs [--dist dist] [--label 현재] [--json out.json]
// 같은 스크립트를 임시 빌드 결과에도 돌려 현재와 묶은 뒤를 견준다.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { collect, SCREENS } from './v41-modulepreload.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const DIST = path.resolve(arg('dist', 'dist'));
const LABEL = arg('label', '현재');
const JSON_OUT = arg('json', '');

function workspace() {
  const t = { id: 't1', title: '측정 나무', moments: [
    { id: 'm1', title: '첫 순간', date: '2026-01-01', emotion: '설렘', note: '가짜 기록', parentId: null, url: '', x: 100, y: 100, rot: 0, color: 'rose', keywords: [] },
    { id: 'm2', title: '둘째 순간', date: '2026-01-02', emotion: '설렘', note: '가짜 기록', parentId: 'm1', url: '', x: 200, y: 150, rot: 0, color: 'sky', keywords: [] },
  ], edges: [{ id: 'e1', kind: 'parent', from: 'm1', to: 'm2', reason: '' }] };
  return { revision: 1, state: { version: 1, trees: [t], prefs: {} }, subject: 'a21-measure', writeSubjectBound: true, savedAt: '2026-11-20T00:00:00.000Z' };
}

function serve() {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    const wantsGzip = (req.headers['accept-encoding'] || '').includes('gzip');
    const compressible = /\.(?:html|js|mjs|css|json|svg)$/.test(clean);
    for (const file of [path.join(DIST, clean), path.join(DIST, clean, 'index.html')]) {
      if (path.relative(DIST, file).startsWith('..')) continue;
      try {
        const st = await fs.promises.stat(file);
        if (!st.isFile()) continue;
        const body = await fs.promises.readFile(file);
        const ext = path.extname(file).toLowerCase();
        const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' };
        if (compressible && wantsGzip && body.length > 512) {
          res.writeHead(200, { ...headers, 'content-encoding': 'gzip' });
          res.end(zlib.gzipSync(body));
        } else {
          res.writeHead(200, headers);
          res.end(body);
        }
        return;
      } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function measure(base, browser, login, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const url = login ? `${base}/v41/?account=1#home` : `${base}/v41/#home`;
  const ws = workspace();
  await page.route('**/api/**', async (route) => {
    const u = new URL(route.request().url());
    const same = u.origin === base;
    if (!same) return route.continue();
    if (!login) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unauthorized', message: '' } }) });
    if (u.pathname === '/api/account') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, subject: 'a21-measure' }) });
    if (u.pathname === '/api/workspace') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ws) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [] }) });
  });
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  const reqInfo = new Map();
  client.on('Network.requestWillBeSent', (e) => {
    reqInfo.set(e.requestId, { url: e.request.url });
  });
  const done = new Map();
  client.on('Network.loadingFinished', (e) => {
    const info = reqInfo.get(e.requestId);
    if (info) done.set(e.requestId, { url: info.url, encoded: e.encodedDataLength });
  });

  let frame = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < 80 && !frame; i++) {
      frame = page.frames().find((f) => f !== page.mainFrame() && /home\.html/.test(f.url()));
      if (!frame) await page.waitForTimeout(250);
    }
    if (frame) {
      await frame.waitForFunction(() => !!document.getElementById('orbit'), null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1500);
    } else {
      await page.waitForTimeout(2500);
    }
    const snap = [...done.values()].filter((x) => {
      try { const u = new URL(x.url); return u.origin === base && !u.pathname.startsWith('/api/'); } catch { return false; }
    });
    const totalReq = snap.length;
    const totalBytes = snap.reduce((a, x) => a + (x.encoded || 0), 0);
    const list = snap.map((x) => { const u = new URL(x.url); return { path: u.pathname, encoded: x.encoded || 0 }; }).sort((a, b) => b.encoded - a.encoded);
    return { login, width, height, requests: totalReq, bytes: totalBytes, list };
  } finally {
    await context.close().catch(() => {});
  }
}

function staticDuplicates() {
  const shell = new Set(collect(SCREENS[0]).map((f) => 'public/v41/' + f));
  const IMPORT_RE = /(?:^|[\n;}])\s*(?:import|export)\s*(?:[^'"()]*?\bfrom\s*)?['"]([^'"]+\.m?js)['"]/g;
  const resolve = (spec, fromFile) => {
    if (spec.startsWith('/v41/')) return 'public/v41/' + spec.slice(5);
    if (spec.startsWith('./') || spec.startsWith('../')) return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
    return null;
  };
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    if (!/^(v41|public\/v41|src)\//.test(file)) return;
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
    seen.add(file);
    const re = new RegExp(IMPORT_RE.source, 'g');
    let m;
    while ((m = re.exec(text))) {
      const s = m[1];
      if ((!s.endsWith('.mjs') && !s.endsWith('.js')) || s.includes('?')) continue;
      const t = resolve(s, file);
      if (t) visit(t);
    }
  };
  visit('v41/home.js');
  return [...seen].filter((f) => shell.has(f)).sort();
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'v41', 'home.html'))) throw new Error('빌드 결과가 없어 ' + DIST + ' 를 확인할 수 없습니다.');
  const dups = staticDuplicates();
  console.log('겹치는 모듈(이론)', dups.length, dups.join(','));
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const login of [false, true]) {
      for (const [w, h] of [[390, 844], [1440, 900]]) {
        const r = await measure(base, browser, login, w, h);
        const tag = (login ? '로그인' : '로그아웃') + ' ' + w;
        console.log(tag, '요청', r.requests, '바이트', r.bytes);
        results.push({ label: LABEL, ...r });
      }
    }
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
  const summary = { label: LABEL, dist: DIST, cases: results.map(({ list, ...rest }) => rest), duplicates: dups, lists: results.map((r) => ({ tag: (r.login ? '로그인 ' : '로그아웃 ') + r.width, list: r.list.slice(0, 20) })) };
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary.cases, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

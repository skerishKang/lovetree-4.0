#!/usr/bin/env node
// #1054: 운영 루트 문서가 가리키는 스타일·스크립트·미리 받기가 모두 맞는 종류로 200인지 미리보기 배포에서 잰다.
// 실제 Functions 경로를 그대로 호출해 <base href="/v41/">가 들어간 문서를 만들고, 그 상대 주소를 미리보기 자산에 대어 본다.
import { onRequest } from '../../functions/index.js';

const preview = (process.argv[2] || '').replace(/\/$/, '');
if (!preview) {
  console.error('사용: node tools/postdeploy/root-assets.mjs <미리보기 주소>');
  process.exit(2);
}

const v41 = await fetch(`${preview}/v41/`);
if (!v41.ok) {
  console.error(`/v41/ 문서를 읽지 못했다: ${v41.status}`);
  process.exit(1);
}
const assetHtml = await v41.text();
const env = { ASSETS: { fetch: async () => new Response(assetHtml, { headers: { 'content-type': 'text/html' } }) } };
const response = await onRequest({
  request: new Request('https://lovetree.padiem.net/'),
  next: () => new Response('legacy'),
  env
});
const html = await response.text();
const base = html.match(/<base\s+href="([^"]+)"/i)?.[1];
if (base !== '/v41/') {
  console.error(`루트 문서에 <base href="/v41/">가 없다: ${base ?? '없음'}`);
  process.exit(1);
}

const refs = [];
for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
  const rel = tag[0].match(/\brel="([^"]+)"/i)?.[1] || '';
  if (!/\b(stylesheet|modulepreload|preload|prefetch|manifest)\b/i.test(rel)) continue;
  const href = tag[0].match(/\bhref="([^"]+)"/i)?.[1];
  if (href) refs.push(href);
}
for (const tag of html.matchAll(/<script\b[^>]*>/gi)) {
  const src = tag[0].match(/\bsrc="([^"]+)"/i)?.[1];
  if (src) refs.push(src);
}

const bad = [];
for (const ref of refs) {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(ref)) continue;
  const url = new URL(ref, new URL(base, 'https://lovetree.padiem.net/'));
  const probe = await fetch(`${preview}${url.pathname}${url.search}`);
  const type = probe.headers.get('content-type') || '';
  const ok = probe.status === 200 && /(text\/css|javascript|application\/(?:manifest\+)?json)/i.test(type);
  if (!ok) bad.push({ ref, path: url.pathname, status: probe.status, type });
}
console.log(JSON.stringify({ refs: refs.length, bad: bad.length, base }));
for (const item of bad) console.error(JSON.stringify(item));
process.exit(bad.length ? 1 : 0);

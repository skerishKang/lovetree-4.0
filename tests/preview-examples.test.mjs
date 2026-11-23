import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPagesPreviewHost, isProductionHost } from '../public/v41/host-context.mjs';
import { withPreviewExamples, previewSamples, PREVIEW_MOMENTS } from '../public/v41/preview-examples.mjs';
import { quickPreviewNoticeText, QUICK_PREVIEW_NOTICE } from '../public/v41/quick-add.mjs';

const PREVIEW = '660970a2.lovetree-4-0.pages.dev';
const ROOT = 'lovetree-4-0.pages.dev';
const PROD = 'lovetree.padiem.net';

test('미리보기 호스트만 알아본다 — 운영 주소는 절대 미리보기가 아니다', () => {
  assert.equal(isProductionHost(PROD), true);
  assert.equal(isProductionHost(PREVIEW), false);
  assert.equal(isPagesPreviewHost(PREVIEW), true);
  assert.equal(isPagesPreviewHost(ROOT), true);
  assert.equal(isPagesPreviewHost(PROD), false);
  assert.equal(isPagesPreviewHost('www.lovetree.padiem.net'), false);
  assert.equal(isPagesPreviewHost('lovetree-4-0.pages.dev.evil.test'), false);
  assert.equal(isPagesPreviewHost(''), false);
});

test('미리보기에서만 예시 트리에 틱톡 2개와 릴스 1개를 얹는다', () => {
  const demoData = { moments: [{ id: 'm01', title: '원본 예시' }] };
  const tree = { id: 'limone-example', moments: [{ id: 'm01', title: '원본 예시' }], edges: [], demoData };
  const prod = withPreviewExamples(tree, PROD);
  assert.equal(prod, tree, '운영에서는 원본 객체를 그대로 쓴다');
  assert.equal(prod.moments.length, 1);

  const preview = withPreviewExamples(tree, PREVIEW);
  assert.equal(preview.moments.length, 4);
  assert.equal(preview.edges.length, 3);
  assert.deepEqual(preview.moments.slice(0, 3).map((m) => m.id), ['pv-tt-1', 'pv-tt-2', 'pv-ig-1']);
  assert.equal(preview.demoData.moments.length, 4);
  const tiktoks = preview.moments.filter((m) => String(m.url || '').includes('tiktok.com'));
  assert.equal(tiktoks.length, 2);
  assert.ok(tiktoks.every((m) => m.mediaMetadata?.title && m.mediaMetadata?.thumbnail && m.mediaMetadata?.tiktokId));
  const reel = preview.moments.find((m) => m.id === 'pv-ig-1');
  assert.match(reel.url, /instagram\.com\/reel\//);
  assert.equal(reel.mediaMetadata.thumbnail, undefined, '릴스는 썸네일 없는 글 카드');
  assert.equal(previewSamples(PROD).length, 0);
  assert.equal(previewSamples(PREVIEW).length, 3);
  assert.equal(PREVIEW_MOMENTS.every((m) => m.externalUrl === m.url), true, '보드도 링크를 읽을 수 있게');
});

test('정적 예시 데이터에는 릴스·틱톡 주소가 없다(운영에 섞이지 않는다)', () => {
  const samples = readFileSync(new URL('../src/views/orbit-samples.json', import.meta.url), 'utf8');
  const example = readFileSync(new URL('../public/v41/example.mjs', import.meta.url), 'utf8');
  for (const source of [samples, example]) {
    assert.doesNotMatch(source, /tiktok\.com/);
    assert.doesNotMatch(source, /instagram\.com/);
  }
});

test('미리보기 담기 안내는 플랫폼과 영상 번호만 보여 준다', () => {
  assert.equal(QUICK_PREVIEW_NOTICE, '체험 — 실제 담기는 로그인 뒤');
  assert.equal(quickPreviewNoticeText('TIKTOK', '7646985299326749983'), '체험 — 실제 담기는 로그인 뒤 · TIKTOK · 영상 7646985299326749983');
  assert.equal(quickPreviewNoticeText('TIKTOK', ''), '체험 — 실제 담기는 로그인 뒤 · TIKTOK');
  assert.equal(quickPreviewNoticeText(), '체험 — 실제 담기는 로그인 뒤');
});

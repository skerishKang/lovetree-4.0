import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPagesPreviewHost, isProductionHost, hasPreviewExamples } from '../public/v41/host-context.mjs';
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
  assert.equal(hasPreviewExamples(PREVIEW, '?lt791=1'), true);
  assert.equal(hasPreviewExamples(PREVIEW, ''), false);
  assert.equal(hasPreviewExamples(PROD, '?lt791=1'), false);
});

test('화면과 서버의 운영 호스트 정의가 같다', async () => {
  const { PRODUCTION_HOST: SERVER_HOST } = await import('../functions/_lib/search-meta.mjs');
  const { PRODUCTION_HOST } = await import('../public/v41/host-context.mjs');
  assert.equal(PRODUCTION_HOST, SERVER_HOST);
});

test('미리보기에서만 예시 트리에 틱톡 2개와 릴스 1개를 얹는다', () => {
  const demoData = { moments: [{ id: 'm01', title: '원본 예시' }] };
  const tree = { id: 'limone-example', moments: [{ id: 'm01', title: '원본 예시' }], edges: [], demoData };
  const prod = withPreviewExamples(tree, PROD);
  assert.equal(prod, tree, '운영에서는 원본 객체를 그대로 쓴다');
  assert.equal(prod.moments.length, 1);

  assert.equal(withPreviewExamples(tree, PREVIEW), tree, '질의 값이 없으면 자동 검사에서 예시를 넣지 않는다');
  const preview = withPreviewExamples(tree, PREVIEW, '?lt791=1');
  assert.equal(preview.moments.length, 4);
  assert.equal(preview.edges.length, 3);
  assert.deepEqual(preview.moments.slice(0, 3).map((m) => m.id), ['pv-tt-1', 'pv-tt-2', 'pv-ig-1']);
  assert.equal(preview.demoData.moments.length, 4);
  const tiktoks = preview.moments.filter((m) => String(m.url || '').includes('tiktok.com'));
  assert.equal(tiktoks.length, 2);
  assert.ok(tiktoks.every((m) => m.mediaMetadata?.title && m.mediaMetadata?.tiktokId && !m.mediaMetadata?.thumbnail));
  const reel = preview.moments.find((m) => m.id === 'pv-ig-1');
  assert.match(reel.url, /instagram\.com\/reel\//);
  assert.equal(reel.mediaMetadata.thumbnail, undefined, '릴스는 썸네일 없는 글 카드');
  assert.equal(previewSamples(PROD, '?lt791=1').length, 0, '운영에서는 질의 값이 있어도 예시 없음');
  assert.equal(previewSamples(PREVIEW).length, 0);
  assert.equal(previewSamples(PREVIEW, '?lt791=1').length, 3);
  assert.equal(PREVIEW_MOMENTS.every((m) => m.externalUrl === m.url), true, '보드도 링크를 읽을 수 있게');
});

test('체험 예시는 기본 예시 사진을 빌리지 않고 첫 순간 표시도 붙이지 않는다', () => {
  const samples = JSON.parse(readFileSync(new URL('../src/views/orbit-samples.json', import.meta.url), 'utf8'));
  assert.equal(samples.filter((m) => m.first === true).length, 1, '첫 순간 표시는 기본 예시 한 장만');
  assert.equal(samples[0].title, '첫인상');
  for (const moment of PREVIEW_MOMENTS) {
    assert.equal(moment.first, false, moment.id);
    assert.ok(!moment.image, '기본 예시 사진을 쓰지 않는다: ' + moment.id);
    assert.ok(!moment.mediaMetadata?.thumbnail, '저장된 썸네일도 없다: ' + moment.id);
    assert.ok(['TIKTOK', 'INSTAGRAM'].includes(moment.platform), moment.id);
  }
  for (const sample of previewSamples(PREVIEW, '?lt791=1')) {
    assert.ok(!sample.image, '궤도 앞줄 카드도 기본 사진을 쓰지 않는다: ' + sample.id);
    assert.equal(sample.first, false);
  }
});

test('정적 예시 데이터에는 릴스·틱톡 주소가 없다(운영에 섞이지 않는다)', () => {
  const samples = readFileSync(new URL('../src/views/orbit-samples.json', import.meta.url), 'utf8');
  const example = readFileSync(new URL('../public/v41/example.mjs', import.meta.url), 'utf8');
  for (const source of [samples, example]) {
    assert.doesNotMatch(source, /tiktok\.com/);
    assert.doesNotMatch(source, /instagram\.com/);
  }
});

test('첫 화면 앞줄은 체험 모드에서만 그리고 기본 궤도는 건드리지 않는다', () => {
  const orbit = readFileSync(new URL('../src/views/orbit.js', import.meta.url), 'utf8');
  assert.match(orbit, /const previewStripMarkup=previewStrip\.length\?/);
  assert.match(orbit, /const exampleSamples = samples;/);
  assert.match(orbit, /data-lt-preview-play/);
  assert.match(orbit, /lt-preview-mode/);
});

test('미리보기 담기 안내는 플랫폼과 영상 번호만 보여 준다', () => {
  assert.equal(QUICK_PREVIEW_NOTICE, '체험 — 실제 담기는 로그인 뒤');
  assert.equal(quickPreviewNoticeText('TIKTOK', '7646985299326749983'), '체험 — 실제 담기는 로그인 뒤 · TIKTOK · 영상 7646985299326749983');
  assert.equal(quickPreviewNoticeText('TIKTOK', ''), '체험 — 실제 담기는 로그인 뒤 · TIKTOK');
  assert.equal(quickPreviewNoticeText(), '체험 — 실제 담기는 로그인 뒤');
});

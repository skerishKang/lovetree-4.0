// #584 후속(2026-11-16 대표 지적): YouTube embed iframe에 referrerpolicy='no-referrer'를 두지 않는다 —
// no-referrer 는 YouTube 플레이어 구성 오류(오류 153)를 낸다. 썸네일 img의 no-referrer 는 그대로 둔다(다른 경로).
// iframe 생성(from createElement/<iframe)에서 referrerpolicy 를 지정하면 strict-origin-when-cross-origin 이어야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FILES = [
  'src/views/orbit.js',
  'public/v41/media-preview.js',
  'public/v41/views/book/book-extra.js',
  'public/v41/views/board/board-detail.js',
  'public/v41/views/shelf/shelf-reader.js'
];

const IFRAME_START = /createElement\((['"])iframe\1\)|<iframe/i;

test('youtube embed iframe에 no-referrer 금지(오류 153) — iframe 창(window)만 본다', () => {
  for (const rel of FILES) {
    const lines = readFileSync(new URL('../' + rel, import.meta.url), 'utf8').split(String.fromCharCode(10));
    for (let i = 0; i < lines.length; i++) {
      if (!IFRAME_START.test(lines[i])) continue;
      // iframe 생성 줄에서 최대 3줄(같은 문장의 속성 지정까지) — 그 안에 no-referrer 가 있으면 실패.
      // 주석 줄(// #584 설명 등)은 코드가 아니므로 뺀다 — 설명에 'no-referrer'라는 말이 나와도 괜찮다.
      const code = (l) => !/^\s*(\/\/|\*)/.test(l);
      const window = lines.slice(i, i + 4).filter(code).join(String.fromCharCode(10));
      assert.ok(!/no-referrer/.test(window), `${rel}:${i + 1} iframe에 no-referrer — YouTube 오류 153이 난다(strict-origin-when-cross-origin)`);
      // referrerpolicy 를 지정했다면 strict 이어야 한다(같은 창 안에서).
      const policy = window.match(/referrerpolicy\s*=\s*['"]([^'"]+)['"]/);
      if (policy) assert.equal(policy[1], 'strict-origin-when-cross-origin', `${rel}:${i + 1} iframe referrerpolicy 는 strict-origin-when-cross-origin`);
    }
  }
});

test('썸네일 img의 no-referrer 는 그대로다(다른 경로 — 건드리지 않는다)', () => {
  const orbit = readFileSync(new URL('../src/views/orbit.js', import.meta.url), 'utf8');
  assert.match(orbit, /youtubeThumb\?' referrerpolicy="no-referrer"'/, '첫 화면 카드 썸네일 img는 no-referrer 유지');
});
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTimeToSeconds, formatStart, parseMomentLink, describeLinkForField, mediaLinkView, UNRECOGNIZED_NOTE } from '../src/media.js';

test('시간 파싱은 러브버드 검증된 표를 그대로 쓴다', () => {
  assert.equal(parseTimeToSeconds('83'), 83);
  assert.equal(parseTimeToSeconds('1:23'), 83);
  assert.equal(parseTimeToSeconds('1m23s'), 83);
  assert.equal(parseTimeToSeconds('1:02:03'), 3723);
  assert.equal(parseTimeToSeconds('30초'), 30);
  assert.equal(parseTimeToSeconds('2분'), 120);
  assert.equal(parseTimeToSeconds('invalid'), null);
  assert.equal(parseTimeToSeconds('0'), null);
  assert.equal(parseTimeToSeconds('-5'), null);
  assert.equal(parseTimeToSeconds(''), null);
  assert.equal(parseTimeToSeconds('13시간'), null); // 12시간 상한 밖
});

test('시각 표기는 m:ss / h:mm:ss', () => {
  assert.equal(formatStart(83), '1:23');
  assert.equal(formatStart(3723), '1:02:03');
  assert.equal(formatStart(0), '');
  assert.equal(formatStart(null), '');
});

test('네 가지 YouTube 형태만 영상으로 본다', () => {
  const cases = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=83', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ']
  ];
  for (const [url, id] of cases) {
    const info = parseMomentLink(url);
    assert.equal(info.kind, 'youtube', url);
    assert.equal(info.videoId, id, url);
    assert.match(info.openUrl, /^https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ/);
  }
});

test('시작 위치는 t와 start 모두, 초·m:ss·hms를 가린다', () => {
  assert.equal(parseMomentLink('https://youtu.be/dQw4w9WgXcQ?t=83').startSeconds, 83);
  assert.equal(parseMomentLink('https://youtu.be/dQw4w9WgXcQ?t=1m23s').startSeconds, 83);
  assert.equal(parseMomentLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=90').startSeconds, 90);
  assert.equal(parseMomentLink('https://youtu.be/dQw4w9WgXcQ#t=83').startSeconds, 83);
  assert.equal(parseMomentLink('https://youtu.be/dQw4w9WgXcQ?t=0').startSeconds, null);
  const withStart = parseMomentLink('https://youtu.be/dQw4w9WgXcQ?t=1:23');
  assert.equal(withStart.openUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=83s');
  assert.equal(withStart.label, 'YouTube 링크 · 시작 1:23');
});

test('재생목록만 있는 링크와 닮은 호스트는 일반 링크로 보존한다', () => {
  const playlist = parseMomentLink('https://www.youtube.com/watch?list=PL1234567890');
  assert.equal(playlist.kind, 'link');
  assert.equal(playlist.openUrl, 'https://www.youtube.com/watch?list=PL1234567890');

  const lookalike = parseMomentLink('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ');
  assert.equal(lookalike.kind, 'link');
  assert.equal(lookalike.label, 'youtube.com.evil.example');

  const badId = parseMomentLink('https://youtu.be/shortid');
  assert.equal(badId.kind, 'link');

  const embed = parseMomentLink('https://www.youtube.com/embed/dQw4w9WgXcQ');
  assert.equal(embed.kind, 'link'); // 이번 조각이 여는 네 형태에 없다
});

test('안전하지 않은 입력은 거절하고 원본을 지우지 않는다', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'not a url', 'https://user:pass@example.com/x']) {
    const info = parseMomentLink(bad);
    assert.equal(info.kind, 'invalid', bad);
    assert.equal(info.original, bad.trim(), bad);
    assert.equal(info.openUrl, '', bad);
  }
  assert.equal(parseMomentLink('   ').kind, 'none');
  assert.equal(parseMomentLink('https://example.com/' + 'a'.repeat(2100)).kind, 'invalid');
  const plain = parseMomentLink('http://example.com/a');
  assert.equal(plain.kind, 'link');
  assert.equal(plain.label, 'example.com');
  assert.equal(plain.actionLabel, '원본 링크 열기');
});

test('작성창 안내는 톤과 문장을 같이 준다', () => {
  assert.deepEqual(describeLinkForField(''), { tone: 'idle', text: '' });
  assert.equal(describeLinkForField('javascript:alert(1)').tone, 'warn');
  const yt = describeLinkForField('https://youtu.be/dQw4w9WgXcQ?t=1:23');
  assert.equal(yt.tone, 'ok');
  assert.match(yt.text, /YouTube/);
  assert.match(yt.text, /1:23/);
  assert.equal(describeLinkForField('https://www.youtube.com/watch?v=dQw4w9WgXcQ').text, 'YouTube 링크로 저장해요');
  assert.match(describeLinkForField('https://example.com/x').text, /일반 링크/);
});

test('화면 표시는 href와 문장만 주고 원본은 노출하지 않는다', () => {
  assert.equal(mediaLinkView(''), null);
  const plain = mediaLinkView('https://example.com/a');
  assert.deepEqual(plain, { kind: 'link', href: 'https://example.com/a', text: '원본 링크 열기' });
  const yt = mediaLinkView('https://www.youtube.com/shorts/dQw4w9WgXcQ?t=90');
  assert.deepEqual(yt, { kind: 'youtube', href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s', text: 'YouTube에서 열기 · 시작 1:30' });
  const bad = mediaLinkView('javascript:alert(1)');
  assert.equal(bad.kind, 'invalid');
  assert.equal(bad.href, '');
  assert.equal(bad.text, UNRECOGNIZED_NOTE);
});

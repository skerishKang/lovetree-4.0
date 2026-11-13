import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDayMarkdown, renderIntroMarkdown, dayStamp, isOnDay } from '../tools/export-ai-customer.mjs';

test('dayStamp 는 YYMMDD(KST)', () => {
  assert.match(dayStamp(new Date('2026-11-14T00:00:00Z')), /^\d{6}$/);
  assert.equal(dayStamp(new Date('2026-11-14T00:00:00Z')), '261114');
});

test('isOnDay 는 KST 날짜로 견준다', () => {
  assert.equal(isOnDay('2026-11-14T02:00:00Z', '2026-11-14'), true); // KST 11:00 same day
  assert.equal(isOnDay('2026-11-13T20:00:00Z', '2026-11-14'), true); // KST 11-14 05:00
  assert.equal(isOnDay('2026-11-13T10:00:00Z', '2026-11-14'), false);
});

test('소개.md 형식: 이름 + 6개 항목', () => {
  const md = renderIntroMarkdown({ name: '윤제', intro: { who: '팬', why: '기록', how: '매일', satisfied: '좋음', disappointed: '없음', now: '쓰는 중' } });
  assert.match(md, /# 윤제 소개/);
  for (const label of ['누구', '왜 쓰나', '쓰는 모습', '만족한 점', '실망한 점', '지금 상태']) assert.ok(md.includes(label), label);
  assert.ok(md.includes('팬'));
});

test('일지.md 형식: 일지·의견·답글·이슈', () => {
  const posts = [
    { kind: 'journal', displayTitle: '오늘 기록', body: '좋았다', score: 5, status: 'received', replies: [{ authorType: 'internal', body: '내부 메모' }] },
    { kind: 'opinion', displayTitle: '버그', body: '넘김 멈춤', status: 'fixed', issueNumber: '#600', replies: [{ authorType: 'customer', body: '고쳤어요' }] }
  ];
  const md = renderDayMarkdown({ name: '윤제', day: '2026-11-14', posts });
  assert.match(md, /# 윤제 · 2026-11-14/);
  assert.match(md, /## 사용 일지/);
  assert.match(md, /## 의견/);
  assert.match(md, /다시 올 점수 5/);
  assert.match(md, /내부 메모: 내부 메모/);
  assert.match(md, /답변: 고쳤어요/);
  assert.match(md, /연결 이슈: #600/);
  // 계정·이메일은 내보내지 않는다.
  assert.doesNotMatch(md, /@/);
});
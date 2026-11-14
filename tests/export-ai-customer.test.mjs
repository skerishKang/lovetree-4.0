import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderDayMarkdown, renderIntroMarkdown, dayStamp, isOnDay, kstDay, parseExportJson, exportAll } from '../tools/export-ai-customer.mjs';
import { maskPersonal, parseEnvFile, TXN_BEGIN, TXN_COMMIT, TXN_ROLLBACK, QUERIES, buildExportJson } from '../tools/export-ai-customer-db.mjs';

test('dayStamp 는 YYMMDD(KST)', () => {
  assert.match(dayStamp(new Date('2026-11-14T00:00:00Z')), /^\d{6}$/);
  assert.equal(dayStamp(new Date('2026-11-14T00:00:00Z')), '261114');
});

test('kstDay 는 YYYY-MM-DD(KST)', () => {
  assert.equal(kstDay(new Date('2026-11-13T15:30:00Z')), '2026-11-14');
});

test('isOnDay 는 KST 날짜로 견준다', () => {
  assert.equal(isOnDay('2026-11-14T02:00:00Z', '2026-11-14'), true); // KST 11:00 same day
  assert.equal(isOnDay('2026-11-13T20:00:00Z', '2026-11-14'), true); // KST 11-14 05:00
  assert.equal(isOnDay('2026-11-13T10:00:00Z', '2026-11-14'), false);
});

test('소개.md 형식: 이름 + 7개 항목(#590 habits 포함, 운영센터와 같은 순서)', () => {
  const md = renderIntroMarkdown({ name: '윤제', intro: { who: '팬', why: '기록', how: '매일', habits: '매일 쓰는 곳: 유튜브, 네이버 카페\n익숙한 화면: 목록이 왼쪽', satisfied: '좋음', disappointed: '없음', now: '쓰는 중' } });
  assert.match(md, /# 윤제 소개/);
  for (const label of ['누구', '왜 쓰나', '쓰는 모습', '자주 쓰는 곳·익숙한 디자인', '만족한 점', '실망한 점', '지금 상태']) assert.ok(md.includes(label), label);
  assert.ok(md.includes('팬'));
  // habits 는 여러 줄 칸 — 줄바꿈이 살아 나온다(운영센터 폼의 rows 계산과 같은 값).
  assert.match(md, /\*\*자주 쓰는 곳·익숙한 디자인\*\*: 매일 쓰는 곳: 유튜브, 네이버 카페\n익숙한 화면: 목록이 왼쪽/);
  const empty = renderIntroMarkdown({ name: '빈고객', intro: {} });
  assert.match(empty, /\*\*자주 쓰는 곳·익숙한 디자인\*\*: —/);
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

// ── 컴2 판독기(tools/export-ai-customer-db.mjs) ─────────────────────────────

test('판독기 문장은 READ ONLY 트랜잭션과 SELECT 뿐이다', () => {
  assert.match(TXN_BEGIN, /READ ONLY/i);
  for (const sql of [TXN_BEGIN, TXN_COMMIT, TXN_ROLLBACK, ...Object.values(QUERIES)]) {
    assert.doesNotMatch(sql, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bALTER\b|\bDROP\b|\bTRUNCATE\b/i, sql.slice(0, 60));
  }
  assert.match(QUERIES.customers, /lovetree_ai_personas/);
  assert.match(QUERIES.customers, /ai_customer/);
  assert.match(QUERIES.posts, /lovetree_feedback/);
  // 받아온 글을 고객(subject)에 묶으려면 subject_id 칼럼이 결과에 있어야 한다(2026-11-14 빈 일지 사고).
  assert.match(QUERIES.posts, /SELECT f\.id, f\.subject_id/);
  assert.match(QUERIES.replies, /lovetree_feedback_replies/);
});

test('parseEnvFile 은 키·값을 읽고 주석·따옴표를 처리한다(값은 출력하지 않는다)', () => {
  const text = [
    '# 주석',
    'LOVETREE_DATABASE_URL="postgres://example:fake@127.0.0.1:5432/lovetree"',
    "LOVETREE_PRODUCT_ID='lovetree'",
    'LOVETREE_SESSION_SECRET=plain-value',
    '',
    'BROKEN_LINE_NO_EQUALS'
  ].join('\n');
  const parsed = parseEnvFile(text);
  assert.equal(parsed.LOVETREE_PRODUCT_ID, 'lovetree');
  assert.equal(parsed.LOVETREE_SESSION_SECRET, 'plain-value');
  assert.match(parsed.LOVETREE_DATABASE_URL, /127\.0\.0\.1:5432\/lovetree$/);
  assert.equal(Object.keys(parseEnvFile('')).length, 0);
});

test('maskPersonal 은 이메일·전화번호 꼴을 가린다', () => {
  assert.equal(maskPersonal('a@test.example 에게'), '[이메일] 에게');
  assert.equal(maskPersonal('010-1234-5678 로 연락'), '[전화번호] 로 연락');
  assert.equal(maskPersonal('그냥 글'), '그냥 글');
});

test('buildExportJson: API 응답 모양, subject·이메일·전화번호 없음, 답글 포함', () => {
  const personas = [
    { subject_id: 'subject-b', name: '다른고객', intro: {}, updated_at: '2026-11-13T09:00:00Z' },
    { subject_id: 'subject-a', name: '윤제', intro: { who: '팬 (who@test.example)', why: '기록' }, updated_at: '2026-11-13T09:00:00Z' }
  ];
  const posts = [
    { id: 12, subject_id: 'subject-a', kind: 'journal', category: 'other', title: '오늘 기록', body: '좋았다', score: 5, journal_date: '2026-11-14', context: { screen: 'home' }, status: 'received', memo: '내부 메모 01012345678', issue_number: null, created_at: '2026-11-14T00:30:00Z', updated_at: '2026-11-14T00:30:00Z' },
    { id: 7, subject_id: 'subject-a', kind: 'opinion', category: 'bug', title: '버그', body: '넘김 멈춤', score: null, journal_date: null, context: {}, status: 'fixed', memo: null, issue_number: '#600', created_at: '2026-11-13T01:00:00Z', updated_at: '2026-11-13T01:00:00Z' },
    { id: 30, subject_id: 'subject-none', kind: 'opinion', category: 'other', title: '페르소나 없는 글', body: '제외 대상', score: null, journal_date: null, context: {}, status: 'received', memo: null, issue_number: null, created_at: '2026-11-13T02:00:00Z', updated_at: '2026-11-13T02:00:00Z' }
  ];
  const replies = [
    { id: 9, post_id: 12, author_type: 'internal', author_subject_id: 'admin-subject', body: '내부 메모', created_at: '2026-11-14T01:00:00Z' },
    { id: 10, post_id: 7, author_type: 'customer', author_subject_id: 'admin-subject', body: '고쳤어요', created_at: '2026-11-13T03:00:00Z' }
  ];
  const json = buildExportJson({ personas, posts, replies, now: new Date('2026-11-14T00:00:00Z') });

  assert.equal(json.day, '2026-11-14');
  assert.deepEqual(json.customers.map(c => c.name), ['다른고객', '윤제']); // 이름 순, 내부 번호 부여
  assert.equal(json.customers[0].no, 1);
  assert.equal(json.customers[1].no, 2);

  const text = JSON.stringify(json);
  assert.doesNotMatch(text, /subject/i); // subject 계열 필드는 아예 없다
  assert.doesNotMatch(text, /@/); // 이메일 없음
  assert.ok(text.includes('[이메일]')); // intro 값도 같은 규칙으로 가려짐
  assert.ok(text.includes('[전화번호]')); // memo 도 가려짐
  assert.ok(!text.includes('subject-none')); // 페르소나 없는 글 제외

  const yunje = json.customers[1];
  assert.equal(yunje.posts.length, 2); // 오래된 것부터
  assert.deepEqual(yunje.posts.map(p => p.id), [7, 12]);
  const journal = yunje.posts[1];
  assert.equal(journal.kind, 'journal');
  assert.equal(journal.displayTitle, '오늘 기록');
  assert.equal(journal.journalDate, '2026-11-14');
  assert.equal(journal.authorName, '윤제');
  assert.equal(journal.replyCount, 1);
  assert.deepEqual(journal.replies, [{ id: 9, postId: 12, authorType: 'internal', body: '내부 메모', createdAt: '2026-11-14T01:00:00Z' }]);
  const opinion = yunje.posts[0];
  assert.equal(opinion.issueNumber, '#600');
  assert.deepEqual(opinion.replies.map(r => r.authorType), ['customer']);
});

// ── JSON 입력 → 거버넌스 md ────────────────────────────────────────────────

test('parseExportJson: JSON 검사와 오류 이유', () => {
  assert.throws(() => parseExportJson('아니다'), /JSON 이 아닙니다/);
  assert.throws(() => parseExportJson('{}'), /customers 목록이 없습니다/);
  assert.throws(() => parseExportJson('{"customers":[{"name":""}]}'), /이름이 없습니다/);
  const parsed = parseExportJson('{"day":"2026-11-14","customers":[{"no":3,"name":" 윤제 ","intro":null,"posts":null}]}');
  assert.deepEqual(parsed, { day: '2026-11-14', customers: [{ no: 3, name: '윤제', intro: {}, posts: [] }] });
  assert.equal(parseExportJson('{"customers":[{"name":"윤제"}]}').day, null); // day 없으면 컴1이 정한다
});

test('JSON 입력 → md: 그날 글만 일지로, 소개는 덮어쓴다', async () => {
  const json = buildExportJson({
    personas: [{ subject_id: 'subject-a', name: '윤제', intro: { who: '팬', why: '기록', how: '매일', satisfied: '좋음', disappointed: '없음', now: '쓰는 중' }, updated_at: '2026-11-13T09:00:00Z' }],
    posts: [
      { id: 12, subject_id: 'subject-a', kind: 'journal', category: 'other', title: '오늘 기록', body: '좋았다', score: 5, journal_date: '2026-11-14', context: {}, status: 'received', memo: null, issue_number: null, created_at: '2026-11-14T00:30:00Z', updated_at: '2026-11-14T00:30:00Z' },
      { id: 13, subject_id: 'subject-a', kind: 'journal', category: 'other', title: '어제 기록', body: '어제 글', score: 4, journal_date: '2026-11-13', context: {}, status: 'received', memo: null, issue_number: null, created_at: '2026-11-13T00:30:00Z', updated_at: '2026-11-13T00:30:00Z' }
    ],
    replies: [{ id: 9, post_id: 12, author_type: 'internal', author_subject_id: 'admin-subject', body: '내부 메모', created_at: '2026-11-14T01:00:00Z' }],
    now: new Date('2026-11-14T00:00:00Z')
  });
  const parsed = parseExportJson(JSON.stringify(json));
  const dir = mkdtempSync(path.join(tmpdir(), 'lt-export-'));
  const result = await exportAll({ data: parsed, dir, day: '2026-11-14' });
  assert.equal(result.customers, 1);
  assert.equal(result.posts, 2); // 고객이 가진 글 수(그날 필터는 일지 본문의 몫)
  assert.equal(result.written.length, 2);

  const dayFile = path.join(dir, '윤제', '일지_261114.md');
  assert.equal(existsSync(dayFile), true);
  const md = readFileSync(dayFile, 'utf8');
  assert.match(md, /# 윤제 · 2026-11-14/);
  assert.match(md, /오늘 기록/);
  assert.ok(!md.includes('어제 기록')); // 다른 날 글은 이 날 일지에 없다
  assert.match(md, /내부 메모: 내부 메모/);
  assert.doesNotMatch(md, /@/);
  assert.ok(readFileSync(path.join(dir, '윤제', '소개.md'), 'utf8').includes('# 윤제 소개'));
});

test('exportAll: 같은 이름 고객 둘이면 폴더가 겹치지 않는다', async () => {
  const data = {
    customers: [
      { no: 1, name: '윤제', intro: {}, posts: [] },
      { no: 2, name: '윤제', intro: {}, posts: [] }
    ]
  };
  const dir = mkdtempSync(path.join(tmpdir(), 'lt-export-'));
  const result = await exportAll({ data, dir, day: '2026-11-14' });
  assert.equal(existsSync(path.join(dir, '윤제')), true);
  assert.equal(existsSync(path.join(dir, '윤제_2')), true);
  assert.equal(result.written.length, 4);
});

#!/usr/bin/env node
// #540 2차 후속(2026-11-14) — AI 고객 내보내기 원본 판독기(컴2 WSL 안에서 실행).
//
// 운영 DB를 '읽기만' 해서 관리자 API(/api/admin/feedback·/api/admin/persona) 응답과 같은
// 모양의 JSON을 stdout 으로 내보낸다. 컴1은 이 JSON을 받아 tools/export-ai-customer.mjs
// --from-json 으로 거버넌스 md 를 쓴다. 관리자 세션 쿠키는 더는 쓰지 않는다.
//
// 접속 설정은 API 서비스와 같은 .env(LOVETREE_DATABASE_URL·LOVETREE_PRODUCT_ID)에서만 읽고,
// 값·접속 문자열·이메일·subject 는 stdout·stderr 어디에도 출력하지 않는다.
// 트랜잭션은 READ ONLY 로 열고 문장은 SELECT 뿐이다(고객 글 상태 등은 절대 바꾸지 않는다).
//
// 실행: /usr/local/bin/node /opt/padiem/lovetree-api/tools/export-ai-customer-db.mjs
// 환경변수: LOVETREE_API_ENV (기본 /opt/padiem/lovetree-api/.env)

import { readFile } from 'node:fs/promises';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g;
// 이메일·전화번호 꼴은 JSON 에 넣지 않는다(server/feedback-service.js maskPersonal 과 같은 규칙).
export function maskPersonal(text) {
  return String(text ?? '').replace(EMAIL, '[이메일]').replace(PHONE, '[전화번호]');
}

export const TXN_BEGIN = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY';
export const TXN_COMMIT = 'COMMIT';
export const TXN_ROLLBACK = 'ROLLBACK';

export const QUERIES = {
  // AI 고객 역할 계정(lovetree_product_roles) 중 페르소나가 있는 subject 만 고객으로 내보낸다.
  customers: `SELECT p.subject_id, p.name, p.intro, p.updated_at
    FROM lovetree_ai_personas p
    JOIN lovetree_product_roles r
      ON r.product_id = p.product_id AND r.subject_id = p.subject_id AND r.role = 'ai_customer'
    WHERE p.product_id = $1
    ORDER BY p.name, p.subject_id`,
  posts: `SELECT f.id, f.kind, f.category, f.title, f.body, f.score, f.journal_date, f.context,
         f.status, f.memo, f.issue_number, f.created_at, f.updated_at
    FROM lovetree_feedback f
    WHERE f.product_id = $1 AND f.subject_id = ANY($2)
    ORDER BY f.created_at, f.id`,
  replies: `SELECT id, post_id, author_type, body, created_at
    FROM lovetree_feedback_replies
    WHERE product_id = $1 AND post_id = ANY($2)
    ORDER BY created_at, id`
};

/** systemd EnvironmentFile 과 같은 모양의 .env 를 키·값 객체로 옮긴다(값은 절대 출력하지 않는다). */
export function parseEnvFile(text) {
  const out = {};
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

const iso = value => (value instanceof Date ? value.toISOString() : value ? String(value) : null);
const clean = value => String(value ?? '').replace(/\r\n/g, '\n');
const firstLine = (text, max = 120) => clean(text).split('\n').map(line => line.trim()).find(Boolean)?.slice(0, max) || '';

export function kstDay(date = new Date()) {
  return new Date(date.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 원본 행을 API 응답과 같은 모양(camelCase)으로 옮긴다. 이메일·subject 계열 필드는 아예 넣지 않고,
 *  고객 구분은 페르소나 이름과 내부 번호(no)만 둔다. */
export function buildExportJson({ personas, posts, replies, now = new Date() }) {
  const sorted = [...(personas || [])].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), 'ko') || String(a.subject_id ?? '').localeCompare(String(b.subject_id ?? '')));
  const customers = [];
  const bySubject = new Map();
  for (const row of sorted) {
    const intro = row.intro && typeof row.intro === 'object' && !Array.isArray(row.intro) ? row.intro : {};
    const customer = {
      no: customers.length + 1,
      name: clean(row.name).trim(),
      intro: Object.fromEntries(Object.entries(intro).map(([key, value]) => [key, typeof value === 'string' ? maskPersonal(value) : value])),
      posts: []
    };
    customers.push(customer);
    bySubject.set(row.subject_id, customer);
  }

  const repliesByPost = new Map();
  for (const row of replies || []) {
    const postId = Number(row.post_id);
    const list = repliesByPost.get(postId) || [];
    // 답글의 author_subject_id(내부 subject)는 넣지 않는다.
    list.push({ id: Number(row.id), postId, authorType: row.author_type, body: maskPersonal(clean(row.body)), createdAt: iso(row.created_at) });
    repliesByPost.set(postId, list);
  }

  for (const row of posts || []) {
    const customer = bySubject.get(row.subject_id);
    if (!customer) continue; // 페르소나 없는 subject 글은 내보내지 않는다.
    const body = maskPersonal(clean(row.body));
    const title = row.title ? maskPersonal(clean(row.title)) : null;
    const memo = row.memo ? maskPersonal(clean(row.memo)) : null;
    const postReplies = repliesByPost.get(Number(row.id)) || [];
    customer.posts.push({
      id: Number(row.id),
      kind: row.kind || 'opinion',
      category: row.category,
      title,
      displayTitle: title || firstLine(body),
      body,
      score: row.score === null || row.score === undefined ? null : Number(row.score),
      journalDate: row.journal_date ? iso(row.journal_date).slice(0, 10) : null,
      context: row.context && typeof row.context === 'object' ? row.context : {},
      status: row.status,
      memo,
      issueNumber: row.issue_number || null,
      authorName: customer.name,
      replyCount: postReplies.length,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      replies: postReplies
    });
  }
  for (const customer of customers) {
    customer.posts.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id - b.id));
  }
  return { kind: 'lovetree-ai-customer-export', day: kstDay(now), customers };
}

function fail(message, code) {
  // 이유는 한 줄만, 값은 없이.
  console.error(message);
  process.exit(code);
}

async function main() {
  const envPath = process.env.LOVETREE_API_ENV || '/opt/padiem/lovetree-api/.env';
  let parsed;
  try {
    parsed = parseEnvFile(await readFile(envPath, 'utf8'));
  } catch {
    fail('API .env 를 읽을 수 없습니다(경로·권한 확인).', 2);
    return;
  }
  const databaseUrl = parsed.LOVETREE_DATABASE_URL || '';
  const productId = parsed.LOVETREE_PRODUCT_ID || '';
  if (!databaseUrl) fail('DB 연결 설정(LOVETREE_DATABASE_URL)이 비어 있습니다.', 2);
  if (!productId) fail('제품 설정(LOVETREE_PRODUCT_ID)이 비어 있습니다.', 2);

  let pool;
  try {
    const pg = await import('pg');
    pool = new (pg.default ?? pg).Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 8000 });
  } catch (error) {
    fail('pg 모듈을 불러올 수 없습니다: ' + String(error?.message || error).slice(0, 160), 1);
    return;
  }

  const client = await pool.connect().catch(error => {
    const message = String(error?.message || error).replace(/postgres(ql)?:\/\/\S+/g, '[접속설정]');
    fail('DB 연결 실패: ' + message.slice(0, 160), 1);
    throw error; // 도달하지 않는다(fail 이 끝낸다).
  });
  try {
    await client.query(TXN_BEGIN);
    const personaRows = (await client.query(QUERIES.customers, [productId])).rows;
    const subjectIds = personaRows.map(row => row.subject_id);
    const postRows = subjectIds.length ? (await client.query(QUERIES.posts, [productId, subjectIds])).rows : [];
    const postIds = postRows.map(row => row.id);
    const replyRows = postIds.length ? (await client.query(QUERIES.replies, [productId, postIds])).rows : [];
    await client.query(TXN_COMMIT);
    const json = buildExportJson({ personas: personaRows, posts: postRows, replies: replyRows });
    process.stdout.write(JSON.stringify(json, null, 2) + '\n');
  } catch (error) {
    await client.query(TXN_ROLLBACK).catch(() => {});
    const message = String(error?.message || error)
      .replace(/postgres(ql)?:\/\/\S+/g, '[접속설정]')
      .split(databaseUrl).join('[접속설정]');
    fail('DB 읽기 실패: ' + message.slice(0, 160), 1);
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('export-ai-customer-db.mjs')) {
  main();
}

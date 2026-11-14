#!/usr/bin/env node
// #540 2차 — AI 고객 사이트 데이터를 거버넌스 md 로 내보낸다(매일 1회).
//
// 원본은 컴2 운영 DB다. 컴2의 읽기 전용 판독기(tools/export-ai-customer-db.mjs)가 JSON 을 내고
// 이 스크립트는 그 JSON 을 받아(--from-json <파일|->, '-' 는 stdin) 거버넌스
// <AI고객>/<이름>/일지_YYMMDD.md(그날 일지+의견+답글)와 소개.md(덮어씀)를 쓴다.
// 관리자 세션 쿠키 방식은 없다(2026-11-14 대표 결정: 쿠키 없이 컴2 DB에서). 비밀 값은 출력하지 않는다.
//
// 환경변수:
//   LOVETREE_EXPORT_DIR (기본 G:\Ddrive\BatangD\task\workdiary\ai-revenue-lab-governance\러브트리\AI고객)
//   LOVETREE_EXPORT_DAY YYYY-MM-DD (기본 JSON 의 day → 오늘, KST)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const KIND = { opinion: '의견', journal: '사용 일지' };
const STATUS = { received: '받음', reviewing: '확인 중', fixed: '고침', later: '다음에' };

export function dayStamp(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, '').slice(2); // YYMMDD
}

export function kstDay(date = new Date()) {
  return new Date(date.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function isOnDay(iso, day) {
  if (!iso) return false;
  const kst = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10) === day;
}

const clean = value => String(value ?? '').replace(/\r\n/g, '\n').trim();

export function renderIntroMarkdown(persona) {
  const intro = persona?.intro || {};
  const fields = [['who', '누구'], ['why', '왜 쓰나'], ['how', '쓰는 모습'], ['satisfied', '만족한 점'], ['disappointed', '실망한 점'], ['now', '지금 상태']];
  const body = fields.map(([key, label]) => `- **${label}**: ${clean(intro[key]) || '—'}`).join('\n');
  return `# ${clean(persona?.name) || 'AI 고객'} 소개\n\n${body}\n`;
}

export function renderDayMarkdown({ name, day, posts }) {
  const lines = [`# ${clean(name)} · ${day}`, ''];
  const journals = posts.filter(p => p.kind === 'journal');
  const opinions = posts.filter(p => p.kind !== 'journal');
  if (!posts.length) lines.push('_이 날 쓴 글이 없습니다._');
  if (journals.length) {
    lines.push('## 사용 일지', '');
    for (const p of journals) {
      lines.push(`### ${clean(p.displayTitle || p.title || '(제목 없음)')} · 다시 올 점수 ${p.score ?? '—'} · ${STATUS[p.status] || p.status}`, '', clean(p.body), '');
      for (const r of p.replies || []) if (r.authorType === 'internal') lines.push(`> 내부 메모: ${clean(r.body)}`, '');
    }
  }
  if (opinions.length) {
    lines.push('## 의견', '');
    for (const p of opinions) {
      lines.push(`### ${clean(p.displayTitle || p.title || '(제목 없음)')} · ${KIND[p.kind] || p.kind} · ${STATUS[p.status] || p.status}`, '', clean(p.body), '');
      for (const r of p.replies || []) lines.push(`- ${r.authorType === 'customer' ? '답변' : '내부 메모'}: ${clean(r.body)}`);
      if (p.status === 'fixed' && p.issueNumber) lines.push(`- 연결 이슈: ${clean(p.issueNumber)}`);
      lines.push('');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** 판독기 JSON 을 검사해 고객 목록으로 옮긴다. 이메일·subject 는 이미 없어야 하고, 없는 채로 둔다. */
export function parseExportJson(text) {
  let data;
  try { data = JSON.parse(String(text)); }
  catch { throw new Error('JSON 읽기 실패: 컴2 판독기 출력이 JSON 이 아닙니다.'); }
  if (!data || typeof data !== 'object' || !Array.isArray(data.customers)) {
    throw new Error('JSON 형식: customers 목록이 없습니다.');
  }
  const customers = data.customers.map((customer, index) => {
    if (!customer || typeof customer !== 'object' || typeof customer.name !== 'string' || !customer.name.trim()) {
      throw new Error(`JSON 형식: ${index + 1}번 고객 이름이 없습니다.`);
    }
    return {
      no: Number(customer.no) || index + 1,
      name: customer.name.trim(),
      intro: customer.intro && typeof customer.intro === 'object' ? customer.intro : {},
      posts: Array.isArray(customer.posts) ? customer.posts : []
    };
  });
  const day = typeof data.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.day) ? data.day : null;
  return { day, customers };
}

export async function exportAll({ data, dir, day }) {
  if (!data || !Array.isArray(data.customers)) throw new Error('내보낼 고객 데이터가 없습니다(--from-json).');
  const written = [];
  let postCount = 0;
  const usedDirs = new Set();
  for (const customer of data.customers) {
    postCount += customer.posts.length;
    // 같은 이름의 페르소나가 둘이면 폴더는 이름_내부번호로 겹치지 않게 한다.
    let dirName = customer.name;
    if (usedDirs.has(dirName.toLowerCase())) dirName = `${customer.name}_${customer.no}`;
    usedDirs.add(dirName.toLowerCase());
    const nameDir = path.join(dir, dirName);
    await mkdir(nameDir, { recursive: true });
    const dayFile = path.join(nameDir, `일지_${day.replace(/-/g, '').slice(2)}.md`);
    await writeFile(dayFile, renderDayMarkdown({ name: customer.name, day, posts: customer.posts.filter(p => isOnDay(p.createdAt, day)) }), 'utf8');
    const introFile = path.join(nameDir, '소개.md');
    await writeFile(introFile, renderIntroMarkdown(customer), 'utf8');
    written.push(dayFile, introFile);
  }
  return { written, customers: data.customers.length, posts: postCount };
}

async function main() {
  const args = process.argv.slice(2);
  let from = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from-json') from = args[i + 1] ?? '';
  }
  if (!from) {
    console.error('입력이 필요합니다: --from-json <파일|-> (컴2 판독기 tools/export-ai-customer-db.mjs 의 출력)');
    process.exit(2);
  }
  let text;
  try {
    text = from === '-' ? readFileSync(0, 'utf8') : await readFile(from, 'utf8');
  } catch {
    console.error('JSON 파일을 읽을 수 없습니다: ' + from);
    process.exit(2);
  }
  const data = parseExportJson(text);
  const dir = process.env.LOVETREE_EXPORT_DIR || 'G:\\Ddrive\\BatangD\\task\\workdiary\\ai-revenue-lab-governance\\러브트리\\AI고객';
  const day = process.env.LOVETREE_EXPORT_DAY || data.day || kstDay();
  const result = await exportAll({ data, dir, day });
  console.log(`exported customers=${result.customers} posts=${result.posts} files=${result.written.length}`);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('export-ai-customer.mjs')) {
  main().catch(error => { console.error(String(error?.message || error)); process.exit(1); });
}

#!/usr/bin/env node
// #540 2차 — AI 고객 사이트 데이터를 거버넌스 md 로 내보낸다(매일 1회).
//
// 원본은 사이트 DB. 이 스크립트는 관리자 권한 API(/api/admin/feedback, /api/admin/persona)를
// 읽어 거버넌스 <AI고객>/<이름>/일지_YYMMDD.md(그날 일지+의견+답글)와 소개.md(덮어씀)를 만든다.
// 예약 실행 등록은 대표 확인 뒤에 한다. 비밀 값(쿠키)은 출력하지 않는다.
//
// 환경변수:
//   LOVETREE_API_BASE   (기본 https://lovetree-4-0.pages.dev)
//   LOVETREE_EXPORT_COOKIE  관리자 세션 쿠키(필수)
//   LOVETREE_EXPORT_DIR (기본 G:\Ddrive\BatangD\task\workdiary\ai-revenue-lab-governance\러브트리\AI고객)
//   LOVETREE_EXPORT_DAY YYYY-MM-DD (기본 오늘, KST)

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const KIND = { opinion: '의견', journal: '사용 일지' };
const STATUS = { received: '받음', reviewing: '확인 중', fixed: '고침', later: '다음에' };

export function dayStamp(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, '').slice(2); // YYMMDD
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

async function api(base, cookie, path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { accept: 'application/json', cookie, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(path + ' → ' + response.status);
  return payload;
}

export async function exportAll({ base, cookie, dir, day }) {
  const list = await api(base, cookie, '/api/admin/feedback');
  const posts = Array.isArray(list?.feedback) ? list.feedback : [];
  // AI 고객 = 페르소나가 있는 subject.
  const subjects = [...new Set(posts.map(p => p.subjectId).filter(Boolean))];
  const personas = {};
  for (const subjectId of subjects) {
    const res = await api(base, cookie, '/api/admin/persona/' + encodeURIComponent(subjectId));
    if (res?.persona && res.persona.name) personas[subjectId] = res.persona;
  }
  const written = [];
  for (const subjectId of Object.keys(personas)) {
    const persona = personas[subjectId];
    const mine = posts.filter(p => p.subjectId === subjectId && isOnDay(p.createdAt, day));
    const nameDir = path.join(dir, persona.name);
    await mkdir(nameDir, { recursive: true });
    const dayFile = path.join(nameDir, `일지_${day.replace(/-/g, '').slice(2)}.md`);
    await writeFile(dayFile, renderDayMarkdown({ name: persona.name, day, posts: mine }), 'utf8');
    const introFile = path.join(nameDir, '소개.md');
    await writeFile(introFile, renderIntroMarkdown(persona), 'utf8');
    written.push(dayFile, introFile);
  }
  return { written, customers: Object.keys(personas).length, posts: posts.length };
}

async function main() {
  const base = process.env.LOVETREE_API_BASE || 'https://lovetree-4-0.pages.dev';
  const cookie = process.env.LOVETREE_EXPORT_COOKIE || '';
  const dir = process.env.LOVETREE_EXPORT_DIR || 'G:\\Ddrive\\BatangD\\task\\workdiary\\ai-revenue-lab-governance\\러브트리\\AI고객';
  const day = process.env.LOVETREE_EXPORT_DAY || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (!cookie) { console.error('LOVETREE_EXPORT_COOKIE 가 필요합니다(관리자 세션).'); process.exit(2); }
  const result = await exportAll({ base, cookie, dir, day });
  console.log(`exported customers=${result.customers} posts=${result.posts} files=${result.written.length}`);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('export-ai-customer.mjs')) {
  main().catch(error => { console.error(String(error?.message || error)); process.exit(1); });
}
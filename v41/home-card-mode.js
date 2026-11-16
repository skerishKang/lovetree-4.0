// 첫 화면 가운데 카드(최근 순간 카드)의 모드 — 순수 계산 한 벌(261116 PR 2, 대표 확정).
// 머리글('마지막 순간 · 오늘')을 눌러 마지막·고정·그날·무작위·트리를 고르고, 고른 값은
// 계정 설정(state.prefs.homeMoment)에 저장한다(이미 있는 설정 저장 길 — setPrefs).
// 저장 값의 규칙(normalizeHomeMoment)은 두 벌(src/domain.js·public/v41/domain.mjs)이 맡고,
// 여기서는 골라 보기·머리글 문구·숫자 줄이기만 다룬다. 조건·문구는 시험이 고정한다.
import {normalizeHomeMoment} from '../public/v41/domain.mjs';

export {normalizeHomeMoment};

// 기기 미러(셸이 저장·로그인 때 같이 쓴다). 첫 화면 문서는 계정 값을 늦게 알 수 있으므로
// 마지막 값을 기기에도 둔다 — dateStyle(#441 후속)·제목 보기(#481)와 같은 이유다.
export const HOME_MOMENT_KEY = 'lt41.homeMoment';

// 그릴 때 쓰는 값: 계정 설정(셸이 심어 둔 LT41.prefs)을 먼저 보고, 없으면 기기 미러, 없으면 기본(마지막).
export function readHomeMoment({prefs = null, storage = globalThis.localStorage} = {}) {
  let stored = null;
  try { stored = storage?.getItem(HOME_MOMENT_KEY) || null; } catch { stored = null; }
  if (stored) { try { stored = JSON.parse(stored); } catch { stored = null; } }
  return normalizeHomeMoment(prefs?.homeMoment ?? stored ?? undefined);
}

// 1,000↑ 1.2k · 1,000,000↑ 1.2m — 소수 한 자리, 1.0k→1k(261116 PR 2).
// 첫 화면 정보 줄(모아둔·전체·둘러보기·트리)과 트리 목록의 순간 수가 같은 한 벌을 쓴다.
const trimDecimal = x => { const s = x.toFixed(1); return s.endsWith('.0') ? s.slice(0, -2) : s; };
export function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e6) return trimDecimal(n / 1e6) + 'm';
  if (n >= 1e3) {
    const k = trimDecimal(n / 1e3);
    // 999,999처럼 k로 적으면 1000.0k가 되는 경계는 1m로 읽는다(1,000,000↑ 규칙과 이어지게).
    return k === '1000' ? '1m' : k + 'k';
  }
  return String(Math.round(n));
}

// 머리글 ▾ 목록. 고정한 순간은 걸어 둔 순간이 있을 때만 고를 수 있다(없으면 흐리게).
// trees는 momentListTrees 결과({id,label}) 그대로 — '특정 트리에서'의 아래 목록이 쓴다.
export function homeMomentMenu(value, {trees = []} = {}) {
  const current = normalizeHomeMoment(value);
  return [
    {mode: 'last', label: '마지막에 담은 순간'},
    {mode: 'pin', label: '고정한 순간', disabled: !current.momentId},
    {mode: 'day', label: '그날의 순간'},
    {mode: 'random', label: '무작위'},
    {mode: 'tree', label: '특정 트리에서', trees: (Array.isArray(trees) ? trees : []).map(tree => ({id: tree.id, label: tree.label}))}
  ];
}

// 오늘의 무작위 — 하루 동안은 같은 순간(다시 그려도 바뀌지 않게 오늘 날짜를 씨로 쓴다).
const daySeed = (now = new Date()) => `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
export function dailyIndex(length, seed = daySeed()) {
  if (!Number.isFinite(length) || length <= 0) return 0;
  let hash = 0;
  const text = String(seed);
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash % length;
}

// 그날의 순간 — 무대 날짜(m.date)가 1년 전 오늘·한 달 전 오늘인 순간(1년을 먼저 본다).
// 여러 장이면 가장 최근에 담은 것. 없으면 null(모드는 그대로 두고 카드는 마지막으로 돌아온다).
const pad2 = n => String(n).padStart(2, '0');
const isoOfDay = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export function homeDayMoment(trees, {now = new Date()} = {}) {
  const year = new Date(now); year.setFullYear(year.getFullYear() - 1);
  const month = new Date(now); month.setMonth(month.getMonth() - 1);
  const scan = key => {
    let best = null;
    for (const tree of Array.isArray(trees) ? trees : []) {
      if (!tree?.id || !Array.isArray(tree.moments)) continue;
      for (const moment of tree.moments) {
        if (!moment?.date || String(moment.date).slice(0, 10) !== key) continue;
        if (!best || String(moment.createdAt || '') > String(best.moment.createdAt || '')) best = {moment, treeId: tree.id};
      }
    }
    return best;
  };
  const one = scan(isoOfDay(year));
  if (one) return {treeId: one.treeId, id: one.moment.id, kind: 'year'};
  const two = scan(isoOfDay(month));
  if (two) return {treeId: two.treeId, id: two.moment.id, kind: 'month'};
  return null;
}

// 모드별 카드 순간과 머리글 문구. entries는 momentListEntries 결과(최근 순).
// 고를 수 없으면(걸어 둔 순간이 지워졌다든지) 마지막으로 돌아온다 — 카드가 빈 자리가 되지 않게 한다.
// header가 null이면 '마지막 순간' 기본 문구(궤도가 '· 오늘'을 붙인다)를 쓴다.
export function homeMomentPick(entries, value, {day = null, trees = [], seed} = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const current = normalizeHomeMoment(value);
  if (current.mode === 'pin' && current.momentId) {
    const pinned = list.find(entry => entry.treeId === current.treeId && entry.id === current.momentId);
    if (pinned) return {moment: pinned, header: '고정한 순간'};
  }
  if (current.mode === 'day' && day) {
    const picked = list.find(entry => entry.treeId === day.treeId && entry.id === day.id);
    if (picked) return {moment: picked, header: day.kind === 'month' ? '한 달 전 오늘' : '1년 전 오늘'};
  }
  if (current.mode === 'tree' && current.treeId) {
    const picked = list.find(entry => entry.treeId === current.treeId);
    if (picked) {
      const label = (trees.find(tree => tree.id === current.treeId) || {}).label || picked.treeLabel || picked.subject || '';
      return {moment: picked, header: label ? `${label}에서` : '그 트리에서'};
    }
  }
  if (current.mode === 'random' && list.length) {
    return {moment: list[dailyIndex(list.length, seed)], header: '오늘의 무작위'};
  }
  return {moment: list[0] || null, header: null};
}

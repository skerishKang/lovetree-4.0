// 새 소식(버전 업데이트 노트) — #611.
// 원본은 public/v41/updates.json 하나. 화면·알림 모두 이 파일을 읽는다.
// 마지막으로 본 버전은 서버 저장 없이 브라우저(localStorage, try/catch)에 둔다.
import { localDateOnly } from './local-date.mjs';

export const SEEN_KEY = 'lt41.updatesSeen';
// #638: '새로워졌어요' 카드는 하루에 한 번만 뜬다 — 같은 날 버전이 여러 번 올라가도(4.1.3→4.1.4)
// 두 번째부터는 카드 대신 점·새 소식 입구로만 알린다. 날짜는 기기의 지역 날짜(#547와 같은 규칙).
export const CARD_DAY_KEY = 'lt41.updatesCardDay';
const VERSION_RE = /^\d+\.\d+\.\d+$/;

export function validVersion(value) {
  return typeof value === 'string' && VERSION_RE.test(value.trim());
}

/** 버전 세 숫자를 n.m.p로 비교한다(-1/0/1). */
export function compareVersions(a, b) {
  const pa = String(a || '').split('.').map(Number);
  const pb = String(b || '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/** 가장 새 버전의 노트 항목(없으면 null). */
export function latestEntry(updates) {
  let best = null;
  for (const entry of Array.isArray(updates) ? updates : []) {
    if (!validVersion(entry?.version)) continue;
    if (!best || compareVersions(entry.version, best.version) > 0) best = entry;
  }
  return best;
}

/** 출처 한 줄. AI 테스터·실제 사용자 의견을 구분한다 — 출처 원칙(#611 댓글). */
export function sourceLabel(item) {
  if (!item || typeof item !== 'object') return '';
  if (item.source === 'ai_tester') return `AI 테스터가 찾아 준 것${item.tester ? ` · ${String(item.tester)}` : ''}`;
  if (item.source === 'user') return '사용자 의견으로 고친 것';
  return '';
}

export function readSeen(storage) {
  try {
    const value = storage?.getItem?.(SEEN_KEY);
    return validVersion(value) ? value.trim() : null;
  } catch {
    return null;
  }
}

export function markSeen(storage, version) {
  if (!validVersion(version)) return;
  try { storage?.setItem?.(SEEN_KEY, version.trim()); } catch { /* 저장소가 없으면 이번 접속만 알린다 */ }
}

const esc = value => String(value ?? '').replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));

/** 노트 목록을 쉬운 말 한 줄씩으로 그리는 조각. 버전·날짜·새로워진 것·고친 것 그대로만 쓴다.
 *  #638: '새로워진 것'·'고친 것' 제목은 한 버전에 한 번만 보인다. 출처 줄('AI 테스터가 찾아 준 것 · 이름')은
 *  같은 출처의 이웃 항목을 한 묶음으로 쳐서 그 묶음 끝 항목 아래에 작게 단다(12px — shell.css). */
export function renderUpdates(updates, activeVersion = '') {
  const entries = (Array.isArray(updates) ? updates : [])
    .filter(entry => validVersion(entry?.version))
    .slice()
    .sort((a, b) => compareVersions(b.version, a.version));
  if (!entries.length) return '<p class="panel-note">아직 새 소식이 없어요.</p>';
  return entries.map(entry => {
    const groups = [['new', '새로워진 것'], ['fix', '고친 것']]
      .map(([kind, title]) => {
        const rows = (Array.isArray(entry.items) ? entry.items : []).filter(item => item?.kind === kind);
        if (!rows.length) return '';
        const bundles = [];
        for (const item of rows) {
          const label = sourceLabel(item);
          const last = bundles[bundles.length - 1];
          if (last && last.label === label) last.items.push(item);
          else bundles.push({label, items: [item]});
        }
        // 묶음마다 제목을 다시 쓰지 않는다 — 한 칸(<section>)에 제목 하나·목록 하나, 출처는 묶음 끝 항목에 붙인다.
        const lines = bundles.map(bundle => bundle.items
          .map((item, i) => `<li>${esc(item.text)}${bundle.label && i === bundle.items.length - 1 ? `<small class="updates-source">${esc(bundle.label)}</small>` : ''}</li>`)
          .join('')).join('');
        return `<section class="updates-kind"><h3>${esc(title)}</h3><ul>${lines}</ul></section>`;
      }).join('');
    return `<section class="updates-version" data-updates-version="${esc(entry.version)}"${activeVersion === entry.version ? ' data-active="true"' : ''}>
      <h2 class="updates-version-title">러브트리 ${esc(entry.version)} <span>${esc(entry.date || '')}</span></h2>${groups}</section>`;
  }).join('');
}

async function defaultFetchJson() {
  const response = await fetch('/v41/updates.json', { headers: { accept: 'application/json' } });
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  return Array.isArray(body) ? body : null;
}

/**
 * 셸 배선. $는 문서 조회, showPanel은 셸의 공통 창 여는 함수.
 * onDot(unread)는 계정 단추 점 상태 보고 — 새 소식 점(#611).
 */
export function mountUpdates({ $, showPanel, fetchJson, storage, onDot }) {
  const load = typeof fetchJson === 'function' ? fetchJson : defaultFetchJson;
  const store = storage ?? (() => { try { return globalThis.localStorage; } catch { return null; } })();
  let cache = null;
  let cachePromise = null;
  let cardShown = false; // "접속 때 한 번"

  async function ensure() {
    if (cache !== null) return cache;
    if (!cachePromise) cachePromise = load().then(list => { cache = Array.isArray(list) ? list : []; return cache; }).catch(() => { cache = []; return cache; });
    return cachePromise;
  }

  function showCard(entry) {
    const card = $('updates-card');
    if (!card || cardShown) return;
    // #638: 하루에 한 번 — 같은 날 이미 카드를 본 접속이면 다시 띄우지 않는다(점은 그대로).
    const day = localDateOnly();
    if (!day) return; // 날짜를 알 수 없으면 기존 규칙(접속 때 한 번)만 쓴다
    let seenDay = '';
    try { seenDay = store?.getItem?.(CARD_DAY_KEY) || ''; } catch { seenDay = ''; }
    if (seenDay === day) return;
    cardShown = true;
    try { store?.setItem?.(CARD_DAY_KEY, day); } catch { /* 저장소가 없으면 이번 접속만 */ }
    const text = $('updates-card-text');
    if (text) text.textContent = `러브트리가 새로워졌어요 — ${entry.version}`;
    card.hidden = false;
  }

  function hideCard() {
    const card = $('updates-card');
    if (card) card.hidden = true;
  }

  // #625: 카드는 첫 화면(빈 주소·#home) 전용이다. 안쪽 화면(책·보드·지도·내 트리)은 상단 도구 줄과
  // 아래 컨트롤이 화면을 채워, 어떤 고정 위치도 단추를 가린다(390 실측: 카드 76~132 vs 책 '순간 목차' 64~110).
  // 첫 화면을 벗어나면 카드를 숨기고, 다시 첫 화면으로 와도 '접속 때 한 번' 규칙대로 다시 띄우지 않는다.
  const onHome = () => {
    const hash = globalThis.location?.hash || '';
    return !hash || hash === '#home';
  };
  const hideCardOffHome = () => { if (cardShown && !onHome()) hideCard(); };
  globalThis.addEventListener?.('hashchange', hideCardOffHome);

  async function start() {
    const list = await ensure();
    const latest = latestEntry(list);
    const seen = readSeen(store);
    const newer = !!latest && (!seen || compareVersions(latest.version, seen) > 0);
    if (typeof onDot === 'function') onDot(newer);
    // 첫 화면(빈 주소·#home)에서만 작은 카드를 보인다 — 책·보드·지도 같은 안쪽 화면의
    // 단추를 가려 막지 않는다. 점과 '새 소식' 입구는 그대로 남는다(지도 화면 시험이 막혔던 자리).
    const atHome = onHome();
    if (newer && latest && atHome) showCard(latest);
    return { latest: latest?.version || null, newer };
  }

  async function openUpdates(version) {
    const list = await ensure();
    const latest = latestEntry(list);
    const target = validVersion(version) ? version.trim() : (latest?.version || '');
    const host = $('updates-list');
    if (host) host.innerHTML = renderUpdates(list, target);
    if (typeof showPanel === 'function') showPanel('updates-panel');
    else $('updates-panel')?.showModal?.();
    if (target) {
      markSeen(store, target);
      const seen = readSeen(store);
      const newer = !!latest && compareVersions(latest.version, seen || '') > 0;
      if (typeof onDot === 'function') onDot(newer);
      hideCard();
      const section = globalThis.document?.querySelector?.(`[data-updates-version="${target}"]`);
      if (section) section.scrollIntoView?.({ block: 'start' });
    }
    return target;
  }

  $('updates-view')?.addEventListener?.('click', () => { void openUpdates(); });
  $('updates-dismiss')?.addEventListener?.('click', async () => {
    const list = await ensure();
    const latest = latestEntry(list);
    if (latest) markSeen(store, latest.version);
    hideCard();
    if (typeof onDot === 'function') onDot(false);
  });

  return { start, openUpdates };
}

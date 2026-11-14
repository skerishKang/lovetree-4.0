// 새 소식(버전 업데이트 노트) — #611.
// 원본은 public/v41/updates.json 하나. 화면·알림 모두 이 파일을 읽는다.
// 마지막으로 본 버전은 서버 저장 없이 브라우저(localStorage, try/catch)에 둔다.

export const SEEN_KEY = 'lt41.updatesSeen';
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

/** 노트 목록을 쉬운 말 한 줄씩으로 그리는 조각. 버전·날짜·새로워진 것·고친 것 그대로만 쓴다. */
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
        const lines = rows.map(item => {
          const label = sourceLabel(item);
          return `<li>${esc(item.text)}${label ? `<small class="updates-source">${esc(label)}</small>` : ''}</li>`;
        }).join('');
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
    cardShown = true;
    const text = $('updates-card-text');
    if (text) text.textContent = `러브트리가 새로워졌어요 — ${entry.version}`;
    card.hidden = false;
  }

  function hideCard() {
    const card = $('updates-card');
    if (card) card.hidden = true;
  }

  async function start() {
    const list = await ensure();
    const latest = latestEntry(list);
    const seen = readSeen(store);
    const newer = !!latest && (!seen || compareVersions(latest.version, seen) > 0);
    if (typeof onDot === 'function') onDot(newer);
    // 첫 화면(빈 주소·#home)에서만 작은 카드를 보인다 — 책·보드·지도 같은 안쪽 화면의
    // 단추를 가려 막지 않는다. 점과 '새 소식' 입구는 그대로 남는다(지도 화면 시험이 막혔던 자리).
    const hash = globalThis.location?.hash || '';
    const onHome = !hash || hash === '#home';
    if (newer && latest && onHome) showCard(latest);
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

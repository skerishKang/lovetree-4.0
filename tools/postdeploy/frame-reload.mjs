// #477: 프레임이 저절로 다시 뜨는 고장을 배포 직후에 잡는다.
// 2026-11-12 본 주소 사고: 첫 화면이 5초 동안 여러 번 다시 떠 카드가 자리를 못 잡았다(#476에서 수리).
// 여기서는 고장의 모양만 본다 — 화면을 연 뒤 5초 사이에 안쪽 프레임(#view, #view-next)이 몇 번
// 다시 떴는지 센다. 계정이 필요 없다(로그아웃 미리보기에서 돈다). 브라우저는 부르는 쪽(postdeploy)이 하나만 띄운다.

// 5초 동안 다시 뜬 횟수가 이 값을 넘으면 fail.
export const FRAME_RELOAD_LIMIT = 2;
// 사고 눈금: 2026-11-12 본 주소 사고는 초당 약 6회(5초에 약 30회)였다. README에 쓰는 비교값.
export const INCIDENT_RELOADS_PER_SECOND = 6;

// 검사할 화면. 셸의 화면 목록(public/v41/shell/navigation.mjs)과 같은 파일 이름을 쓴다.
export const RELOAD_SCREENS = [
  { key: 'home', file: 'src064-orbit.html', label: '첫 화면', tab: 'home' },
  { key: 'book', file: 'track59-sketchbook.html', label: '책', tab: 'book' },
  { key: 'board', file: 'track58-pinboard.html', label: '보드', tab: 'board' },
  { key: 'map', file: 'track56-network.html', label: '지도', tab: 'network' },
  { key: 'shelf', file: 'track32-bookshelf.html', label: '책장', tab: 'shelf' }
];

// 검사 이름. area='stability' + id='frame-reload-<화면>' 으로 보고된다(stability/frame-reload-home).
export const reloadCheckId = (key) => `frame-reload-${key}`;

// 안쪽 프레임. #view·#view-next 두 장이 교대한다(public/v41/shell/screens.mjs).
export function countFrameLoadsInPage() {
  if (window.__ltFrameLoads) return window.__ltFrameLoads;
  const log = { view: 0, 'view-next': 0, total: 0 };
  window.__ltFrameLoads = log;
  // about:blank 로 비우는 순간(screens.mjs revealFrame)은 '다시 뜬 것'이 아니다 — 주소가 있는 문서만 센다.
  const bump = (id) => {
    try {
      const el = document.getElementById(id);
      const href = el?.contentWindow?.location?.href || '';
      if (!href || href === 'about:blank') return;
      log[id] += 1;
      log.total += 1;
    } catch {}
  };
  for (const id of ['view', 'view-next']) {
    const el = document.getElementById(id);
    if (el) { el.addEventListener('load', () => bump(id)); bump(id); }
  }
  return log;
}

// 첫 화면(궤도)의 카드 상태. 카드는 그림자 DOM 안의 button.card다(src/views/orbit.js).
// - 배치 안 된 카드: 폭별 상한으로 숨긴 카드(display:none)는 빼고, transform이 비었거나 크기가 0인 카드를 센다
//   (궤도가 자리를 잡지 못한 모양 — 사고 직후 카드가 겹쳐 서거나 첫 화면이 비는 현상).
//   화면 밖으로 나간 카드는 세지 않는다: 궤도는 화면 밖 카드를 일부러 둔다(원래부터 그렇다).
// - 가운데 안전 구역 침범: .center 글상자(제목·문구·단추) 사각형 + 여백 32px(src/views/orbit.js measureSafeZone)와
//   겹친 카드. 궤도는 이 여유(추가 12px)까지 피해 민다.
// 궤도는 카드 네 귀퉁이를 투영한 사각형으로 안전 구역을 피해 밀어 낸다(src/views/orbit.js #429).
// 값이 늘 같게 기하로만 본다. `box`(궤도 크기)는 화면 크기를 진단에 남기려고 읽는다.
export function readHomeCardState() {
  const frame = document.getElementById('view');
  const host = frame?.contentDocument?.getElementById('orbit');
  const root = host?.shadowRoot;
  if (!root) return { ready: false, cards: 0, placed: 0, unplaced: 0, inSafeZone: 0, intake: [] };
  const box = host.getBoundingClientRect();
  const centerBox = root.querySelector('.center')?.getBoundingClientRect();
  // 안전 구역 = .center + 32px(궤도가 쓰는 여유). 궤도는 여기에 12px를 더해 민다.
  const SAFE_MARGIN = 32;
  const safe = centerBox ? { left: centerBox.left - SAFE_MARGIN, top: centerBox.top - SAFE_MARGIN, right: centerBox.right + SAFE_MARGIN, bottom: centerBox.bottom + SAFE_MARGIN } : null;
  let cards = 0, placed = 0, unplaced = 0, inSafeZone = 0;
  const intake = [];
  for (const card of root.querySelectorAll('button.card')) {
    if (card.style.display === 'none') continue; // 폭별 상한으로 숨긴 카드(#429)
    cards += 1;
    const transform = (card.style.transform || '').trim();
    const rect = card.getBoundingClientRect();
    if (!transform || !(rect.width > 2 && rect.height > 2)) {
      unplaced += 1;
      if (intake.length < 6) intake.push({ why: 'unplaced', hasTransform: !!transform, w: Math.round(rect.width), h: Math.round(rect.height) });
      continue;
    }
    placed += 1;
    if (!safe) continue;
    // 카드 사각형: 화면에 실제로 그려진 사각형(getBoundingClientRect)을 그대로 쓴다.
    // 궤도는 rotateX·rotateY·rotateZ·scale·원근을 합성해 놓고, 그 결과가 이 값이다(추측 계산보다 정확하다).
    const r = rect;
    if (r.left < safe.right && r.right > safe.left && r.top < safe.bottom && r.bottom > safe.top) {
      inSafeZone += 1;
      if (intake.length < 6) intake.push({ why: 'safe-zone', card: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }, safe: { l: Math.round(safe.left), t: Math.round(safe.top), r: Math.round(safe.right), b: Math.round(safe.bottom) } });
    }
  }
  return { ready: true, cards, placed, unplaced, inSafeZone, intake, viewport: { w: Math.round(box.width), h: Math.round(box.height) } };
}

export const FRAME_LOAD_COUNTER = `(${countFrameLoadsInPage.toString()})()`;
export const HOME_CARD_STATE = `(${readHomeCardState.toString()})()`;

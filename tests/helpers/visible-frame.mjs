// 셸은 iframe 두 장(#view·#view-next)을 번갈아 쓴다 — 화면을 넘길 때 새 장이 'view'라는 id를 받고,
// 넘기기 직전에는 새 화면이 아직 '#view-next'에 있다. 그래서 '#view 한 장'만 보면 화면이 넘어간 뒤에도
// 낡은 장(숨은 장)을 보거나, 숨은 장의 상자 크기(0)를 재는 일이 생긴다(#982).
// 여기서는 언제나 '지금 보이는 쪽'을 고른다. 아래 함수들은 모두 페이지 안에서 실행된다(바깥 변수를 쓰지 않는다).
export const VISIBLE_FRAME = `[...document.querySelectorAll('#view, #view-next')].find(f => !f.hidden && f.getClientRects().length > 0)`;

// 지금 보이는 프레임의 주소·id·보임 여부. patterns에 정규식 문자열을 주면 그 조건의 통과 여부를 ok로 돌려준다.
export const frameState = (patterns = {}) => {
  const frame = [...document.querySelectorAll('#view, #view-next')].find(f => !f.hidden && f.getClientRects().length > 0);
  let path = '';
  try { path = frame?.contentWindow?.location?.pathname || ''; } catch { path = ''; }
  const okHash = !patterns.hash || new RegExp(patterns.hash).test(location.hash);
  const okPath = !patterns.path || (!!path && new RegExp(patterns.path).test(path));
  return {ok: okHash && okPath, hash: location.hash, path, id: frame?.id || ''};
};

// 화면이 실제로 넘어갈 때까지 기다린다: 주소(hash)와 '보이는 쪽' 프레임의 주소(path)를 함께 본다.
// 시간 한도는 부르는 쪽에서 정한다(늘리지 않는다).
export async function waitForShownScreen(page, patterns = {}, timeout = 15000) {
  await page.waitForFunction(({hash, path}) => {
    const frame = [...document.querySelectorAll('#view, #view-next')].find(f => !f.hidden && f.getClientRects().length > 0);
    if (!frame) return false;
    let current = '';
    try { current = frame.contentWindow.location.pathname; } catch { return false; }
    if (hash && !new RegExp(hash).test(location.hash)) return false;
    if (path && !new RegExp(path).test(current)) return false;
    return true;
  }, {hash: patterns.hash || '', path: patterns.path || ''}, {timeout});
}

// 지금 보이는 프레임 안에서 잰다(숨은 장이 아니라 사용자가 보는 쪽).
// src는 '문자열 식'이다 — document(=보이는 프레임의 문서)와 arg를 쓴다.
export async function readShownFrame(page, src, arg) {
  return page.evaluate(({src, arg}) => {
    const frame = [...document.querySelectorAll('#view, #view-next')].find(f => !f.hidden && f.getClientRects().length > 0);
    if (!frame) throw new Error('보이는 프레임이 없다');
    return new Function('document', 'arg', 'return (' + src + ');')(frame.contentDocument, arg);
  }, {src, arg});
}

// 보이는 프레임의 상자(숨은 장은 크기가 0이라 상자를 재면 안 된다).
export async function shownFrameBox(page) {
  return page.evaluate(() => {
    const frame = [...document.querySelectorAll('#view, #view-next')].find(f => !f.hidden && f.getClientRects().length > 0);
    if (!frame) return null;
    const r = frame.getBoundingClientRect();
    return {x: r.x, y: r.y, width: r.width, height: r.height};
  });
}

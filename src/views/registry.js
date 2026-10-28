/**
 * 화면 등록표 — 경로 하나를 화면 하나로 해석한다.
 *
 * 각 항목은 `{ id, matches(route), activate() }` 이고, `activate()`는 그 화면을
 * 붙인 뒤 **dispose 함수**(없으면 undefined)를 돌려준다. 호출자는 이전 화면을
 * dispose 한 뒤 새 화면을 activate 한다 — 새 host에 mount 하는 생명주기 계약
 * (`lifecycle.js`)과 같은 규칙이다.
 *
 * 먼저 선언된 항목이 이긴다(현재 render()의 if/else 순서와 같다). 마지막 항목은
 * 어떤 경로든 받는 대체 화면이어야 하고, id는 중복될 수 없다.
 */
export function createScreenRegistry(screens) {
  if (!Array.isArray(screens) || !screens.length) throw new TypeError('화면 등록표가 필요해요.');
  const seen = new Set();
  for (const screen of screens) {
    if (!screen || typeof screen !== 'object') throw new TypeError('화면 항목이 올바르지 않아요.');
    if (typeof screen.id !== 'string' || !screen.id) throw new TypeError('화면 id가 필요해요.');
    if (seen.has(screen.id)) throw new Error(`화면 id가 중복됐어요: ${screen.id}`);
    seen.add(screen.id);
    if (typeof screen.matches !== 'function' || typeof screen.activate !== 'function') {
      throw new TypeError(`${screen.id}: matches와 activate가 필요해요.`);
    }
  }
  const fallback = screens[screens.length - 1];
  if (fallback.matches('') !== true && fallback.matches('\u0000') !== true) {
    throw new Error(`${fallback.id}: 마지막 화면은 모든 경로를 받는 대체 화면이어야 해요.`);
  }
  return {
    ids: screens.map(screen => screen.id),
    resolve(route) {
      const found = screens.find(screen => screen.matches(route));
      if (!found) throw new Error(`경로에 맞는 화면이 없어요: ${route}`);
      return found;
    }
  };
}

/**
 * 화면 등록표 — 경로 하나를 화면 하나로 해석한다.
 *
 * 각 항목은 `{ id, activate() }` 와 둘 중 하나를 갖는다.
 *   - `matches(route)`: 자기가 받는 경로를 판정한다.
 *   - `fallback: true`: 위 어느 항목도 받지 않은 경로를 모두 받는다. 정확히 하나만 둔다.
 *
 * `activate()`는 그 화면을 붙인 뒤 **dispose 함수**(없으면 undefined)를 돌려준다.
 * 호출자는 이전 화면을 dispose 한 뒤 새 화면을 activate 한다 — 새 host에 mount 하는
 * 생명주기 계약(`lifecycle.js`)과 같은 규칙이다.
 *
 * 경로 누락은 `matches` 술어를 표본 경로로 찔러보는 대신 **표시**로 막는다. 술어의
 * 전칭성을 검사할 방법이 없기 때문이다. 대신 `resolve()`는 어떤 경로에도 화면을
 * 돌려준다(대체 화면). id는 중복될 수 없다.
 */
export function createScreenRegistry(screens) {
  if (!Array.isArray(screens) || !screens.length) throw new TypeError('화면 등록표가 필요해요.');
  const seen = new Set();
  let fallback = null;
  for (const screen of screens) {
    if (!screen || typeof screen !== 'object') throw new TypeError('화면 항목이 올바르지 않아요.');
    if (typeof screen.id !== 'string' || !screen.id) throw new TypeError('화면 id가 필요해요.');
    if (seen.has(screen.id)) throw new Error(`화면 id가 중복됐어요: ${screen.id}`);
    seen.add(screen.id);
    if (typeof screen.activate !== 'function') throw new TypeError(`${screen.id}: activate가 필요해요.`);
    if (screen.fallback === true) {
      if (fallback) throw new Error(`대체 화면은 하나만 둘 수 있어요: ${fallback.id}, ${screen.id}`);
      fallback = screen;
      continue;
    }
    if (typeof screen.matches !== 'function') throw new TypeError(`${screen.id}: matches나 fallback 표시가 필요해요.`);
  }
  if (!fallback) throw new Error('모든 경로를 받는 대체 화면(fallback: true)이 필요해요.');
  return {
    ids: screens.map(screen => screen.id),
    resolve(route) {
      return screens.find(screen => !screen.fallback && screen.matches(route)) ?? fallback;
    }
  };
}

// 로고(LoveTree 4.1)는 주소가 그대로여도 첫 화면으로 가야 한다(2026-11-17 실측).
// 예전에는 href="#home"의 hashchange에만 의존했으므로, 서재처럼 주소가 남는 화면에서 눌러도 반응이 없었다.
// 클릭을 직접 받아 ① 열린 창을 규칙대로 닫고 ② 첫 화면을 보여 주고 ③ 주소를 #home으로 pushes한다.
const HOME_FILE = 'src064-orbit.html';
const HOME_HASH = '#home';

export function createHomeLink(deps) {
  const $ = deps.$;
  const getCurrent = deps.getCurrent;
  const show = deps.show;
  const closePanels = deps.closePanels;
  const setHomeHash = deps.setHomeHash;
  const scrollToTop = deps.scrollToTop;

  function goHome(event) {
    event?.preventDefault?.();
    if (closePanels && closePanels() === false) return false;
    if (getCurrent() === HOME_FILE) scrollToTop?.();
    else show(HOME_FILE, false);
    setHomeHash?.(HOME_HASH);
    return true;
  }

  function mount() {
    const brand = document.querySelector?.('.brand');
    if (!brand) return false;
    brand.addEventListener('click', goHome);
    return true;
  }

  return {goHome, mount};
}

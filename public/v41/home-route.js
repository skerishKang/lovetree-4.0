/* #1395: 주소 꼬리가 첫 화면(src064-orbit.html)로 끝나는지 미리 판단한다.
   규칙은 selection-location.mjs의 parseSelectionRoute와 shell/navigation.mjs의 screens를 그대로 옮긴다.
   첫 그리기 전에 몸체 클래스를 정해야 하므로 모듈이 아닌 고전 스크립트로 제공한다.
   시험이 셸 판정과 같은지 고정한다(목록이 바뀌면 시험이 깨진다). */
(function () {
  const VIEWS = ['home', 'shelf', 'tree', 'book', 'board', 'network', 'graph'];
  const VIEW_ALIASES = { map: 'network' };
  const viewName = value => {
    const view = VIEW_ALIASES[value] || value;
    return VIEWS.includes(view) ? view : 'home';
  };
  function isHomeHash(hash) {
    const raw = String(hash == null ? '' : hash).replace(/^#/, '');
    const path = raw.split('?', 2)[0];
    if (path.startsWith('my/')) return viewName(path.slice(3)) === 'home';
    if (path.startsWith('share/')) return viewName(path.split('/')[2] || 'book') === 'home';
    return viewName(path) === 'home';
  }
  globalThis.LT41_HOME_HASH = Object.freeze({ isHomeHash, viewName, VIEWS: VIEWS.slice(), VIEW_ALIASES: { ...VIEW_ALIASES } });
})();

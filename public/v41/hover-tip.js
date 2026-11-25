// 화면 공통 마우스 올림 설명 가드(#1288). 보드·책 스크립트가 일반 스크립트라 전역에 올린다.
// 휴대폰(마우스 없는 기기)에서는 올림 설명을 띄우지 않고, 페이지로 돌아오면 남은 말풍선을 감춘다.
(function () {
  function isHoverDevice(query) {
    try {
      var ask = query || function (text) { return globalThis.matchMedia && globalThis.matchMedia(text).matches; };
      return ask('(hover: hover)') === true;
    } catch {
      return false;
    }
  }
  function hideHoverTips(doc) {
    var root = doc || globalThis.document;
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('.lt-tip-bubble').forEach(function (bubble) { bubble.hidden = true; });
  }
  function onPageShow(event) {
    if (event && event.persisted === false) return;
    hideHoverTips();
  }
  function mountHoverTipGuard(doc) {
    var root = doc || globalThis.document;
    if (!root || typeof root.addEventListener !== 'function') return;
    root.addEventListener('pageshow', onPageShow);
    if (globalThis.addEventListener) globalThis.addEventListener('focus', hideHoverTips);
  }
  var api = { isHoverDevice: isHoverDevice, hideHoverTips: hideHoverTips, mountHoverTipGuard: mountHoverTipGuard };
  (globalThis.window || globalThis).LTHoverTip = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

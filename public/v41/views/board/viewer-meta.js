// 크게 보기(순간 뷰어)의 메타 줄 한 벌(#1273 2번).
// 보드 스크립트가 일반 스크립트라 전역에 올린다(모듈 import를 쓰지 않는다).
// 화면에 보이는 낱말은 한국어만 쓴다(브랜드 이름은 그대로). 값이 빈 줄은 아예 만들지 않는다.
// 인자는 이미 화면 규칙으로 이스케이프한 문자열이다(호출부의 esc 결과를 그대로 받는다).
(function () {
  function viewerMetaHTML({ head, source = '', url = '', keywords = [], memo = '', mediaTitle = '' }) {
    const rows = [head];
    if (source) rows.push('출처: ' + source);
    if (url) rows.push('주소: ' + url);
    const tags = (Array.isArray(keywords) ? keywords : []).filter(Boolean);
    if (tags.length) rows.push('꼬리표: ' + tags.map((tag) => '#' + tag).join(' '));
    if (memo) rows.push('마음 한마디: ' + memo);
    return (mediaTitle ? '<div class="videoTitle">▶ ' + mediaTitle + '</div>' : '') + rows.join('<br>');
  }
  (globalThis.window || globalThis).viewerMetaHTML = viewerMetaHTML;
})();

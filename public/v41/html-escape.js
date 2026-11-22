// A-15: HTML 글자 막기 한 벌. 일반 스크립트와 모듈이 같은 함수를 쓰게 전역에 등록한다.
// html-escape.mjs가 이 파일을 import해 모듈 쓰는 곳에 같은 값을 내보낸다.
(function () {
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  if (typeof globalThis !== 'undefined') globalThis.LTEscapeHtml = escapeHtml;
})();

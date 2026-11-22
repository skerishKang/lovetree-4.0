// A-15: HTML 글자 막기 모듈 진입점. 일반 스크립트 정본(html-escape.js)과 같은 규칙을 쓴다.
// 예전에는 이 파일이 정본을 다시 import해 같은 주소를 두 번 받았다 — 모듈 쪽에서 직접 정의한다.
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[ch]);
export { escapeHtml };
export default escapeHtml;

// #1062 B-03: 서버 오류 기록은 원인만 남긴다. 요청 본문·식별자·토큰은 싣지 않는다.
// 이름·코드·메시지·스택 첫 칸(위치)만 한 줄로 남기고, 메시지와 위치에서
// 이메일·주소(비밀값/DB 접속 문자열)·키=값·긴 토큰을 지운다.
const URL_VALUE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>\]]+/gi;
const EMAIL = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
const KEY_VALUE = /\b[\w-]{1,40}=[^\s,;]{4,}/g;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{24,}\b/g;

function scrub(value) {
  return String(value ?? '')
    .replace(URL_VALUE, '[주소]')
    .replace(EMAIL, '[이메일]')
    .replace(KEY_VALUE, '[값]')
    .replace(LONG_TOKEN, '[토큰]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 240);
}
function safeCode(value) {
  return String(value ?? '').replace(/[^\w.-]/g, '').slice(0, 80);
}
function firstFrame(error) {
  const frame = String(error?.stack || '').split('\n')[1] || '';
  return scrub(frame.trim().replace(/^at\s+/, '')) || '-';
}

export function logServerError(error, scope = 'server') {
  const record = {
    event: 'server_500',
    scope: safeCode(scope) || 'server',
    name: safeCode(error?.name) || 'Error',
    code: safeCode(error?.code) || '-',
    message: scrub(error?.message),
    at: firstFrame(error)
  };
  console.error(JSON.stringify(record));
}

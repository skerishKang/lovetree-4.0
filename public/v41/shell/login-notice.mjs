// #1175: 로그인 콜백이 실패해 /v41/로 돌아온 경우의 한 줄 안내.
// 실패 사유는 서버 로그에만 남기고, 브라우저에는 문구와 다시 로그인 길만 보여 준다.
export const LOGIN_NOTICE_PARAM = 'loginNotice';
export const LOGIN_NOTICE_TEXT = '로그인이 끊겼어요. 다시 로그인해 주세요.';
export const LOGIN_NOTICE_BUTTON = '다시 로그인';

export function loginNoticeFrom(search) {
  try { return new URLSearchParams(search).get(LOGIN_NOTICE_PARAM) === '1'; }
  catch { return false; }
}

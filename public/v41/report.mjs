// #1072 A-16: 화면 공용 오류 기록 — report(error, where) 한 곳.
// - 콘솔에 한 줄을 남긴다(개발자 도구에서 바로 본다).
// - 메모리에는 '최근 20건'만 둔다. 한 건은 메시지·위치·시각뿐이다 — 값·토큰·메일 주소는 기록하지 않는다.
//   (메시지에 메일 모양 글자가 섞이면 지워서 기록한다.)
// - 의견 보내기의 '함께 보낼 정보'('최근 오류 기록')로 보낼 수 있다. 셸 설정(settings.mjs)의
//   feedbackContext가 reportEntries()를 실어 보내고, feedback.mjs가 기록이 있을 때만 칸을 보여 준다.
// - 안쪽 화면(iframe)의 오류도 셸 한 곳에 모은다: 프레임의 report()는 같은 창(origin)으로
//   lt41-report 메시지를 보내고, 셸(최상위 창)의 report.mjs가 받아 같은 기록에 쌓는다.
// - 모듈을 받지 못하는 화면 스크립트(board.js·media-preview.js 등 클래식 스크립트)는
//   globalThis.LT41Report 다리를 쓴다.

const LIMIT = 20;

const entries = [];

function clean(text, limit) {
  return String(text ?? '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '메일')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function remember(message, where, at) {
  entries.push({message: clean(message, 200), where: clean(where, 80), at});
  if (entries.length > LIMIT) entries.splice(0, entries.length - LIMIT);
}

export function report(error, where) {
  const message = error?.message !== undefined ? error.message : (error ?? '');
  const at = new Date().toISOString();
  try { console.warn('[LT41 오류]', clean(where, 80), clean(message, 200)); } catch {}
  remember(message, where, at);
  // 안쪽 화면이면 셸 기록에도 올린다(의견 보내기는 셸 한 곳에서 보낸다).
  try {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage({type: 'lt41-report', message: clean(message, 200), where: clean(where, 80), at}, location.origin);
    }
  } catch {}
}

// 셸(최상위 창)은 안쪽 화면이 보낸 오류를 같은 기록에 쌓는다. 프레임은 받지 않는다(셸로 올라간다).
if (typeof window !== 'undefined' && typeof addEventListener === 'function' && window.parent === window) {
  addEventListener('message', (event) => {
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.type !== 'lt41-report') return;
    remember(data.message, data.where, data.at);
  });
}

export function reportEntries() {
  return entries.map((entry) => ({...entry}));
}

// 클래식 스크립트용 다리. 모듈 로드 전에 부르면 조용히 건너뛴다(부른 곳에서 ?..로 감싼다).
if (typeof globalThis !== 'undefined') {
  globalThis.LT41Report = {report, reportEntries};
}

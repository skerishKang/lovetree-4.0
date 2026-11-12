// #481 T6: 화면(iframe)에 설정 값을 알리는 배선 한 벌 — 보내는 시점과 받는 쪽 판정을 값으로 시험하려고
// 셸에서 계산 부분을 떼어 낸 순수 모듈이다. 메시지 타입·값 정규화·'다시 띄울지' 판정만 다룬다(DOM 없음).
// 2026-11-12 사고(#476/#477)의 교훈: 보내는 시점과 받는 쪽 동작을 따로 고정하면 둘이 어긋난 틈이 남는다.
// 여기서는 한 곳에서 둘을 함께 돌려 "같은 값을 여러 번 받아도 다시 뜨지 않는다"를 실행으로 확인한다.
import { normalizeDateStyle } from './domain.mjs';
import {
  normalizeTitleDisplay, shouldReloadForTitleDisplay,
  dateStyleOf, shouldReloadForDateStyle
} from './book-usability.mjs';

/** 셸이 프레임에 보내는 메시지 타입(한 곳에서만 적는다). */
export const FRAME_MESSAGE_TYPES = Object.freeze({
  dateStyle: 'lt41-date-style',
  titleDisplay: 'lt41-title-display',
  pageTurn: 'lt41-page-turn'
});

/**
 * 보내는 값을 정한다(정규화). 모르는 값은 기본으로 떨어진다 — 화면과 셸이 같은 기본을 쓴다.
 * @returns {{type: string, value: string}}
 */
export function frameMessage(kind, rawValue) {
  if (kind === 'dateStyle') return { type: FRAME_MESSAGE_TYPES.dateStyle, value: normalizeDateStyle(rawValue) };
  if (kind === 'titleDisplay') return { type: FRAME_MESSAGE_TYPES.titleDisplay, value: normalizeTitleDisplay(rawValue) };
  if (kind === 'pageTurn') return { type: FRAME_MESSAGE_TYPES.pageTurn, value: rawValue ? 'true' : 'false' };
  throw new Error(`알 수 없는 메시지 종류: ${kind}`);
}

/**
 * 프레임이 뜰 때 보낼 것들. 셸 onFrameReady가 이 목록을 그대로 보낸다(1.6초 뒤 날짜 표기를 한 번 더 — 화면 교대 대비).
 * 목록을 여기 적어 두면 "무엇을 뜰 때마다 보내는가"가 값으로 시험된다(문자열 매칭이 아니라).
 */
export function frameReadyMessages({ dateStyle, pageTurn } = {}) {
  const first = [frameMessage('pageTurn', pageTurn === true), frameMessage('dateStyle', dateStyle)];
  const repeats = [frameMessage('dateStyle', dateStyle)]; // setTimeout 1600ms
  return { first, repeats };
}

/**
 * 받는 쪽 판정: 이 메시지를 받으면 문서를 다시 띄워야 하는가?
 * 화면 이름(home/shelf/book/board/network)마다 그리는 방식이 달라 '다시 띄우기'가 필요한 곳이 다르다.
 * home·shelf만 다시 띄울 수 있고, 그마저 값 비교를 지난다. 나머지는 열린 채로 다시 그린다(다시 띄우기 없음).
 */
export function shouldReloadOnFrameMessage(screen, message, { rendered, mirror } = {}) {
  const type = message?.type;
  if (type === FRAME_MESSAGE_TYPES.dateStyle) {
    if (screen !== 'home') return false; // 책·보드·지도는 다시 그린다
    return shouldReloadForDateStyle({ value: message.value, rendered, mirror });
  }
  if (type === FRAME_MESSAGE_TYPES.titleDisplay) {
    if (screen !== 'home' && screen !== 'shelf') return false; // 책·보드는 열린 채로 그린다
    return shouldReloadForTitleDisplay({ value: message.value, rendered, mirror });
  }
  return false; // 페이지 넘김은 다시 띄우지 않는다
}

/**
 * 흐름 시험용: 한 번 뜬 문서가 받은 메시지들을 처리하며 몇 번 다시 떴는지 센다.
 * @param {object} spec
 * @param {string} spec.screen
 * @param {(load:number)=>{first:object[],repeats:object[]}} spec.messagesFor 매 뜸마다 보낼 메시지
 * @param {string} spec.renderedAtBootBoot 뜰 때 그린 값(미러로 그려진다)
 * @param {(load:number)=>string|null} spec.mirrorAt 매 뜸의 기기 미러(그 미러로 다시 그려진다)
 * @param {number} [spec.maxLoads]
 * @returns {{loads:number, rendered:string}}
 */
export function runFrameFlow({ screen, messagesFor, renderedAtBoot, mirrorAt, maxLoads = 50 }) {
  let loads = 0;
  let rendered = dateStyleOf(renderedAtBoot);
  while (loads < maxLoads) {
    loads += 1;
    const { first, repeats } = messagesFor(loads);
    let reloaded = false;
    for (const message of [...first, ...repeats]) {
      const mirror = mirrorAt(loads);
      if (shouldReloadOnFrameMessage(screen, message, { rendered, mirror })) {
        reloaded = true;
        rendered = dateStyleOf(mirror ?? rendered);
        break;
      }
    }
    if (!reloaded) break;
  }
  return { loads, rendered };
}

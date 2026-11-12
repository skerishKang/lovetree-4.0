// #480 L12: 보드 화면(track58)은 board-extras.js를 옛 방식(일반 script)으로 불러 모듈 import를 못 한다.
// 그래서 썸네일 한 벌(thumb-fallback.mjs)을 여기서 한 번 불러 globalThis.LTThumbFallback으로 내놓는다.
// 이렇게 하면 보드 쪽도 썸네일 내려가기 순서를 스스로 만들지 않고 공용 한 벌만 쓴다(중복 구현 금지).
export * from '/v41/thumb-fallback.mjs';

// 지도(track56-network)가 보드와 같은 썸네일 한 벌을 쓰게 하는 심는 파일(#601).
// 보드의 board-thumb.mjs와 같은 모양: thumb-fallback.mjs를 다시 내보낸다.
// 지도 그림(network.js)은 이 모듈보다 먼저 그릴 수 있으므로, 준비되면 알린다 —
// network.js는 이 신호에서 썸네일 요청을 다시 시도한다(빠른 추가·기다림 없음, 한 번만).
export * from '/v41/thumb-fallback.mjs';
globalThis.dispatchEvent?.(new Event('lt41-map-thumbs-ready'));

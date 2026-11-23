// #788: 설치 조건만 맞추는 최소 서비스 워커. 오프라인 캐시는 범위 밖이라 fetch 핸들러를 두지 않는다.
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

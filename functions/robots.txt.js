import { createRobots } from './_lib/search-meta.mjs';

// /robots.txt — 운영 주소(lovetree.padiem.net)만 검색 허용, 개발 주소(*.pages.dev)는 전면 차단(#541).
// host 를 봐야 하므로 정적 파일이 아니라 Pages Function 으로 내보낸다.
export const onRequest = createRobots();

import { createSitemap } from './_lib/search-meta.mjs';

// /sitemap.xml — '둘러보기에 공개된 공유'만 운영 주소에서 내보낸다(#541).
// 나열 조건은 _lib/search-meta.mjs collectSitemapShares 한 곳에 모아 뒀다(#538 뒤에 거기서 바꾼다).
export const onRequest = createSitemap();

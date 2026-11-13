import { createTreePreview } from '../_lib/tree-preview.mjs';

// /t/<공유 id> — 공유 링크 미리보기 카드(#541). _routes.json 의 '/t/*' 가 이 함수로 보낸다.
export const onRequest = createTreePreview();

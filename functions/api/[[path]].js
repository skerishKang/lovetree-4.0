import { createProxy } from '../_lib/proxy.js';

// /api/* 는 전부 이 함수가 소유한다. 허용 목록 밖 경로도 여기서 404 JSON 으로 끝나
// 정적 자산(index.html) 폴백으로 흘러가지 않는다.
export const onRequest = createProxy();

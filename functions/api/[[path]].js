import { handleProxy } from '../../proxy/pages-api-proxy.js';

// /api/* 를 앞원진에서 받아 COM2로 넘긴다. 경로는 프록시의 닫힌 목록만 통과한다.
export function onRequest(context) {
  return handleProxy(context);
}

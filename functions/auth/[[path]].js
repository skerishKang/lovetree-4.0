import { createProxy } from '../_lib/proxy.js';

// /auth/* 도 같은 이유로 전부 이 함수가 소유한다(로그인·콜백·로그아웃만 통과).
export const onRequest = createProxy();

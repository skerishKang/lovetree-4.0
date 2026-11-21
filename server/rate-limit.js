import {ApiError} from './errors.js';

/**
 * 요청 속도 제한을 한 벌로 모은 공용 모듈(#1073 B-19).
 * 커뮤니티·의견 창구에서 같은 코드 두 벌로 쓰던 규칙을 여기로 모았다.
 * 창이 지나 기록이 빈 목록이 된 키는 Map에서 지운다 — 한 번 쓴 키가 계속 남지 않게.
 */
export function createRateLimiter({now=()=>Date.now(),windowMs=60_000,message='잠시 뒤 다시 시도해 주세요.'}={}){
 const hits=new Map();
 // 창이 지나 비어버린 키를 치운다. 살아 있는 키는 창 안의 기록만 남긴다.
 function prune(){
  const cut=now()-windowMs;
  for(const [key,list] of hits){
   const fresh=list.filter(at=>at>cut);
   if(fresh.length)hits.set(key,fresh);
   else hits.delete(key);
  }
 }
 // 창 안의 기록이 한도에 닿으면 429를 던지고, 아니면 이번 요청을 기록한다.
 function rate(key,limit,customMessage=message){
  prune();
  const list=hits.get(key)||[];
  if(list.length>=limit)throw new ApiError(429,'rate_limited',customMessage);
  list.push(now());
  hits.set(key,list);
 }
 return {rate,prune,hits};
}

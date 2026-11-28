import { ApiError } from './errors.js';

export const REQUEST_RATE_LIMITS = Object.freeze({
  workspace: Object.freeze({
    account: Object.freeze([{limit:15,windowMs:10_000},{limit:90,windowMs:60_000}]),
    ip: Object.freeze([{limit:60,windowMs:10_000},{limit:300,windowMs:60_000}])
  }),
  sharePreview: Object.freeze({
    account: Object.freeze([{limit:10,windowMs:10_000},{limit:30,windowMs:60_000}]),
    ip: Object.freeze([{limit:30,windowMs:10_000},{limit:120,windowMs:60_000}])
  }),
  shareCreate: Object.freeze({
    account: Object.freeze([{limit:5,windowMs:10_000},{limit:10,windowMs:60_000}]),
    ip: Object.freeze([{limit:10,windowMs:10_000},{limit:40,windowMs:60_000}])
  })
});

export function trustedClientIp(request, trusted = false) {
  if (!trusted) return null;
  const raw = request?.headers?.['x-lovetree-client-ip'];
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return /^[0-9A-Fa-f.:]{3,64}$/.test(value) ? value : null;
}

export function retryAfterHeaders(headers, error) {
  const seconds = error?.details?.retryAfterSeconds;
  return Number.isSafeInteger(seconds) && seconds > 0 ? {...headers, 'retry-after': String(seconds)} : headers;
}

export function createRateLimiter({now=()=>Date.now(),windowMs=60_000,message='잠시 뒤 다시 시도해 주세요.',store=null}={}){
  const hits=new Map(), windows=new Map();
  function prune(){
    const at=now();
    for(const [key,list] of hits){
      const span=windows.get(key)||windowMs;
      const start=Math.floor(at/span)*span;
      const fresh=list.filter(time=>time>=start);
      if(fresh.length)hits.set(key,fresh);
      else{hits.delete(key);windows.delete(key);}
    }
  }
  function memoryRate(key,limit,customMessage,span){
    prune();
    const at=now(),start=Math.floor(at/span)*span;
    let list=hits.get(key);
    if(!list||windows.get(key)!==span||!list.length||list[0]<start){
      list=[];hits.set(key,list);windows.set(key,span);
    }
    if(list.length>=limit){
      const retryAfterSeconds=Math.max(1,Math.ceil((start+span-at)/1000));
      throw new ApiError(429,'rate_limited',customMessage,{retryAfterSeconds});
    }
    list.push(at);
  }
  function rate(key,limit,customMessage=message,span=windowMs){
    const scopedKey=span===windowMs?key:`${key}\0${span}`;
    if(store?.rate){
      return Promise.resolve(store.rate({key:scopedKey.replaceAll('\0','|'),limit,windowMs:span,message:customMessage})).catch(error=>{
        if(error instanceof ApiError)throw error;
        throw new ApiError(503,'rate_limit_unavailable','요청 수 확인을 잠시 할 수 없어요.');
      });
    }
    memoryRate(scopedKey,limit,customMessage,span);
  }
  async function rateWindows(key,specs,customMessage=message){
    for(const spec of specs)await rate(key,spec.limit,customMessage,spec.windowMs);
  }
  return {rate,rateWindows,prune,hits};
}

export async function rateRequest(limiter,{productId,scope,subjectId,clientIp=null,account,ip=[],accountWindows=account,ipWindows=ip,message}={}){
  if(!limiter)return;
  const base=`${productId}\0${scope}`;
  await limiter.rateWindows(`${base}\0account\0${subjectId}`,accountWindows,message);
  if(clientIp)await limiter.rateWindows(`${base}\0ip\0${clientIp}`,ipWindows,message);
}

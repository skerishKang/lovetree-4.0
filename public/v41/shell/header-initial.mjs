// #1026: 첫 화면에 보인 권한별 머리줄 요소가 나중에 사라지지 않게 인증 확정을 한 번에 반영한다.
export const HEADER_AUTH_HINT_KEY='lt41.headerAuthHint.v1';
export function settleHeaderAuth(owned,{root=globalThis.document?.documentElement,storage=globalThis.localStorage}={}){
  if(!root?.dataset||!['pending','ready'].includes(root.dataset.ltAuthPhase))return false;
  const hint=owned?'in':'out';
  const first=root.dataset.ltAuthPhase==='pending';
  root.dataset.ltAuthHint=hint;
  if(first)root.dataset.ltAuthPhase='ready';
  try{storage?.setItem?.(HEADER_AUTH_HINT_KEY,hint)}catch{}
  return first;
}

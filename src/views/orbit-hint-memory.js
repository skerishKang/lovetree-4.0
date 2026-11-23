// #1204: First-use guidance is device-scoped, never part of a member's records.
const KEY='lt41-orbit-card-opened';
export function orbitHintSeen(){
 try{return globalThis.localStorage?.getItem(KEY)==='1';}catch{return false;}
}
export function rememberOrbitHint(){
 try{globalThis.localStorage?.setItem(KEY,'1');}catch{}
}

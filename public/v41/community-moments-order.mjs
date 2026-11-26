// #1441: 부모에서 자식으로 이어지는 길 순서. 연결이 없으면 날짜순으로 읽는다.
export function orderTreeMoments(moments){
 const source=(Array.isArray(moments)?moments:[]).filter(m=>m&&m.id);
 const byId=new Map(source.map(m=>[String(m.id),m]));
 const date=(a,b)=>String(a.date||a.createdAt||'').localeCompare(String(b.date||b.createdAt||''))||String(a.id).localeCompare(String(b.id));
 const children=new Map();
 for(const m of source){
  const parent=String(m.parentId||m.parentMomentId||m.previousMomentId||'');
  const key=byId.has(parent)&&parent!==String(m.id)?parent:'';
  if(!children.has(key))children.set(key,[]);
  children.get(key).push(m);
 }
 for(const list of children.values())list.sort(date);
 const result=[],seen=new Set();
 function visit(m){const id=String(m.id);if(seen.has(id))return;seen.add(id);result.push(m);for(const child of children.get(id)||[])visit(child);}
 for(const m of children.get('')||[])visit(m);
 for(const m of [...source].sort(date))visit(m);
 return result;
}

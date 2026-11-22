// createConnections — shell.mjs에서 코드 위치만 옮긴 모듈(#886 PR 2). 동작은 그대로다.
export function createConnections(deps){
const { $, document, window, panel, show, writeLocation, connectionSignature, viewContext } = deps;
// 연결 보기는 헤더에서 뺐다(2026-11-07). 관계 지도 화면의 도구 줄(전체 보기·사용법과 같은 자리·모양)에
// 같은 다이얼로그를 여는 버튼을 붙인다. 원본 화면 파일은 건드리지 않는다.
// #951 ①: '이어진 선 N개'는 위 단추가 아니라 단추 줄 아래 작은 글자다 — 화면이 그 자리를 비워 두었으면
// 그 글자를 채우고, 없으면(옛 판본) 단추 줄 끝에 만든다. 누르면 예전처럼 연결 목록 창이 열린다.
function mapMetaText(moments,connections){const m=Math.max(0,Number(moments)||0),c=Math.max(0,Number(connections)||0);return `순간 ${m} · 이어진 선 ${c}개`;}
let connectionMoments=0;
function mountConnectionTool(doc){
 let button=doc.getElementById('connection-tool');
 if(!button){
  if(doc.documentElement?.getAttribute('data-v41-screen')!=='network')return;
  const host=doc.querySelector('.topbar');if(!host)return;
  button=doc.createElement('button');button.id='connection-tool';button.type='button';button.className='map-meta';button.setAttribute('aria-haspopup','dialog');host.append(button);
 }
 button.onclick=()=>panel('connection-panel');
 // #481 L15: #connection-count·#connection-menu는 index.html에 없다(죽은 가드) — 읽지 않고 0에서 시작한다.
 // 값은 곧 links()의 setConnectionCount가 실제 연결 수로 채운다.
 button.textContent=mapMetaText(window.LT41?.tree?.moments?.length||0,0);button.removeAttribute('aria-label');
 // #601: 지도 화면의 '이어진 선' 버튼을 기억해 둔다 — links()가 매번 프레임 문서를 다시 찾지 않고
 // 같은 버튼을 고친다(지도를 다시 열거나 화면을 옮겨 다니면 0으로 돌아가던 버그의 뿌리).
 // show()는 프레임이 뜨기 전에 links()를 부르므로, 버튼이 생긴 뒤 다시 세어 처음부터 올바른 수를 보인다.
 connectionToolButton=button;links();
}
let connectionToolButton=null;
function setConnectionCount(n){
 const text=mapMetaText(connectionMoments,n);
 // #601: 기억해 둔 지도 화면의 글자가 살아 있으면 그 글자를 고친다. 없으면(예전 부름) 프레임 문서에서 찾는다.
 if(connectionToolButton?.isConnected){connectionToolButton.textContent=text;connectionToolButton.removeAttribute('aria-label');return;}
 const t=$('connection-tool');if(t){t.textContent=text;t.removeAttribute('aria-label');}
}
// #380 4 2차: 순간 잇기 패널이 보여 준 연결 목록(고른 연결)을 기억해 두고, 그 뒤로 트리의 연결이 달라졌으면 더러움이다.
// 패널 자체는 연결을 만들지 않으므로 보통은 확인 없이 닫힌다(보여 준 것과 저장본이 같기 때문).
let connectionShown='';
function connectionDirty(){return $('connection-panel').open&&connectionSignature(window.LT41?.tree,window.LT41?.momentId)!==connectionShown;}
function links(){viewContext();const c=window.LT41;$('connections').replaceChildren();if(!c){setConnectionCount(0);$('selection-label').textContent='트리를 먼저 불러오세요.';connectionShown='';return;}
 const moment=c.tree.moments.find(m=>m.id===c.momentId);$('selection-label').textContent=moment?.title||'';
 // #601: '이어진 선 N개'는 지도에 실제 그린 연결 선 개수다 — 양 끝 순간이 모두 있는 연결을 센다.
 // (예전에는 선택한 순간에 닿는 선만 세어 대표 계정에서 '이어진 선 0개'로 나왔다.)
 const has=id=>c.tree.moments.some(m=>m.id===id);
 const all=c.tree.edges.filter(e=>has(e.from)&&has(e.to));connectionMoments=c.tree.moments.length;setConnectionCount(all.length);
 const edges=c.tree.edges.filter(e=>e.from===c.momentId||e.to===c.momentId);
 if(!edges.length){const p=document.createElement('p');p.textContent='아직 연결된 다른 순간이 없어요.';$('connections').append(p);}
 for(const e of edges){
  const id=e.from===c.momentId?e.to:e.from,m=c.tree.moments.find(m=>m.id===id),b=document.createElement('button'),kind=document.createElement('small'),title=document.createElement('span');
  kind.textContent=e.kind==='related'?'관련 순간':e.from===c.momentId?'다음 순간':'이전 순간';
  const name=document.createElement('strong'),reason=document.createElement('span');
  name.textContent=m.title;
  reason.className='connection-reason';
  reason.textContent=e.reason||(e.kind==='related'?'함께 기억할 관련 순간으로 연결했어요.':'연결 이유를 아직 남기지 않았어요.');
  title.append(name,reason);b.append(kind,title);
  b.onclick=()=>{c.momentId=id;$('connection-panel').close();show(deps.current,false);writeLocation();};
  $('connections').append(b);
 }
 connectionShown=connectionSignature(c.tree,c.momentId);
}
return { mapMetaText, mountConnectionTool, setConnectionCount, connectionDirty, links };
}

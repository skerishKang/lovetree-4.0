import {workspaceModel} from './workspace-model.mjs';
import {createWorkspaceApi} from './api.mjs';
import {createServerReader} from './server-reader.mjs';
import {exampleTree} from './example.mjs';
const $=id=>document.getElementById(id);
const screens=[['home','src064-orbit.html','첫 화면'],['shelf','track32-bookshelf.html','내 책장'],['book','track59-sketchbook.html','기억책'],['board','track58-pinboard.html','기억 보드'],['network','track56-network.html','관계 지도']];
let model=null,current=screens.find(s=>'#'+s[0]===location.hash)?.[1]||screens[0][1],source='example',loadGeneration=0,toastTimer;
window.LT41=null;
function notify(text){$('record-feedback').textContent=text;$('toast').textContent=text;$('toast').hidden=$('records').open;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function panel(id){const target=$(id);if(!target.open)target.showModal();}
function links(){const c=window.LT41;$('connections').replaceChildren();if(!c){$('connection-count').textContent='0';$('selection-label').textContent='트리를 먼저 불러오세요.';return;}
 const moment=c.tree.moments.find(m=>m.id===c.momentId);$('selection-label').textContent=moment?.title||'';
 const edges=c.tree.edges.filter(e=>e.from===c.momentId||e.to===c.momentId);$('connection-count').textContent=edges.length;
 if(!edges.length){const p=document.createElement('p');p.textContent='아직 연결된 다른 순간이 없어요.';$('connections').append(p);}
 for(const e of edges){const id=e.from===c.momentId?e.to:e.from,m=c.tree.moments.find(m=>m.id===id),b=document.createElement('button'),kind=document.createElement('small'),title=document.createElement('span');kind.textContent=e.kind==='related'?'관련':e.from===c.momentId?'다음':'이전';title.textContent=m.title;b.append(kind,title);b.onclick=()=>{c.momentId=id;$('connection-panel').close();show(current,false);};$('connections').append(b);}}
function show(file,write=true){if(!window.LT41)return;const screen=screens.find(s=>s[1]===file);if(!screen)return;current=file;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.view===file)));$('view').hidden=false;$('empty').hidden=true;$('view').title='러브트리 · '+screen[2];$('view').contentWindow.location.replace(new URL((source==='example'?'design/views/':'views/')+file,location.href).href);if(write&&location.hash!=='#'+screen[0])history.pushState(null,'','#'+screen[0]);links();}
function choose(id){const tree=model.trees.find(t=>t.id===id);window.LT41=tree?{tree,momentId:tree.moments.find(m=>m.parentId===null).id,}:null;
 if(tree)show(current,false);else{$('view').hidden=true;$('view').contentWindow.location.replace('about:blank');$('empty').hidden=false;links();}}
function load(input,kind){model=kind==='example'?{trees:[exampleTree]}:workspaceModel(input);source=kind;$('source-label').textContent=kind==='example'?'예시 트리':kind==='server'?'내 기록':'파일 기록';$('record-description').textContent=kind==='example'?'실제 회원 데이터와 무관한 예시입니다.':kind==='server'?'로그인한 계정의 서버 기록 · 읽기 전용':'선택한 파일을 메모리에서 읽는 중입니다.';$('trees').replaceChildren();for(const t of model.trees){const o=document.createElement('option');o.value=t.id;o.textContent=t.title;$('trees').append(o);}$('trees').disabled=!model.trees.length;choose(model.trees[0]?.id);}
function clear(){load({revision:0,state:{version:1,trees:[]}},'file');$('source-label').textContent='기록 선택';$('record-description').textContent='펼쳐 볼 트리를 선택하세요.';}
const reader=createServerReader({api:createWorkspaceApi(),onClear:clear,onDocument:d=>{load(d,'server');$('records').close();},onStatus:notify});
function sample(){++loadGeneration;reader.cancel();load(null,'example');$('records').close();}
$('record-menu').onclick=()=>{$('record-feedback').textContent='';panel('records');};$('connection-menu').onclick=()=>panel('connection-panel');$('empty-records').onclick=()=>panel('records');$('empty-sample').onclick=sample;
$('sample').onclick=sample;$('clear').onclick=()=>{++loadGeneration;reader.cancel();$('file').value='';$('records').close();};
$('server').onclick=()=>{++loadGeneration;reader.read();};$('logout').onclick=()=>{++loadGeneration;reader.logout();};
$('file').onchange=async()=>{const f=$('file').files[0];if(!f)return;const generation=++loadGeneration;reader.cancel();try{if(f.size>4194304)throw Error('4MiB 이하 파일만 읽습니다.');const d=JSON.parse(await f.text());if(generation!==loadGeneration)return;load(d.state?d:{revision:0,state:d},'file');$('records').close();notify('파일을 열었어요. 서버에는 저장하지 않습니다.');}catch(e){if(generation===loadGeneration)notify('불러오기 실패: '+e.message);}};
$('trees').onchange=()=>{choose($('trees').value);$('records').close();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>show(b.dataset.view));
addEventListener('popstate',()=>{const screen=screens.find(s=>'#'+s[0]===location.hash)||screens[0];show(screen[1],false);});
addEventListener('hashchange',()=>{const screen=screens.find(s=>'#'+s[0]===location.hash);if(screen&&screen[1]!==current)show(screen[1],false);});
addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==$('view').contentWindow)return;if(e.data?.type==='lt41-navigate')show(e.data.view);if(e.data?.type==='lt-selection'||e.data?.type==='lt41-choose')links();});
$('view').onload=()=>{const d=$('view').contentDocument;if(!d)return;d.addEventListener('click',e=>{const b=e.target.closest('button,a');if(!b)return;let file;if(b.matches('[data-action="tree"],[data-menu="tree"]'))file='track32-bookshelf.html';if(b.matches('#storyBook,[data-menu="book"]'))file='track59-sketchbook.html';if(current==='track56-network.html'&&b.id==='openMoment')file='track59-sketchbook.html';if(file){e.preventDefault();e.stopImmediatePropagation();show(file);}},true);};
load(null,'example');

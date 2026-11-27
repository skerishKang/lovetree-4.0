'use strict';
// 시안용 메모리 데이터. 제품 저장·인증·서버를 호출하지 않는다.
const $=id=>document.getElementById(id), q=new URLSearchParams(location.search), narrow=matchMedia('(max-width:700px)');
const samples=[
 ['m1','처음 본 무대','2026.11.20 · 설렘','♫',1],
 ['m2','웃음이 터진 순간','2026.11.21 · 즐거움','✦',2],
 ['m3','다시 보고 싶은 장면','2026.11.22 · 그리움','◈',3],
 ['m4','하루를 마치는 노래','2026.11.23 · 편안함','♪',4],
 ['m5','마음에 남은 한마디','2026.11.24 · 고마움','❋',5],
 ['m6','오래 기억하고 싶은 저녁','2026.11.25 · 행복','◐',1]
];
const initialTrees=[{id:'t1',name:'좋아하는 무대',count:12,tone:1,has:['m1']},{id:'t2',name:'다시 보는 영상',count:8,tone:2,has:[]},{id:'t3',name:'소중한 일상',count:19,tone:3,has:[]},{id:'t4',name:'마음이 쉬는 곳',count:5,tone:4,has:[]}];
const storage={get(k){try{return localStorage.getItem('lt1440.sketch.'+k)}catch{return null}},set(k,v){try{localStorage.setItem('lt1440.sketch.'+k,v)}catch{}}};
let view=q.get('view')||storage.get('view')||'classic',theme=q.get('theme')||storage.get('theme')||'night',fixture=q.get('fixture')||'normal';
if(!['classic','cards'].includes(view))view='classic';
if(!['normal','one','empty'].includes(fixture))fixture='normal';
let moments,trees,selected=new Set(),targets=new Set(),mode='move',page='source',undoRecord=null,dragging=false,busy=false,lastFocus=null,focusId=null;
function reset(){moments=fixture==='empty'?[]:samples.map(x=>[...x]);trees=fixture==='one'?[]:structuredClone(initialTrees);selected.clear();targets.clear();mode='move';undoRecord=null;$('notice').hidden=true;returnToSource(false);render()}
function thumb(m){const s=document.createElement('span');s.className='thumb';s.dataset.tone=m[4];s.setAttribute('aria-hidden','true');s.textContent=m[3];return s}
function countText(){return selected.size+'개 고름'}
function labelTree(t){return t.name+' · 순간 '+t.count+'개'}
function renderMoments(){const host=$('moments');host.replaceChildren();if(!moments.length){const n=document.createElement('div');n.className='empty';n.textContent='정리할 순간이 없어요. 새 순간을 담으면 여기에 나타나요.';host.append(n);return}
 for(const m of moments){const row=document.createElement('label');row.className='moment-row';row.dataset.moment=m[0];row.draggable=view==='cards'&&!narrow.matches;const cb=document.createElement('input');cb.type='checkbox';cb.checked=selected.has(m[0]);cb.setAttribute('aria-label',m[1]+' 고르기');cb.onchange=()=>{cb.checked?selected.add(m[0]):selected.delete(m[0]);if(!selected.size)targets.clear();sync()};const txt=document.createElement('span');txt.className='moment-text';const title=document.createElement('strong'),detail=document.createElement('small');title.textContent=m[1];detail.textContent=m[2];txt.append(title,detail);const grip=document.createElement('span');grip.className='grip';grip.textContent='⠿';grip.setAttribute('aria-hidden','true');row.append(cb,thumb(m),txt,grip);
 row.addEventListener('dragstart',e=>{if(narrow.matches||view!=='cards'||busy){e.preventDefault();return}if(!selected.has(m[0])){selected.clear();selected.add(m[0]);for(const x of host.querySelectorAll('input'))x.checked=selected.has(x.closest('label').dataset.moment)}mode='move';targets.clear();dragging=true;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','selected-moments');sync();$('drag-state').hidden=false;$('drag-state').textContent=countText()+' · 놓을 트리로 끌어 주세요.'});
 row.addEventListener('dragend',clearDrag);host.append(row)}
}
function clearDrag(){dragging=false;$('drag-state').hidden=true;document.querySelectorAll('.drop-hot').forEach(e=>e.classList.remove('drop-hot'))}
function dupIds(t){return [...selected].filter(id=>t.has.includes(id))}
function card(t,mobile){const isNew=!t;const selectable=!isNew&&(mode==='copy'||view==='classic');const el=document.createElement(selectable?'label':'button');if(!selectable)el.type='button';el.className='tree-card'+(isNew?' new-card':'');el.dataset.tree=isNew?'new':t.id;const disabled=!selected.size||busy;
 if(selectable){const cb=document.createElement('input');cb.type='checkbox';cb.checked=targets.has(t.id);cb.disabled=disabled;cb.setAttribute('aria-label',labelTree(t)+(dupIds(t).length?' · 이미 있음 '+dupIds(t).length+'개':'')+' 선택');cb.onchange=()=>{cb.checked?targets.add(t.id):targets.delete(t.id);sync()};el.append(cb)}else el.disabled=disabled;
 const cover=document.createElement('span');cover.className='cover';cover.dataset.tone=isNew?1:t.tone;cover.setAttribute('aria-hidden','true');cover.textContent=isNew?'+':'❧';const txt=document.createElement('span');txt.className='tree-text';const title=document.createElement('strong'),sub=document.createElement('small');title.textContent=isNew?'+ 새 트리':t.name;sub.textContent=isNew?'새로운 기억의 묶음':('순간 '+t.count+'개');txt.append(title,sub);
 if(!isNew&&dupIds(t).length){const b=document.createElement('span');b.className='dup';b.textContent='이미 있음'+(selected.size>1?' '+dupIds(t).length+'개':'');txt.append(b)}
 el.append(cover,txt);if(!selectable)el.onclick=()=>{if(isNew)openNew();else run('move',[t.id])};
 if(!mobile&&view==='cards'){el.ondragover=e=>{if(!dragging||disabled)return;e.preventDefault();e.dataTransfer.dropEffect='move';el.classList.add('drop-hot');$('drag-state').textContent=countText()+' · '+(isNew?'새 트리':t.name)+'에 놓기'};el.ondragleave=e=>{if(!el.contains(e.relatedTarget)){el.classList.remove('drop-hot');$('drag-state').textContent=countText()+' · 놓을 트리로 끌어 주세요.'}};el.ondrop=e=>{if(!dragging)return;e.preventDefault();clearDrag();if(isNew)openNew();else run('move',[t.id])}}
 return el}
function renderTrees(){const focused=document.activeElement;const key=focused?.closest('[data-tree]')?.dataset.tree;const parent=focused?.closest('.tree-grid')?.id;const wasInput=focused?.tagName==='INPUT';for(const [id,mobile] of [['desktop-trees',false],['mobile-trees',true]]){const host=$(id);host.replaceChildren(card(null,mobile),...trees.map(t=>card(t,mobile)));if(!trees.length){const note=document.createElement('div');note.className='empty';note.textContent='다른 트리가 아직 없어요. 새 트리를 만들어 순간을 담아 보세요.';host.append(note)}}if(key&&parent){const node=[...$(parent).children].find(x=>x.dataset.tree===key);(wasInput?node?.querySelector('input'):node)?.focus({preventScroll:true})}}
function sync(){ $('source-count').textContent='순간 '+moments.length+'개';$('selection').textContent=countText();$('all').textContent=selected.size===moments.length&&moments.length?'모두 풀기':'모두 고르기';$('all').disabled=!moments.length;for(const id of ['move','copy'])$(id).disabled=!selected.size||busy||(view==='classic'&&(id==='move'?targets.size!==1:!targets.size));
 $('mode-label').textContent=view==='classic'?'지금 방식':'새 방식';document.body.dataset.view=view;
 $('desktop-title').textContent=mode==='copy'?'복사할 트리 고르기':'어느 트리에 넣을까요?';$('desktop-hint').textContent=view==='classic'?'옮기기는 트리 하나, 복사는 여러 트리를 고를 수 있어요.':mode==='copy'?'여러 트리를 고르고 아래 복사하기를 눌러 주세요.':'순간을 고른 뒤 트리 카드로 끌거나 눌러 주세요.';
 $('finish').hidden=mode!=='copy'||view==='classic'||narrow.matches;$('finish').disabled=!selected.size||!targets.size||busy;
 $('target-heading').textContent='순간 '+selected.size+'개를 어디로 '+(mode==='copy'?'복사할까요?':'옮길까요?');$('mobile-hint').textContent=mode==='copy'?'여러 트리를 고를 수 있어요.':'트리를 누르면 바로 옮겨져요.';$('target-footer').hidden=mode!=='copy';$('target-count').textContent=targets.size+'개 트리 고름';$('mobile-finish').disabled=!targets.size||busy;
 const stack=$('stack');stack.replaceChildren(...moments.filter(m=>selected.has(m[0])).slice(0,3).map(thumb));
 // 드래그 중에는 놓을 카드 자체를 유지한다.
 renderTrees();
}
function render(){window.LT41_THEME_REGISTRY.apply(document.documentElement,theme);renderMoments();sync();$('theme').value=theme;$('fixture').value=fixture;document.querySelectorAll('[name=view]').forEach(x=>x.checked=x.value===view);window.LT41_THEME_REGISTRY.apply(document.documentElement,theme)}
function openTarget(next){mode=next;targets.clear();lastFocus=document.activeElement;page='target';document.querySelector('.preview').inert=true;$('notice').hidden=true;history.pushState({lt1440Target:true},'','#trees');$('source-page').hidden=true;$('target-page').hidden=false;sync();$('target-heading').focus()}
function returnToSource(restore=true){const was=page==='target';page='source';document.querySelector('.preview').inert=false;$('source-page').hidden=false;$('target-page').hidden=true;mode='move';targets.clear();if(was&&history.state?.lt1440Target)history.back();if(restore&&was){sync();(lastFocus?.isConnected?lastFocus:$('move')).focus()}}
window.addEventListener('popstate',()=>{if(page==='target')returnToSource()});
$('back').onclick=()=>{if(history.state?.lt1440Target)history.back();else returnToSource()};
function chooseMode(next){if(!selected.size)return;if(view==='classic'){if(targets.size)run(next,[...targets]);return}if(narrow.matches){openTarget(next);return}mode=next;targets.clear();sync();const first=$('desktop-trees').querySelector(next==='copy'?'input':'button');first?.focus()}
$('move').onclick=()=>chooseMode('move');$('copy').onclick=()=>chooseMode('copy');$('finish').onclick=()=>run('copy',[...targets]);$('mobile-finish').onclick=()=>run('copy',[...targets]);
$('all').onclick=()=>{if(selected.size===moments.length)selected.clear();else selected=new Set(moments.map(m=>m[0]));render()};
function ask(t){return new Promise(resolve=>{const d=$('duplicate');$('duplicate-text').textContent=t.name+' 트리에 고른 '+selected.size+'개 중 '+dupIds(t).length+'개가 이미 있어요.';let answer='cancel';$('put').onclick=()=>{answer='put';d.close()};$('skip').onclick=()=>{answer='skip';d.close()};$('cancel-dup').onclick=()=>d.close();d.addEventListener('close',()=>resolve(answer),{once:true});d.showModal()})}
async function run(kind,ids,created=null){if(busy||!selected.size||!ids.length||(kind==='move'&&ids.length!==1))return;busy=true;const before={moments:structuredClone(moments),trees:structuredClone(trees),selected:[...selected]};if(created)before.trees=before.trees.filter(t=>t.id!==created);const plan=[];try{for(const id of ids){const t=trees.find(t=>t.id===id);if(!t)continue;let take=[...selected];if(dupIds(t).length){const a=await ask(t);if(a==='cancel'){if(created)trees=before.trees;return}if(a==='skip')take=take.filter(x=>!t.has.includes(x))}if(take.length)plan.push({t,take})}if(!plan.length){showNotice('모두 이미 있는 순간이라 바뀐 것이 없어요.',false);return}let placed=0;const moved=new Set();for(const {t,take} of plan){t.count+=take.length;t.has.push(...take);placed+=take.length;take.forEach(id=>moved.add(id))}if(kind==='move')moments=moments.filter(m=>!moved.has(m[0]));undoRecord=before;selected.clear();returnToSource(false);render();showNotice((plan.length===1?plan[0].t.name+'에 ':plan.length+'개 트리에 ')+placed+'개 '+(kind==='move'?'옮겼어요.':'복사했어요.'),true);$('undo').focus()}finally{busy=false;sync()}}
function showNotice(msg,canUndo){$('message').textContent=msg;$('undo').hidden=!canUndo;$('notice').hidden=false}
$('undo').onclick=()=>{if(!undoRecord)return;moments=undoRecord.moments;trees=undoRecord.trees;selected=new Set(undoRecord.selected);undoRecord=null;render();showNotice('이번 작업을 되돌렸어요.',false);$('all').focus()};
$('dismiss').onclick=()=>{$('notice').hidden=true;$('all').focus()};
function openNew(){if(!selected.size)return;$('new-name').value='';$('new-tree').showModal()}
$('new-form').onsubmit=e=>{e.preventDefault();const name=$('new-name').value.trim();if(!name)return;const t={id:'new-'+Date.now(),name,count:0,tone:5,has:[]};trees.push(t);$('new-tree').close();run(mode==='copy'?'copy':'move',[t.id],t.id)};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('settings-open').onclick=()=>$('settings').showModal();document.querySelectorAll('[name=view]').forEach(r=>r.onchange=()=>{view=r.value;storage.set('view',view);returnToSource(false);render()});
$('theme').onchange=()=>{theme=$('theme').value;storage.set('theme',theme);render()};
$('fixture').onchange=()=>{fixture=$('fixture').value;reset()};$('reset').onclick=reset;
narrow.addEventListener('change',()=>{if(page==='target'&&!narrow.matches)returnToSource(false);render()});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&page==='target'&&!document.querySelector('dialog[open]')){e.preventDefault();$('back').click()}});
if(location.hash==='#trees')history.replaceState(null,'',location.pathname+location.search);
reset();

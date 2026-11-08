// 첫 화면 궤도(src064) — 실제 기록·예시 판본 공통 한 벌.
// 원본 압축 스크립트를 공백만 정리해 옮겼다: 조건·문구·id·순서·동작 변경 0.
import { BASE_CARDS } from './orbit-cards.mjs';
import { escapeRecord, hasLayout, momentSeq } from './orbit-model.mjs';



const CARDS=LTDEMO.moments.map((m,i)=>({...(hasLayout(m)?{}
:BASE_CARDS[i%BASE_CARDS.length]),...m}
));

// 화면에 적힌 수가 자료 수와 다를 때만 고쳐 쓴다(예시는 처음부터 같은 수라 그대로다).
(()=>{const el=document.querySelector('[data-menu="moments"] span:last-child');
if(el&&el.textContent.trim()!==String(CARDS.length))el.textContent=CARDS.length}
)();

const RINGS={"main": {"rx": 700, "ry": 330, "zAmp": 420, "zBase": 0, "speed": 1.0, "band": 0}
, "inner": {"rx": 520, "ry": 260, "zAmp": 330, "zBase": -80, "speed": 1.18, "band": 0}
, "outer": {"rx": 900, "ry": 430, "zAmp": 520, "zBase": -40, "speed": 0.82, "band": 0}
, "upper": {"rx": 760, "ry": 260, "zAmp": 460, "zBase": -120, "speed": 0.92, "band": -250}
, "lower": {"rx": 780, "ry": 250, "zAmp": 470, "zBase": -100, "speed": 1.06, "band": 250}
}
;

const app=document.getElementById('app'), world=document.getElementById('world'), center=document.getElementById('center');

const focusLayer=document.getElementById('focusLayer'), focusTitle=document.getElementById('focusTitle'), focusWhy=document.getElementById('focusWhy'), focusMeta=document.getElementById('focusMeta'), focusKicker=document.getElementById('focusKicker'), focusVideoState=document.getElementById('focusVideoState');

const menuPanel=document.getElementById('menuPanel'), indexPanel=document.getElementById('indexPanel'), branchChoice=document.getElementById('branchChoice'), statusEl=document.getElementById('status');

const mediaViewer=document.getElementById('mediaViewer'),mediaVisual=document.getElementById('mediaVisual'),mediaImage=document.getElementById('mediaImage'),mediaMemo=document.getElementById('mediaMemo'),mediaMemoBody=document.getElementById('mediaMemoBody'),mediaMemoDate=document.getElementById('mediaMemoDate'),mediaClose=document.getElementById('mediaClose'),mediaPlay=document.getElementById('mediaPlay'),mediaPlayAction=document.getElementById('mediaPlayAction'),mediaExternal=document.getElementById('mediaExternal'),mediaTitle=document.getElementById('mediaTitle'),mediaKicker=document.getElementById('mediaKicker'),mediaMeta=document.getElementById('mediaMeta'),mediaWhy=document.getElementById('mediaWhy'),mediaTypeBadge=document.getElementById('mediaTypeBadge'),localNotice=document.getElementById('localNotice'),localNoticeText=document.getElementById('localNoticeText');

const focusInfoEl=document.querySelector('.focusInfo'), closeFocusEl=document.getElementById('closeFocus');
 app.appendChild(focusInfoEl);
 app.appendChild(closeFocusEl);

const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

let state={mode:'WELCOME_IDLE',phase:0,velocity:reduced?0:0.00009,cameraX:0,cameraY:0,targetCameraX:0,targetCameraY:0,dragging:false,dragMoved:0,pointerId:null,lastX:0,lastY:0,lastT:0,hoverId:null,focusId:null,focusProgress:0,focusTarget:0,focusSnapshot:null,pathQueue:[],previewPlaying:false,lastFocused:'m08',restoreHoldUntil:0,downCardId:null,mediaViewerOpen:false,viewerPlaying:false,viewerMomentId:null,navigationAttempt:null,viewerSnapshot:null}
;

const els=new Map(), proj=new Map();

function mediaImg(c,extra=''){const fit=c.fitMode||'cover',pos=c.objectPosition||'50% 50%';
return `<img src="${c.image}" alt="${escapeRecord(c.title)}" style="--fit:${fit};--pos:${pos};object-fit:${fit};object-position:${pos};${extra}">`;
}

function surface(c){
 if(c.type==='memo') return `<div class="surface"><div class="memoKicker">MEMO · ${escapeRecord(c.date)}</div><div class="memoText">${escapeRecord(c.title)}</div><div class="memoFoot">${escapeRecord(c.emotion)} · MEMORY NOTE</div></div>`;

 let img=mediaImg(c);

 if(c.type==='video') return `<div class="surface">${img}<div class="duration">영상 예시 이미지</div></div>`;

 if(c.type==='link') return `<div class="surface">${img}</div>`;

 return `<div class="surface">${img}</div>`;

}

for(const c of CARDS){ const el=document.createElement('div');
 el.className=`card ${c.type} ${c.sizeClass} ${c.fitMode==='contain'?'fitContain':''}`;
 el.dataset.id=c.id;
 el.style.setProperty('--fit',c.fitMode||'cover');
el.style.setProperty('--pos',c.objectPosition||'50% 50%');
 el.innerHTML=surface(c)+(c.first?`<div class="firstMark">FIRST</div>`:'')+`<div class="caption"><span>${escapeRecord(c.title)}</span><span>${c.type.toUpperCase()}</span></div>`;
 world.appendChild(el);
 els.set(c.id,el);
 }

function setMode(m){state.mode=m;
statusEl.textContent=`${m} · ${CARDS.length} MOMENTS`}

function smoothstep(t){return t*t*(3-2*t)}

function project(c,w,h,phaseOverride=null){
 const cfg=RINGS[c.ring];
 const ph=phaseOverride??state.phase;
 const th=c.baseAngle+ph*cfg.speed+c.phaseOffset;

 let x=Math.cos(th)*cfg.rx;
 let y=Math.sin(th)*cfg.ry+cfg.band+Math.sin(th*1.7+c.phaseOffset*3)*45;

 let z=Math.sin(th+1.1+c.phaseOffset*4)*cfg.zAmp+cfg.zBase+c.zOffset;

 // center-void shaping: cards are nudged around the empty text zone, while near foreground may clip through its edge.
 const dist=Math.sqrt((x/520)**2+(y/260)**2);
 if(dist<1.0 && z<260){ const k=(1-dist)*280;
 x+=(x>=0?1:-1)*k;
 y+=(y>=0?1:-1)*k*.2;
 }

 const focal=1050;
 const sc=Math.max(.18,Math.min(1.82,focal/(focal-z)));

 const sx=w/2+(x+state.cameraX*(0.45+sc*.3))*sc;
 const sy=h/2+(y+state.cameraY*(0.38+sc*.24))*sc;

 return {x:sx,y:sy,z,scale:sc,rx:c.tiltX+Math.sin(th)*9,ry:c.tiltY+Math.cos(th)*18,rz:c.tiltZ+Math.sin(th*.6)*7,sat:Math.max(.3,Math.min(1,0.48+(z+520)/980*.6))}
;

}

function render(){
 const w=innerWidth,h=innerHeight;
 state.cameraX+=(state.targetCameraX-state.cameraX)*.055;
 state.cameraY+=(state.targetCameraY-state.cameraY)*.055;

 if(!state.dragging && state.mode!=='MOMENT_FOCUS' && state.mode!=='CARD_FOCUSING' && state.mode!=='PATH_GLIDE' && performance.now()>state.restoreHoldUntil && !reduced){ state.phase+=state.velocity;
 state.velocity*=.997;
 if(Math.abs(state.velocity)<.000045) state.velocity+=(state.velocity>=0?1:-1)*.000001;
 }

 if(state.focusTarget!==state.focusProgress){ const d=state.focusTarget-state.focusProgress;
 state.focusProgress+=d*(reduced?.4:.085);
 if(Math.abs(d)<.003) state.focusProgress=state.focusTarget;
 }

 proj.clear();

 for(const c of CARDS){
   let p=project(c,w,h);
 proj.set(c.id,p);
 const el=els.get(c.id);
 let op=Math.max(.16,Math.min(1,(p.z+620)/880));
 let blur=p.z<-400?1.2:0;
 let zIndex=Math.round(1000+p.z);

   let tx=p.x-w/2, ty=p.y-h/2, sc=p.scale;

   if(state.focusId===c.id && state.focusProgress>0){ const t=smoothstep(state.focusProgress);
 const targetX=(w<700?w*.5:w*.33)-w/2;
 const targetY=(w<700?h*.34:h*.5)-h/2;
 tx=tx*(1-t)+targetX*t;
 ty=ty*(1-t)+targetY*t;
 sc=sc*(1-t)+(w<700?1.36:1.58)*t;
 op=1;
 blur=0;
 zIndex=5000;
 el.style.setProperty('--sat',state.previewPlaying?'1':'.96');
 el.style.setProperty('--bright','1');
 }

   else{ if(state.focusId){ op*=.10;
 blur+=1.3;
 }
 el.style.setProperty('--sat',String(p.sat));
 el.style.setProperty('--bright',String(.72+p.sat*.22));
 }

   el.style.transform=`translate3d(${tx}px,${ty}px,0) scale(${sc}) rotateX(${p.rx}deg) rotateY(${p.ry}deg) rotateZ(${p.rz}deg)`;
 el.style.opacity=op;
 el.style.filter=`blur(${blur}px)`;
 el.style.zIndex=zIndex;
 el.classList.toggle('hovered',state.hoverId===c.id && !state.focusId);
 el.classList.toggle('previewPlaying',state.previewPlaying&&state.focusId===c.id);

 }

 drawPeek();
 requestAnimationFrame(render);

}

function drawPeek(){ if(!state.focusId) return;
 const c=CARDS.find(x=>x.id===state.focusId);
 const incoming=CARDS.filter(x=>x.next===c.id||x.branch===c.id), next=CARDS.find(x=>x.id===c.next);
 const a=incoming.length===1?proj.get(incoming[0].id):null, b=next?proj.get(next.id):null;
 const w=innerWidth,h=innerHeight;
 const fx=w<700?w*.5:w*.33, fy=w<700?h*.34:h*.5;
 const l1=document.getElementById('linePrev'),l2=document.getElementById('lineNext');
 l1.style.display=a?'':'none';
 l2.style.display=b?'':'none';
 if(a){l1.setAttribute('x1',a.x);
l1.setAttribute('y1',a.y);
l1.setAttribute('x2',fx);
l1.setAttribute('y2',fy)}
 if(b){l2.setAttribute('x1',fx);
l2.setAttribute('y1',fy);
l2.setAttribute('x2',b.x);
l2.setAttribute('y2',b.y)}
 }

function focusCard(id,fromPath=false){
 LTDEMO.select(id);

 const c=CARDS.find(x=>x.id===id);
 if(!c)return;
 closePanels();
 state.focusSnapshot=state.focusSnapshot||{phase:state.phase,velocity:state.velocity,cameraX:state.cameraX,cameraY:state.cameraY,targetCameraX:state.targetCameraX,targetCameraY:state.targetCameraY}
;
 state.focusId=id;
 state.lastFocused=id;
 state.previewPlaying=false;
 focusVideoState.classList.remove('on');
 setMode(fromPath?'PATH_GLIDE':'CARD_FOCUSING');
 center.classList.add('dim');
 focusLayer.classList.add('open');
 app.classList.add('focusOpen');
 state.focusTarget=1;

 branchChoice.classList.remove('open');
 const incoming=CARDS.filter(x=>LTDEMO.edges.some(e=>e.kind==='parent'&&e.from===x.id&&e.to===id));
 document.getElementById('prevMoment').disabled=incoming.length===0;
 document.getElementById('nextMoment').disabled=!c.next;
 document.getElementById('continuePath').disabled=!c.next;
 focusKicker.textContent=`MOMENT · ${c.type.toUpperCase()}${c.first?' · FIRST':''}`;
 focusTitle.textContent=c.title;
 focusWhy.textContent=c.whyNext;
 focusMeta.innerHTML=`<span>${escapeRecord(c.date)}</span><span>${escapeRecord(c.emotion)}</span><span>${c.type.toUpperCase()}</span>${c.source?`<span>${escapeRecord(c.source)}
</span>`:''}`;
 setTimeout(()=>{ if(state.focusId===id && !state.mediaViewerOpen) setMode(fromPath?'PATH_GLIDE':'MOMENT_FOCUS') },reduced?100:620);
}
function closeFocus(restore=true){ if(state.mediaViewerOpen){closeMediaViewer();return;} if(!state.focusId)return; state.focusTarget=0; state.previewPlaying=false; branchChoice.classList.remove('open'); const snap=state.focusSnapshot; const old=state.focusId; setTimeout(()=>{ if(state.focusId===old){ state.focusId=null;focusLayer.classList.remove('open');app.classList.remove('focusOpen');center.classList.remove('dim'); if(restore&&snap){state.phase=snap.phase;state.velocity=snap.velocity;state.cameraX=snap.cameraX;state.cameraY=snap.cameraY;state.targetCameraX=snap.cameraX;state.targetCameraY=snap.cameraY} state.restoreHoldUntil=performance.now()+850; state.focusSnapshot=null; setMode('RETURN_ORBIT'); setTimeout(()=>setMode('ORBIT_INTERACT'),120); } },reduced?80:420) }
function branchMarkup(c,label){let visual='';if(c.type==='memo'){visual=`<div class="branchThumb"><span style="font-size:10px;letter-spacing:.12em;color:#ddd">MEMO</span></div>`;}else{visual=`<div class="branchThumb"><img src="${c.image}" style="object-fit:${c.fitMode||'cover'};object-position:${c.objectPosition||'50% 50%'}"></div>`;}return `${visual}
<span class="branchText"><small>${label}
 · ${c.type.toUpperCase()}
</small><b>${escapeRecord(c.title)}</b><em>${escapeRecord(c.emotion)}
</em></span>`;}
function continuePath(){if(!LTDEMO.example){const c=CARDS.find(m=>m.id===state.focusId);if(!c)return;const outs=LTDEMO.edges.filter(e=>e.kind==='parent'&&e.from===c.id);if(outs.length===1)glideTo(outs[0].to);else if(outs.length)parent.postMessage({type:'lt41-choose',id:c.id},location.origin);return} if(state.mediaViewerOpen)closeMediaViewer(); const c=CARDS.find(x=>x.id===state.focusId); if(!c)return; if(c.branch){ const main=CARDS.find(x=>x.id===c.next),side=CARDS.find(x=>x.id===c.branch);const mb=document.getElementById('mainBranch'),sb=document.getElementById('sideBranch');mb.innerHTML=branchMarkup(main,'MAIN NEXT');sb.innerHTML=branchMarkup(side,'BRANCH NEXT');branchChoice.classList.add('open'); setMode('BRANCH_CHOICE'); mb.onclick=()=>{branchChoice.classList.remove('open'); glideTo(c.next)}; sb.onclick=()=>{branchChoice.classList.remove('open'); glideTo(c.branch)}; } else glideTo(c.next); }
function glideTo(id){ state.focusTarget=0; setMode('PATH_GLIDE'); setTimeout(()=>{state.focusId=null;focusCard(id,true)},reduced?90:380) }
function viewerContentFor(c){
 state.viewerSnapshot={phase:state.phase,velocity:state.velocity,cameraX:state.cameraX,cameraY:state.cameraY,targetCameraX:state.targetCameraX,targetCameraY:state.targetCameraY,focusId:state.focusId};
 state.viewerMomentId=c.id; state.viewerPlaying=false; state.mediaViewerOpen=true; mediaViewer.classList.add('open');mediaViewer.setAttribute('aria-hidden','false');mediaTitle.textContent=c.title;mediaKicker.textContent=`MOMENT · ${c.type.toUpperCase()}
${c.first?' · FIRST':''}
`;mediaWhy.textContent=c.whyNext;mediaMeta.innerHTML=`<span>${escapeRecord(c.date)}
</span><span>${escapeRecord(c.emotion)}</span><span>${c.type.toUpperCase()}
</span>${c.type==='video'?`<span>영상 예시 이미지 · 원본 영상 없음</span>`:''}${c.source?`<span>${escapeRecord(c.source)}
</span>`:''}`;mediaTypeBadge.textContent=c.type.toUpperCase();mediaVisual.classList.toggle('contain',c.fitMode==='contain');mediaVisual.classList.remove('previewPlaying');
 mediaImage.hidden=c.type==='memo';mediaMemo.hidden=c.type!=='memo';mediaPlay.hidden=true;mediaPlayAction.hidden=true;mediaExternal.hidden=true;
 if(c.type==='memo'){mediaMemoBody.textContent=c.memo||c.title;mediaMemoDate.textContent=`${escapeRecord(c.date)} · ${escapeRecord(c.emotion)}`;mediaTypeBadge.textContent='MEMO';}
 else {mediaImage.src=c.image;mediaImage.alt=c.title;const vf=c.viewerFitMode||c.fitMode||'contain',vp=c.viewerObjectPosition||c.objectPosition||'50% 50%';mediaImage.style.setProperty('--viewer-fit',vf);mediaImage.style.setProperty('--viewer-pos',vp);mediaImage.style.objectFit=vf;mediaImage.style.objectPosition=vp;}
 if(c.type==='link' && c.externalUrl){mediaExternal.hidden=false;mediaExternal.href=c.externalUrl;}
 if(c.type==='video'){mediaPlayAction.textContent='PLAY MOMENT';mediaPlay.textContent='▶';}
 setMode('MOMENT_MEDIA_VIEWER');
}
function openMoment(){ const c=CARDS.find(x=>x.id===state.focusId); if(!c)return; viewerContentFor(c); }
function openCardDirect(id){const c=CARDS.find(x=>x.id===id);if(!c||state.mediaViewerOpen)return false;focusCard(id);viewerContentFor(c);state.directOpenCount=(state.directOpenCount||0)+1;state.lastDirectOpen={id,phase:state.phase,at:performance.now()};return true;}
function toggleViewerPlay(){const c=CARDS.find(x=>x.id===state.viewerMomentId);if(!c||c.type!=='video')return;state.viewerPlaying=!state.viewerPlaying;mediaVisual.classList.toggle('previewPlaying',state.viewerPlaying);mediaPlay.textContent=state.viewerPlaying?'Ⅱ':'▶';mediaPlayAction.textContent=state.viewerPlaying?'미리보기 멈추기':'PLAY MOMENT';}
function closeMediaViewer(){if(!state.mediaViewerOpen)return;const snap=state.viewerSnapshot;state.mediaViewerOpen=false;state.viewerPlaying=false;mediaVisual.classList.remove('previewPlaying');mediaViewer.classList.remove('open');mediaViewer.setAttribute('aria-hidden','true');if(snap){state.phase=snap.phase;state.velocity=snap.velocity;state.cameraX=snap.cameraX;state.cameraY=snap.cameraY;state.targetCameraX=snap.targetCameraX;state.targetCameraY=snap.targetCameraY;state.focusId=snap.focusId;}state.viewerSnapshot=null;setMode(state.focusId?'MOMENT_FOCUS':'ORBIT_INTERACT');}
const TRACK59_RELATIVE='../../59_메모리스케치북_페이지여정/버전5_스토리자동재생·인라인편집·시네마틱배경_최신후보/현재후보.html';
const TRACK59_EXPECTED_TITLE='LoveTree · Living Memory Book · Track 59 V5';
function handoffPayload(){const c=CARDS.find(x=>x.id===state.focusId)||CARDS.find(x=>x.id===state.lastFocused);const i=c?CARDS.indexOf(c):-1;return {sourceTrack:64,currentMomentId:c?.id||null,currentMomentType:c?.type||null,whyNext:c?.whyNext||'',previousMoment:c?(CARDS.find(x=>x.next===c.id||x.branch===c.id)?.id||null):null,nextMoment:c?.next||null,activePath:[c?.id,c?.next].filter(Boolean),branch:c?.branch||null,orbitPhase:state.phase,timestamp:new Date().toISOString()};}
function showLocalNotice(text){localNoticeText.innerHTML=text;localNotice.classList.add('open');clearTimeout(showLocalNotice.t);showLocalNotice.t=setTimeout(()=>localNotice.classList.remove('open'),4800);}
function resolveTrack59Target(){if(location.protocol!=='file:')throw new Error('LOCAL_FILE_REQUIRED');if(!TRACK59_RELATIVE.toLowerCase().endsWith('.html'))throw new Error('TARGET_NOT_HTML');return new URL(TRACK59_RELATIVE,location.href).href;}
function openStoryBook(){if(!LTDEMO.example){parent.postMessage({type:'lt41-navigate',view:'track59-sketchbook.html'},location.origin);return}const payload=handoffPayload();try{localStorage.setItem('lovetree.track64.handoff',JSON.stringify(payload));}catch(e){}let href='';try{href=resolveTrack59Target();}catch(e){state.navigationAttempt={kind:'track59',protocol:location.protocol,relative:TRACK59_RELATIVE,resolvedHref:'',expectedTitle:TRACK59_EXPECTED_TITLE,attempted:false,error:e?.message||String(e)};showLocalNotice('책으로 보기는 Google Drive 동기화 로컬 HTML에서 실행됩니다.');return '';}state.navigationAttempt={kind:'track59',protocol:location.protocol,relative:TRACK59_RELATIVE,resolvedHref:href,expectedTitle:TRACK59_EXPECTED_TITLE,attempted:true};const opened=window.open(href,'_blank');if(!opened){location.href=href;}return href;}
function openTree(){showLocalNotice('MY TREE도 Google Drive 폴더로 보내지 않습니다. 현재 V1.1은 Track59 direct-local Gate를 우선 검증하며 Track56 exact local target은 별도 canonical target이 필요합니다.');}
function closePanels(){menuPanel.classList.remove('open');indexPanel.classList.remove('open')}
function openBook(){return openStoryBook()}
function buildIndex(filter='all'){const list=document.getElementById('momentList');list.innerHTML='';let arr=CARDS;if(filter==='recent')arr=CARDS.slice(-12);if(filter==='important')arr=CARDS.filter(c=>c.important);if(filter==='video')arr=CARDS.filter(c=>c.type==='video');if(filter==='memo')arr=CARDS.filter(c=>c.type==='memo');for(const c of arr){const b=document.createElement('button');b.className='momentRow';b.innerHTML=`<small>${momentSeq(c)}</small><b>${escapeRecord(c.title)}</b><span class="type">${c.type.toUpperCase()}</span>`;b.onclick=()=>focusCard(c.id);list.appendChild(b)}}
buildIndex();
// pointer interaction
function pickCardAt(px,py){let best=null,bestScore=-1e9;for(const el of document.querySelectorAll('.card')){const r=el.getBoundingClientRect(),op=parseFloat(getComputedStyle(el).opacity)||0;if(op<.12)continue;const pad=34;if(px>=r.left-pad&&px<=r.right+pad&&py>=r.top-pad&&py<=r.bottom+pad){const zi=parseInt(el.style.zIndex||'0',10);const score=zi+op*120;if(score>bestScore){bestScore=score;best=el.dataset.id}}}return best;}
app.addEventListener('pointerdown',e=>{ if(e.target.closest('button,a,.drawer,.menuPanel,.focusInfo,.mediaViewer'))return; state.pointerId=e.pointerId;state.dragging=true;state.dragMoved=0;state.downCardId=e.target.closest('.card')?.dataset.id||pickCardAt(e.clientX,e.clientY)||null;state.lastX=e.clientX;state.lastY=e.clientY;state.lastT=performance.now();app.setPointerCapture?.(e.pointerId); });
app.addEventListener('pointermove',e=>{ state.targetCameraX=(e.clientX-innerWidth/2)*.025;state.targetCameraY=(e.clientY-innerHeight/2)*.018; if(!state.dragging||e.pointerId!==state.pointerId)return;const now=performance.now(),dx=e.clientX-state.lastX,dy=e.clientY-state.lastY,dt=Math.max(8,now-state.lastT);state.dragMoved+=Math.hypot(dx,dy);state.phase+=dx*.0038;state.velocity=(dx/dt)*.0035;state.lastX=e.clientX;state.lastY=e.clientY;state.lastT=now;setMode('ORBIT_INTERACT'); });
function endPointer(e){if(!state.dragging)return;const tapLimit=innerWidth<700?14:10;const openId=(state.dragMoved<=tapLimit&&!state.focusId)?state.downCardId:null;state.dragging=false;state.pointerId=null;state.downCardId=null;if(openId)openCardDirect(openId);} app.addEventListener('pointerup',endPointer);app.addEventListener('pointercancel',e=>{state.downCardId=null;endPointer(e)});
app.addEventListener('wheel',e=>{if(state.focusId)return;e.preventDefault();state.velocity+=(-e.deltaY-e.deltaX)*.0000023;state.velocity=Math.max(-.012,Math.min(.012,state.velocity));setMode('ORBIT_INTERACT')},{passive:false});
world.addEventListener('pointerover',e=>{const c=e.target.closest('.card');if(c&&!state.dragging&&!state.focusId){state.hoverId=c.dataset.id;setMode('CARD_HOVER')}});world.addEventListener('pointerout',e=>{const c=e.target.closest('.card');if(c&&state.hoverId===c.dataset.id){state.hoverId=null;setMode('ORBIT_INTERACT')}});
world.addEventListener('click',e=>{});
// controls
document.getElementById('menuBtn').onclick=()=>{closePanels();menuPanel.classList.toggle('open')};document.getElementById('closeFocus').onclick=()=>closeFocus(true);document.getElementById('openMoment').onclick=openMoment;document.getElementById('continuePath').onclick=continuePath;document.getElementById('prevMoment').onclick=()=>{const incoming=CARDS.filter(x=>LTDEMO.edges.some(e=>e.kind==='parent'&&e.from===x.id&&e.to===state.focusId)); if(incoming.length===1){glideTo(incoming[0].id);return} if(incoming.length>1){const buttons=[document.getElementById('mainBranch'),document.getElementById('sideBranch')]; incoming.slice(0,2).forEach((c,i)=>{buttons[i].innerHTML=branchMarkup(c,'PREVIOUS');buttons[i].onclick=()=>{branchChoice.classList.remove('open');glideTo(c.id)}});branchChoice.classList.add('open');setMode('BRANCH_CHOICE')}};document.getElementById('nextMoment').onclick=continuePath;document.getElementById('storyBook').onclick=openStoryBook;mediaClose.onclick=closeMediaViewer;mediaPlay.onclick=toggleViewerPlay;mediaPlayAction.onclick=toggleViewerPlay;
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{const a=b.dataset.action;if(a==='continue')focusCard(LTDEMO.get());if(a==='first')focusCard(LTDEMO.moments.find(m=>m.first)?.id);if(a==='tree')openTree()});
document.querySelectorAll('[data-menu]').forEach(b=>b.onclick=()=>{const a=b.dataset.menu;if(a==='moments'){closePanels();indexPanel.classList.add('open')};if(a==='continue')focusCard(LTDEMO.get());if(a==='first')focusCard(LTDEMO.moments.find(m=>m.first)?.id);if(a==='tree')openTree();if(a==='book')openBook()});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=closePanels);mediaViewer.addEventListener('click',e=>{if(e.target===mediaViewer)closeMediaViewer()});addEventListener('keydown',e=>{if(e.key==='Escape'){if(state.mediaViewerOpen)closeMediaViewer();else if(state.focusId)closeFocus(true);}});document.querySelectorAll('.filterBtn').forEach(b=>b.onclick=()=>{document.querySelectorAll('.filterBtn').forEach(x=>x.classList.remove('active'));b.classList.add('active');buildIndex(b.dataset.filter)});
// expose deterministic QA hooks
window.__TRACK64__={
 getState:()=>JSON.parse(JSON.stringify(state)),
 getCards:()=>CARDS.map(c=>({id:c.id,type:c.type,title:c.title,ring:c.ring,first:c.first,branch:c.branch,mediaType:c.mediaType,fitMode:c.fitMode,objectPosition:c.objectPosition,focalPoint:c.focalPoint,viewerFitMode:c.viewerFitMode,curated:c.curated,curationClass:c.curationClass,gender:c.gender,assetSource:c.assetSource})),
 getProjection:(id)=>proj.get(id)?{...proj.get(id)}:null,
 setPhase:(v)=>{state.phase=v;state.velocity=0}, setVelocity:(v)=>state.velocity=v,
 focus:(id)=>focusCard(id),directOpen:(id)=>openCardDirect(id), close:()=>closeFocus(true), continuePath, glideTo,
 openMenu:()=>menuPanel.classList.add('open'), openIndex:()=>{closePanels();indexPanel.classList.add('open')},openTree,openBook:openStoryBook,
 openViewer:()=>openMoment(),closeViewer:()=>closeMediaViewer(),toggleViewerPlay, getViewer:()=>({open:state.mediaViewerOpen,momentId:state.viewerMomentId,playing:state.viewerPlaying,directOpenCount:state.directOpenCount||0,lastDirectOpen:state.lastDirectOpen||null}),getNavigation:()=>state.navigationAttempt,track59Relative:TRACK59_RELATIVE,track59ExpectedTitle:TRACK59_EXPECTED_TITLE,
 play:()=>openMoment(),
 snapshot:()=>({phase:state.phase,velocity:state.velocity,cameraX:state.cameraX,cameraY:state.cameraY,focusId:state.focusId,mode:state.mode,projections:Object.fromEntries([...proj.entries()].map(([k,v])=>[k,{x:v.x,y:v.y,z:v.z,scale:v.scale}]))})
};
requestAnimationFrame(render);
setTimeout(()=>setMode('WELCOME_IDLE'),10);


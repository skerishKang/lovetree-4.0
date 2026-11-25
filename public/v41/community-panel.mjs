import {createCommunityApi} from './community-api.mjs';
import {memberLoginUrl} from './member-entry.mjs';
import {readTheme} from './header-state.mjs';
import {displayTreeTitle} from './tree-name.mjs';
import {tagKey} from './tags.mjs';
import {youtubeIdFrom,youtubeStageThumbUrl} from './youtube-id.mjs';
// #480 L13: 둘러보기 카드·댓글의 날짜도 책·보드·지도와 같은 한 벌로 적는다.
import {formatDisplayDate} from './book-usability.mjs';
import {matchGroups,sectionGroups} from './group-search.mjs';
// #547·#701 규칙: 서버가 내려주는 시각(UTC 타임스탬프)은 기기 지역 날짜로 바꿔 보여 준다(#547 한 벌).
import {localDateOnly} from './local-date.mjs';
// #792 4단계 ⑤: 공개 무대 담기 단추와 '이번 주 인기 무대' 줄의 규칙은 community-stages.mjs 한 곳에 둔다.
import {POPULAR_STAGE_TITLE,POPULAR_STAGE_WEEK_LABEL,publicStageCount,stageVoteLabel,stageVoteNotice,stageMomentTitle,readStage,toggleStage} from './community-stages.mjs';
// #1025: [순간] 탭 — 공개 세로 순간 숏츠 보기(서버 조회·세로 판정은 기존 한 벌 재사용).
import {mountMoments} from './community-moments.mjs';
import {createExploreLayers} from './community-history.mjs';
// #1098 2단계: 판의 순간 목록 — 순간 카드에 그 순간의 ♡·댓글 수, ♡ 누르기·댓글 쓰기는 순간 단위 API(서버 #1136).
import {mountMomentList} from './community-moment-list.mjs';
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
// 셸이 낯선 주소를 #home으로 바꾸기 전에(module import 시점) 직접 들어온 주소를 기억한다(#1025).
const hashNow=()=>typeof location!=='undefined'?(location.hash||''):'';
export function mountCommunity({button,dialog,onOpenShare,onStartRecord,onShareOwn,hasOwnTree,getDateStyle,getArtistGroups=()=>[],onAddToTree,notify,memberLogin}){
 const api=createCommunityApi(),form=dialog.querySelector('#community-search-form'),query=dialog.querySelector('#community-query'),list=dialog.querySelector('#community-list'),groups=dialog.querySelector('#community-groups'),feedback=dialog.querySelector('#community-feedback'),more=dialog.querySelector('#community-more'),preview=dialog.querySelector('#community-preview'),sortSelect=dialog.querySelector('#community-sort');
 // #1025: [트리] [순간] 탭 — 주소 #explore/moments 는 새로고침·공유로 유지한다.
 const treeTab=dialog.querySelector('#community-tab-trees'),momentsTab=dialog.querySelector('#community-tab-moments');
 const treePanel=dialog.querySelector('#community-tree-panel'),momentsPanel=dialog.querySelector('#community-moments-panel');
 // 탭·찾기·정렬을 어느 보기에서나 같은 높이의 한 줄에 둔다.
 const toolbarTabs=dialog.querySelector('.community-tabs'),topRow=el('div','community-top-row'),sortLabel=form.querySelector('.community-sort-label');
 toolbarTabs.before(topRow);topRow.append(toolbarTabs,form,sortLabel);
 const searchTrigger=el('button','community-search-trigger','🔍 찾기');
 searchTrigger.type='button';searchTrigger.setAttribute('aria-label','찾기 열기');
 form.insertBefore(searchTrigger,query);
 query.placeholder='찾기';query.setAttribute('aria-label','가수·노래·무대 찾기');
 const sortSymbol=el('span','community-sort-symbol','↕');sortSymbol.setAttribute('aria-hidden','true');
 sortLabel.prepend(sortSymbol);
 const popularOption=sortSelect?.querySelector("option[value=popular]");
 if(popularOption)popularOption.textContent="인기순";
 const expandSearch=()=>{form.classList.add('is-expanded');searchTrigger.setAttribute('aria-expanded','true');query.focus();};
 searchTrigger.setAttribute('aria-expanded','false');searchTrigger.onclick=expandSearch;
 query.addEventListener('blur',()=>{setTimeout(()=>{if(!form.contains(document.activeElement)&&!query.value.trim()){form.classList.remove('is-expanded');searchTrigger.setAttribute('aria-expanded','false');}},0);});

 // #480 L13: 계정 설정의 날짜 표기. 넘겨받지 않으면 기본(dot) — 새 규칙을 만들지 않는다.
 const dateStyle=()=>(typeof getDateStyle==='function'?getDateStyle():'dot');
 // 하은 1회차(261116,#728 후속): 새벽(KST 0~9시, UTC 전날)에 담은 순간의 둘러보기 카드가
 // '2026. 11. 15'(UTC 날짜 절단)로 나왔다. 예전 String(createdAt).slice(0,10) 절단 대신
 // localDateOnly(#547 한 벌)로 기기 지역 날짜를 만들어 formatDisplayDate에 넘긴다.
 const when=value=>formatDisplayDate(localDateOnly(value),dateStyle());
 const historyLayers=createExploreLayers();
 const moments=momentsPanel?mountMoments({panel:momentsPanel,onOpenShare,onAddToTree,notify,memberLogin,api,when,historyLayers}):null;
 let currentTab='trees',hashGuard=false;
 const writeHash=value=>{
  if(typeof history==='undefined'||typeof history.pushState!=='function'||typeof history.replaceState!=='function')return;
  hashGuard=true;
  (value?history.pushState:history.replaceState).call(history,null,'',value||'#home');
  setTimeout(()=>{hashGuard=false;},0);
 };
  let cursor='',loading=false,items=[],selectedId=null,selectedArtist='',loadId=0,publicGroups=[];
 // #784 그룹 찾기 창·자동완성 상태. publicGroupsAll는 서버가 내려주는 전체 목록(discover)이며
 // publicGroups(칩용 상위 8)와 내 트리의 가수(getArtistGroups)를 tagKey로 하나로 합쳐 쓴다.
 // 새 저장소 키는 없다(#914와 같다).
 let publicGroupsAll=[];
 const suggestions=el('ul','community-suggest');suggestions.setAttribute('role','listbox');suggestions.id='community-suggest';suggestions.hidden=true;
 let suggestActive=-1;
 const groupIndex=()=>{
  const seen=new Map();
  const add=(name,count)=>{const key=tagKey(name||'');if(!key)return;if(!seen.has(key))seen.set(key,{group:String(name).trim(),count});};
  for(const g of publicGroupsAll||[])add(g.value,g.count);
  for(const g of publicGroups||[])add(g.value,g.count);
  return [...seen.values()].sort((a,b)=>String(a.group).localeCompare(String(b.group),'ko'));
 };
 const message=text=>{
  feedback.textContent=text;
  const unfiltered=!selectedArtist&&!query.value.trim();
  feedback.hidden=unfiltered&&(/^(공개된 트리 |아직 공개된 트리|공개 트리를 불러오는 중)/).test(text);
  const previewMessage=preview.querySelector('[data-community-preview-message]');if(previewMessage)previewMessage.textContent=text;
 };
 const loginMessage=answer=>answer.status===401?'로그인하면 이 기능을 사용할 수 있어요.':answer.message||'요청을 처리하지 못했어요.';
 // #824 결정 7: 3 미만 숫자는 보여 주지 않는다 — 라벨만 남긴다(0·1·2 모두 같은 규칙, 3부터 숫자가 보인다).
 // '이번 주 담은 사람 수'(결정 1)도 같은 규칙 — 3 이상일 때만 카드·미리보기에 한 줄로 따라온다.
 const smallCountLabel=(label,count)=>Number(count)>=3?`${label} ${count}`:label;
 const weeklyNote=item=>{const n=Number(item.stats?.weeklyFavorites||0);return n>=3?`이번 주 ${n}명`:'';};
 // #1098 1단계 후속(대표 지정 2026-11-22): 반응 수는 ♡ 단추 한 곳에만 보이게 — 한 줄 정보에는 댓글 수만 남긴다.
 // 반응 통계가 없는 응답(예전 모양)에서는 예전과 같이 심장(공감) 수로 센다.
 const reactionTotal=item=>{const counts=item.stats?.reactions;if(counts)return Object.values(counts).reduce((sum,value)=>sum+Number(value||0),0);return Number(item.stats?.hearts||0);};
 const previewMetaText=item=>`${item.cover?.emotion||item.emotions?.[0]||'공개'} · ${when(item.createdAt)} · ${smallCountLabel('댓글',item.stats?.comments||0)}${weeklyNote(item)?` · ${weeklyNote(item)}`:''}`;
 // #903: 담기·공감이 서버에 막히면(가입 7일 미만 등) 서버 문구를 단추 바로 다음 줄 안내 칸에도 내린다 —
 // 누른 자리에서 바로 이유를 보게 한다. 칸은 미리보기를 그릴 때 actions 다음에 미리 두고(hidden),
 // 막혔을 때만 보여 준다. 담기에 성공하면 render()가 미리보기를 다시 그려 안내가 지워진다.
 const setVoteNote=(note,text)=>{if(!note)return;note.textContent=text;note.hidden=false;};
 // 투표 막힘(가입 7일 미만)은 단추 아래 안내 칸 하나만 내리고 상태 줄은 그대로 둔다(#903) — 다른 실패는 상태 줄로.
 const voteBlocked=answer=>answer?.code==='vote_too_new';
 // #792 ⑤: 표지 순간이 공개 무대일 때만 '이 무대 담기' 단추를 그 자리에서 붙인다(아니면 상자를 열지 않는다).
 // 안내 칸은 단추 바로 아래에 둔다 — 즐겨찾기·공감 단추는 윗줄에 그대로 선다.
 async function mountStageVote(item,box){
  const stage=await readStage({api,shareId:item.shareId,momentId:item.cover?.momentId});
  if(!stage||!box.isConnected)return;
  const note=el('p','community-stage-note');note.setAttribute('role','status');note.hidden=true;
  const button=el('button','community-mini community-stage-vote',stageVoteLabel(stage.voted));
  button.type='button';button.dataset.communityAction='stage';button.setAttribute('aria-pressed',String(stage.voted));
  button.onclick=async()=>{
   button.disabled=true;
   const result=await toggleStage({api,stageId:stage.stageId,voted:button.getAttribute('aria-pressed')==='true'});
   button.disabled=false;
   if(!result.ok){note.textContent=stageVoteNotice(result.answer);note.hidden=false;return;}
   button.textContent=stageVoteLabel(result.voted);button.setAttribute('aria-pressed',String(result.voted));
   note.hidden=true;
  };
  box.append(button,note);box.hidden=false;
 }
 function statButton(item,kind,label,voteNote){
  if(kind==='reaction')return reactionButtons(item,label,voteNote);
  const active=kind==='favorite'?item.stats.favored:item.stats.hearted,count=kind==='favorite'?item.stats.favorites:item.stats.hearts,b=el('button','community-mini',`${active?'✓ ':''}${smallCountLabel(label,count)}`);b.type='button';b.dataset.communityAction=kind;b.setAttribute('aria-pressed',String(active));
  b.onclick=async()=>{const answer=await api.favorite(item.shareId,!active);if(!answer.ok){const text=loginMessage(answer);if(voteBlocked(answer))setVoteNote(voteNote,text);else message(text);return;}item.stats=answer.stats;render();};return b;
 }
 // #678 후속·#1098 1단계: 반응은 ♡(공감) 하나를 크게 기본으로 보이고, 길게 누르면 7종 칩이 그 자리에서
 // 펼쳐진다 — 예전 '반응 남기기' 펼침 규칙(host를 칩들로 갈아끼우기)을 그대로 재사용한다. 펼침은
 // 0.45초 길게 누르기 외에 마우스 오른쪽(모바일 길게 누르기가 부르는 contextmenu)·Enter 길게 누르기로도 연다.
 const SVG_NS='http://www.w3.org/2000/svg';
 function heartIcon(filled){
  const svg=document.createElementNS(SVG_NS,'svg');
  for(const [key,value] of Object.entries({viewBox:'0 0 24 24',width:'26',height:'26','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);
  const path=document.createElementNS(SVG_NS,'path');
  path.setAttribute('d','M12 20.2 5 13.2a4.6 4.6 0 1 1 6.5-6.5l.5.5.5-.5a4.6 4.6 0 1 1 6.5 6.5L12 20.2Z');
  path.setAttribute('fill',filled?'currentColor':'none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.7');path.setAttribute('stroke-linejoin','round');
  svg.append(path);return svg;
 }
 function reactionButtons(item,label,voteNote){
  const kinds=['heart','like','love','laugh','wow','sad','angry'];
  const labels={heart:'공감',like:'좋아요',love:'사랑',laugh:'웃음',wow:'놀람',sad:'슬픔',angry:'화남'};
  const host=el('span','community-reaction-group');host.setAttribute('role','group');host.setAttribute('aria-label',label||'반응');
  const counts=item.stats.reactions||{heart:item.stats.hearts||0};const mine=new Set(item.stats.mine||[]);
  const active=kind=>mine.has(kind)||(kind==='heart'&&item.stats.hearted&&!item.stats.mine);
  const chips=()=>{
   const out=[];
   for(const reactionKind of kinds){
    const count=counts[reactionKind]||0;
    const isActive=active(reactionKind);
    // 이 칩들은 길게 눌러 펼친 '고르는 자리'에만 쓰인다 — 고르려면 0개인 종류도 보여야 하고(#1098 1단계),
    // 숫자는 #824 결정 7 규칙(3 미만은 라벨만)을 그대로 따른다.
    const b=el('button','community-mini community-reaction',`${isActive?'✓ ':''}${smallCountLabel(labels[reactionKind]||reactionKind,count)}`);
    b.type='button';b.dataset.reactionKind=reactionKind;b.dataset.communityAction='reaction';b.setAttribute('aria-pressed',String(isActive));
    b.onclick=async()=>{const answer=await api.react(item.shareId,!isActive,reactionKind);if(!answer.ok){const text=loginMessage(answer);if(voteBlocked(answer))setVoteNote(voteNote,text);else message(text);return;}item.stats=answer.stats;render();};
    out.push(b);
   }
   return out;
  };
  const reactionCount=reactionTotal(item),heartActive=active('heart');
  const main=el('button','community-mini community-reaction community-heart-main');
  main.type='button';main.dataset.communityAction='reaction';main.dataset.reactionKind='heart';
  main.setAttribute('aria-pressed',String(heartActive));
  main.setAttribute('aria-label',reactionCount>=3?`${labels.heart} · 반응 ${reactionCount}`:labels.heart);
  main.append(heartIcon(heartActive));
  if(reactionCount>=3)main.append(el('span','community-heart-count',String(reactionCount)));
  let pressTimer=null,revealed=false;
  const reveal=()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}if(revealed)return;revealed=true;host.replaceChildren(...chips());};
  const cancelPress=()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}};
  const startPress=()=>{cancelPress();pressTimer=setTimeout(reveal,450);};
  main.addEventListener('pointerdown',startPress);
  main.addEventListener('pointerup',cancelPress);
  main.addEventListener('pointercancel',cancelPress);
  main.addEventListener('pointerleave',cancelPress);
  main.addEventListener('contextmenu',event=>{event.preventDefault();reveal();});
  main.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&!event.repeat)startPress();});
  main.addEventListener('keyup',event=>{if(event.key==='Enter'||event.key===' ')cancelPress();});
  // 펼침 직후에 이어지는 click은 펼침의 부산물이니 반응 토글로 이어지지 않게 한 번 삼킨다.
  main.onclick=async()=>{if(revealed){revealed=false;return;}const answer=await api.react(item.shareId,!heartActive,'heart');if(!answer.ok){const text=loginMessage(answer);if(voteBlocked(answer))setVoteNote(voteNote,text);else message(text);return;}item.stats=answer.stats;render();};
  host.append(main);
  return host;
 }
 // #1098 1단계: 댓글을 '··· 더 보기' 메뉴에서 판 아래 바로 꺼낸다 — 최근 3개 + '댓글 모두 보기'.
 // 미리보기를 다시 그릴 때마다 다시 부르지 않게 공유 단위로 한 번만 불러온다(서버 목록은 최신 50개까지).
 const commentStates=new Map();
 async function comments(item,parts){
  const {host,heading=null,meta=null}=parts||{};
  const state=commentStates.get(item.shareId)||{list:null,expanded:false,loading:false};
  commentStates.set(item.shareId,state);
  const draw=()=>{
   const list=Array.isArray(state.list)?state.list:[];
   if(heading)heading.textContent=smallCountLabel('댓글',list.length);
   if(meta&&item.stats)meta.textContent=previewMetaText(item);
   const rows=el('div','community-comments');const visible=state.expanded?list:list.slice(0,3);
   for(const comment of visible){const row=el('article','community-comment'),editedNote=comment.edited?' · 수정됨':'',head=el('small','',`${comment.authorLabel} · ${when(comment.createdAt)}${editedNote}`),body=el('p','',comment.body);row.append(head,body);const tools=el('div','community-comment-tools');if(comment.canEdit){const edit=el('button','community-link','수정');edit.type='button';edit.onclick=()=>startEdit(row,comment,parts,item);tools.append(edit);}if(comment.canDelete){const remove=el('button','community-link','삭제');remove.type='button';remove.onclick=async()=>{const result=await api.removeComment(comment.id);if(result.ok)await comments(item,parts);else message(loginMessage(result));};tools.append(remove);}if(tools.children.length)row.append(tools);rows.append(row);}
   if(!list.length)rows.append(el('p','community-muted','첫 댓글을 남겨 보세요.'));
   if(!state.expanded&&list.length>3){const more=el('button','community-mini','댓글 모두 보기');more.type='button';more.onclick=()=>{state.expanded=true;draw();};rows.append(more);}
   const write=el('form','community-comment-form'),input=el('textarea',''),submit=el('button','community-mini','댓글 남기기');input.maxLength=1000;input.required=true;input.placeholder='공개 트리에 남길 말을 적어 주세요.';submit.type='submit';write.append(input,submit);write.onsubmit=async event=>{event.preventDefault();submit.disabled=true;const result=await api.comment(item.shareId,input.value);submit.disabled=false;if(!result.ok){message(loginMessage(result));if(result.status===401){write.querySelector('.community-auth-notice')?.remove();const notice=el('p','community-auth-notice community-muted','댓글을 남기려면 로그인해 주세요. 입력은 이 화면에 남아 있어요. '),login=el('a','community-link','새 창에서 로그인');login.href=memberLoginUrl(readTheme(globalThis.localStorage));login.target='_blank';login.rel='noopener noreferrer';login.style.textDecoration='underline';notice.append(login);write.append(notice);}return;}await comments(item,parts);};host.replaceChildren(rows,write);
  };
  if(Array.isArray(state.list)){draw();return;}
  if(state.loading)return;
  state.loading=true;
  host.replaceChildren(el('p','community-muted','댓글을 불러오는 중이에요.'));
  const answer=await api.comments(item.shareId);
  state.loading=false;
  // 미리보기를 다시 그리거나 닫아 댓글 자리가 이미 떠났으면(연결 끊김) 그리지 않는다(mountStageVote와 같은 가드).
  if(!host.isConnected)return;
  if(!answer.ok){host.replaceChildren(el('p','community-muted',answer.message||'댓글을 불러오지 못했어요.'));return;}
  state.list=Array.isArray(answer.comments)?answer.comments:[];
  // 목록을 다 받았으면(50개 미만이면 그게 정확한 수) 겉에 보이는 댓글 수(stats)도 한 벌로 맞춘다.
  if(item.stats)item.stats.comments=state.list.length<50?state.list.length:Math.max(item.stats.comments||0,state.list.length);
  draw();
 }
 function startEdit(row,comment,parts,item){
  if(row.dataset.editing==='1')return;row.dataset.editing='1';
  const original=comment.body||'';const head=row.querySelector('small'),body=row.querySelector('p'),tools=row.querySelector('.community-comment-tools');
  row.replaceChildren();
  const form=el('form','community-comment-edit'),input=el('textarea','',original);input.maxLength=1000;input.required=true;input.value=original;
  const save=el('button','community-mini','저장');save.type='submit';
  const cancel=el('button','community-link','취소');cancel.type='button';
  form.append(input,save,cancel);
  form.onsubmit=async event=>{event.preventDefault();save.disabled=true;const result=await api.editComment(comment.id,input.value);save.disabled=false;if(!result.ok){message(loginMessage(result));return;}await comments(item,parts);};
  cancel.onclick=()=>{delete row.dataset.editing;row.replaceChildren();if(head)row.append(head);if(body)row.append(body);if(tools)row.append(tools);};
  row.append(form);
 }
   function artistGroupList(){
    let mine=[];try{mine=getArtistGroups?.()||[];}catch{}
    const publicSorted=[...(publicGroupsAll.length?publicGroupsAll:publicGroups)]
     .filter(group=>tagKey(String(group?.value??group??'').trim()))
     .sort((a,b)=>Number(b?.count||0)-Number(a?.count||0)||String(a?.value||'').localeCompare(String(b?.value||''),'ko'));
    const out=[],seen=new Set();
    const add=value=>{const text=String(value||'').trim(),key=tagKey(text);if(!key||seen.has(key))return;seen.add(key);out.push(text);};
    // 내 트리 가수는 로그인된 때만 데이터가 내려온다. 방문자는 공개 트리 수로만 정렬한다.
    for(const value of Array.isArray(mine)?mine:[])add(value);
    for(const group of publicSorted)add(group?.value);
    return out;
   }
 function renderGroups(){
  // 전체 → 내 그룹 → 공개 트리 수 많은 순서로 표시한다.
  // artistGroupList가 내 가수·공개 상위 8을 tagKey 한 줄로 맞춘 순서를 준다.
  const seen=new Set();
  const choices=[];
  const push=(value,label)=>{
   const key=tagKey(value||'');
   if(seen.has(key))return;
   seen.add(key);choices.push({value,label});
  };
  push('','전체');
  for(const value of artistGroupList())if(choices.length<8)push(value,value);
  // 지금 고른 그룹이 상위 칩 밖이라도 선택을 잃지 않도록 마지막 칩에 남긴다.
  if(selectedArtist&&!choices.some(choice=>tagKey(choice.value)===tagKey(selectedArtist))){
   if(choices.length>=8)choices.pop();
   push(selectedArtist,selectedArtist);
  }
  const visible=choices.slice(0,8);
  groups.replaceChildren(...visible.map(choice=>{
   const chip=el('button',`community-group-chip${choice.value===selectedArtist?' is-active':''}`,choice.label);
   chip.type='button';chip.setAttribute('aria-pressed',String(choice.value===selectedArtist));
   chip.onclick=()=>{selectedArtist=choice.value;renderGroups();load(false);};
   return chip;
  }));
 }
 function renderCover(item,{loading='lazy'}={}){
  const cover=el('div','community-cover'),youtube=item.cover?.type==='youtube',video=['video','youtube'].includes(item.cover?.type),vertical=video&&item.cover?.vertical===true;
  // #1322: 한 겹 규칙 — 흐린 배경+가운데 그림은 세로 영상만. 그 밖은 표지 한 장을 꽉 채운다.
  cover.dataset.mediaKind=vertical?'video-vertical':video?'video-landscape':'photo';
  // #1330: 위아래 띠 없는 썸네일(mqdefault·maxresdefault)을 먼저 쓰고, 없을 때만 나머지로 내려간다.
  const raw=item.cover?.thumbnailUrl||item.cover?.url||'';
  const youtubeId=youtubeIdFrom(item.cover?.url||'')||youtubeIdFrom(raw);
  const candidates=[];
  const add=url=>{if(url&&!candidates.includes(url))candidates.push(url)};
  // 가로는 띠 없는 썸네일을 먼저, 세로는 서버가 준 세로 원본을 먼저 쓴다.
  if(youtubeId&&!vertical){add(youtubeStageThumbUrl(youtubeId,'mqdefault'));add(youtubeStageThumbUrl(youtubeId,'maxresdefault'));}
  add(raw);
  if(youtubeId){add(youtubeStageThumbUrl(youtubeId,'mqdefault'));add(youtubeStageThumbUrl(youtubeId,'maxresdefault'));add(youtubeStageThumbUrl(youtubeId,'hqdefault'));}
  if(candidates.length){
   // #1026 묶음 D: 칸은 처음부터 같은 크기로 잡혀 있다(community-cover의 aspect-ratio).
   // 사진은 다 받은 뒤에만 0.2초로 나타난다 — 반쯤 내려온 그림이나 빈 칸→일부→완성 단계가 보이지 않는다.
   const art=el('span','community-cover-art');
   const ready=img=>{if(img.isConnected)img.classList?.add('is-ready')};
   let backdrop=null;
   if(vertical){
    backdrop=el('img','community-cover-backdrop');backdrop.alt='';backdrop.setAttribute('aria-hidden','true');backdrop.loading=loading;backdrop.classList?.add('is-loading');
    backdrop.addEventListener('load',()=>ready(backdrop),{once:true});
    backdrop.addEventListener('error',()=>{if(backdrop.isConnected)backdrop.remove()},{once:true});
    backdrop.src=candidates[0];if(backdrop.complete&&backdrop.naturalWidth)ready(backdrop);art.append(backdrop);
   }
   const image=el('img','community-cover-image');image.alt='';image.loading=loading;image.decoding='async';image.referrerPolicy='no-referrer';image.classList?.add('is-loading');
   image.addEventListener('load',()=>ready(image),{once:true});
   let at=0;
   image.onerror=()=>{
    at+=1;
    if(at<candidates.length){image.src=candidates[at];if(backdrop)backdrop.src=candidates[at];return;}
    if(image.isConnected)image.replaceWith(el('span','community-cover-fallback',item.cover?.title||'순간 사진을 불러오지 못했어요.'));
   };
   image.src=candidates[0];if(image.complete&&image.naturalWidth)ready(image);
   art.append(image);cover.append(art);
  }else cover.append(el('span','community-cover-fallback',item.cover?.title||'공개된 순간'));
  // #1322: 카드 위 배지는 모두 같은 자리·같은 크기로 아래 한 줄에 모은다.
  // #1330: 배지는 한 줄에 하나 — 명예회원 표시와 순간 수를 같은 단추에 담는다.
  const badges=el('span','community-cover-badges');
  const ai=item.aiTester===true;
  badges.append(el('span','community-cover-badge'+(ai?' community-ai':' community-count'),`${ai?'✦ AI · ':''}순간 ${item.momentCount}`));
  cover.append(badges);
  return cover;
 }
 function moreMenu(item){
  const details=el('details','community-more-menu'),summary=el('summary','community-more-button','⋯');
  // #1098 1단계: 댓글은 판 아래 바로 꺼냈고 ··· 메뉴에는 신고·차단만 남긴다.
  summary.setAttribute('aria-label','신고, 차단 메뉴');
  const panel=el('div','community-more-panel'),reportForm=el('form','community-report-form'),reportInput=el('input',''),reportButton=el('button','community-link','신고');
  reportInput.maxLength=500;reportInput.required=true;reportInput.placeholder='신고 이유';reportInput.setAttribute('aria-label','신고 이유');reportButton.type='submit';reportForm.append(reportInput,reportButton);
  reportForm.onsubmit=async event=>{event.preventDefault();const answer=await api.report(item.shareId,reportInput.value);message(answer.ok?'신고를 접수했어요. 운영 검토 전에는 자동 숨김 처리하지 않아요.':loginMessage(answer));if(answer.ok)reportInput.value='';};
  const block=el('button','community-link danger','이 공개자의 트리 숨기기');block.type='button';
  block.onclick=async()=>{if(!confirm('이 공개자의 트리를 내 둘러보기 목록에서 숨길까요?'))return;const answer=await api.block(item.shareId);if(!answer.ok){message(loginMessage(answer));return;}items=items.filter(value=>value.shareId!==item.shareId);selectedId=items[0]?.shareId||null;if(preview.open)preview.close();render();message('내 둘러보기 목록에서 숨겼어요.');if(!selectedId)groups.querySelector('.community-group-chip')?.focus();};
  panel.append(reportForm,block);details.append(summary,panel);
  return details;
 }
 function renderPreview(item){
  if(!item){preview.replaceChildren();return;}
  const head=el('div','community-preview-head'),eyebrow=el('p','community-preview-kicker','공개 순간 미리보기'),close=el('button','community-preview-close','×');
  close.type='button';close.setAttribute('aria-label','미리보기 닫기');close.onclick=()=>historyLayers.dismiss('tree-preview');head.append(eyebrow,close);
  const body=el('div','community-preview-body'),title=el('h3','',displayTreeTitle(item.title));title.id='community-preview-title';
  const subject=el('p','community-preview-subject',item.subject||''),moment=el('p','community-preview-moment-title',item.cover?.title||'공개된 순간');
  const summary=item.summary?el('p','community-preview-summary',item.summary):null;
  const meta=el('p','community-preview-meta',previewMetaText(item));
  const actions=el('div','community-preview-actions');
  // #903 후속(2026-11-22): 안내 칸은 담기 단추 바로 아래 전용 칸(세로 묶음)으로 미리 둔다(hidden).
  // 반응 칩이 펼쳐져 묶음이 여러 줄이 되어도, 안내가 떠도 ♡와 단추 줄이 갈라지지 않고 안내가 항상 담기 단추 바로 다음 줄에 온다(#1130 검사기 실패 111px).
  const voteNote=el('p','community-vote-note');voteNote.setAttribute('role','status');voteNote.hidden=true;
  const favWrap=el('div','community-fav-wrap');favWrap.append(statButton(item,'favorite','즐겨찾기',voteNote),voteNote);
  // #792 ⑤: 담기 단추 자리. 무대가 확인되기 전에는 비어 있고(자리도 차지하지 않는다), 확인되면 그 자리에서 열린다.
  const stageBox=el('div','community-stage-box');stageBox.hidden=true;
  actions.append(favWrap,statButton(item,'reaction','공감',voteNote),stageBox);
  const open=el('button','community-preview-open','대표 순간부터 감상');open.type='button';open.onclick=()=>{
    historyLayers.suspend('tree-preview',()=>{if(!dialog.open)openPanel();selectedId=item.shareId;renderPreview(item);if(!preview.open)preview.showModal();});
    onOpenShare(item);
   };
  const start=el('button','community-preview-start','내 기록 새로 시작');start.type='button';start.onclick=()=>{
    historyLayers.suspend('tree-preview',()=>{if(!dialog.open)openPanel();selectedId=item.shareId;renderPreview(item);if(!preview.open)preview.showModal();});
    onStartRecord(item.subject);
   };
  const status=el('p','community-preview-message','');status.dataset.communityPreviewMessage='';status.setAttribute('role','status');
  const choices=el('div','community-preview-choices');choices.append(open,start);
  // #1098 1단계: 댓글을 판 아래 바로 — 최근 3개 + '댓글 모두 보기'(⋯ 메뉴에는 신고·차단만 남는다).
  const commentSection=el('section','community-preview-comments');commentSection.setAttribute('aria-label','댓글');
  const commentHeading=el('h4','community-menu-title','댓글'),commentHost=el('div','community-comment-host');
  commentSection.append(commentHeading,commentHost);
  // #1098 2단계: 판의 순간 목록 — 판 위쪽(한 줄 정보·단추·트리 댓글)은 트리 숫자를 유지하고, 이 목록의 순간 카드만 그 순간의 ♡·댓글 수를 보인다.
  const momentSection=el('section','community-moment-list');momentSection.setAttribute('aria-label','순간 목록');momentSection.hidden=true;
  const momentHeading=el('h4','community-menu-title','순간 목록'),momentHost=el('div','community-moment-host');
  momentSection.append(momentHeading,momentHost);
  body.append(title,subject,moment);if(summary)body.append(summary);body.append(meta,actions,commentSection,momentSection,choices,moreMenu(item),status);
  preview.replaceChildren(head,renderCover(item,{loading:'eager'}),body);
  // 순간 목록은 판을 그릴 때 한 번 — 응답이 늦게 와도 다시 그리기(렌더 토큰)로 오래된 표시가 남지 않게 한다.
  mountMomentList({section:momentSection,host:momentHost,api,shareId:item.shareId,when,countLabel:smallCountLabel});
  if(item.cover?.momentId)mountStageVote(item,stageBox);
  comments(item,{host:commentHost,heading:commentHeading,meta});
 }
 function openPreview(item){selectedId=item.shareId;renderPreview(item);if(!preview.open){preview.showModal();historyLayers.open('tree-preview',()=>preview.close());}}
 function card(item){
  const titleText=displayTreeTitle(item.title),momentText=item.cover?.title||'공개된 순간';
  const weekly=weeklyNote(item),metaText=`${item.cover?.emotion||item.emotions?.[0]||'공개'} · ${when(item.createdAt)} · ${smallCountLabel('공감',item.stats?.hearts||0)}${weekly?` · ${weekly}`:''}`;
  const article=el('button','community-card');article.type='button';article.dataset.shareId=item.shareId;
  article.setAttribute('aria-label',`${titleText}. ${momentText}. ${metaText}`);
  article.append(renderCover(item),el('h3','community-card-title',titleText));
  // 서버가 AI 명예회원으로 표시한 트리에만 공개 이름을 붙인다.
  const owner=item.aiTester===true?String(item.publicDisplayName||'').trim():'';
  if(owner)article.append(el('small','community-card-owner','AI 명예회원 '+owner));
  article.append(el('p','community-card-moment',momentText));
  article.append(el('p','community-card-meta',metaText));
  article.onclick=()=>openPreview(item);return article;
 }
 function render(){
  const focusedAction=preview.open?document.activeElement?.dataset.communityAction:'';
  list.replaceChildren(...items.map(card));
  if(!items.length&&!loading){
   // 이슈 457 5번: 공유할 내 트리가 없으면(로그아웃·트리 0개) "내 트리 공유하기"가 아니라 "첫 트리 만들기"로 바꾼다.
   const canShare=!!hasOwnTree?.();
   // #784: 그룹을 골라 공개 트리가 없을 때 빈 안내를 두 번 겹치지 않는다 — 가운데 카드만 남긴다.
   const emptyText=selectedArtist?`'${selectedArtist}' 그룹의 공개 트리가 아직 없어요. 다른 그룹을 고르거나 검색을 바꿔 보세요.`:'아직 보여 줄 공개 트리가 없어요.';
   const empty=el('div','community-empty'),text=el('p','',emptyText),share=el('button','community-primary',canShare?'내 트리 공유하기':'첫 트리 만들기');
   share.type='button';share.onclick=canShare?(()=>onShareOwn?.()):(()=>onStartRecord?.());
   empty.append(text,share);list.append(empty);
  }
  if(preview.open&&selectedId){const selected=items.find(item=>item.shareId===selectedId);if(selected){renderPreview(selected);if(focusedAction)preview.querySelector(`[data-community-action="${focusedAction}"]`)?.focus();}}
 }
 async function load(append=false,stageReady=Promise.resolve()){
  if(append&&loading)return;
  const requestId=++loadId;loading=true;more.disabled=true;message('공개 트리를 불러오는 중이에요.');
  if(!append){items=[];cursor='';render();}
  const answer=await api.discover({q:query.value.trim(),artist:selectedArtist,cursor,limit:12,sort:sortSelect?.value||''});
  await stageReady;
  if(requestId!==loadId)return;
  loading=false;
  if(!answer.ok){message(answer.message||'공개 트리를 불러오지 못했어요.');more.hidden=true;more.disabled=false;render();return;}
  items=append?[...items,...answer.items]:answer.items;cursor=answer.nextCursor||'';more.hidden=!cursor;more.disabled=false;
  if(!append){publicGroups=Array.isArray(answer.groups)?answer.groups:[];publicGroupsAll=Array.isArray(answer.groupsAll)?answer.groupsAll:[];renderGroups();}
  // #784: 고른 그룹에 공개 트리가 없을 때 빈 안내를 위 한 줄에도 내지 않는다 — 가운데 카드에 하나만 남긴다.
  if(selectedArtist&&!answer.totalVisible)message('');
  else message(answer.totalVisible?`공개된 트리 ${answer.totalVisible}개를 찾았어요. ${(sortSelect?.value==='popular')?'많이 담긴 순서예요.':'새로 공개된 순서예요.'}`:'아직 공개된 트리가 없어요. 트리를 공개하면 여기에 나타나요.');
  render();
 }
 // #824 결정 2: 정렬을 바꾸면 목록을 처음부터 다시 불러온다.
 sortSelect.onchange=()=>load(false);
 for(const link of dialog.querySelectorAll('[data-community-view]'))link.onclick=()=>{dialog.close();[...document.querySelectorAll('[data-view]')].find(node=>node.dataset.view===link.dataset.communityView)?.click();};
 const tabs=()=>[...document.querySelectorAll('nav [data-view]')];
  // #1025: 탭을 바꿀 때마다 주소를 갱신한다(새로고침·공유로 같은 보기를 연다).
  function selectTab(which,{syncHash=true}={}){
   currentTab=which;
   const momentsOn=which==='moments';
   if(treeTab){treeTab.setAttribute('aria-selected',String(!momentsOn));treeTab.tabIndex=momentsOn?-1:0;}
   if(momentsTab){momentsTab.setAttribute('aria-selected',String(momentsOn));momentsTab.tabIndex=momentsOn?0:-1;}
   if(treePanel)treePanel.hidden=momentsOn;
   if(momentsPanel)momentsPanel.hidden=!momentsOn;
   if(moments)momentsOn?moments.activate():moments.deactivate();
   topRow.classList.toggle('is-moments',momentsOn);
   if(momentsOn){form.classList.remove('is-expanded');searchTrigger.setAttribute('aria-expanded','false');}
   if(syncHash&&hashNow()!==(momentsOn?'#explore/moments':'#explore'))writeHash(momentsOn?'#explore/moments':'#explore');
  }
  treeTab?.addEventListener('click',()=>selectTab('trees'));
  momentsTab?.addEventListener('click',()=>selectTab('moments'));
  const openPanel=()=>{
   if(dialog.open)return;
   dialog.showModal();button.setAttribute('aria-current','true');
   for(const t of tabs()){if(t.getAttribute('aria-current')==='true'){t.dataset.wasCurrent='1';t.setAttribute('aria-current','false');}}
   const wantMoments=hashNow()==='#explore/moments';
   selectTab(wantMoments?'moments':'trees',{syncHash:false});
   // 카드 요청은 인기 무대와 동시에 시작하고, 첫 그리기만 결과 또는 최대 300ms를 기다린다.
   if(!wantMoments){const stageReady=loadPopularStages();void load(false,stageReady);}
  };
  if(typeof window!=='undefined'&&typeof window.addEventListener==='function')window.addEventListener('hashchange',()=>{
   if(hashGuard)return;
   if(hashNow()==='#explore/moments'||hashNow()==='#explore'){openPanel();selectTab(hashNow()==='#explore/moments'?'moments':'trees',{syncHash:false});}
  });
 dialog.addEventListener('close',()=>{if(preview.open)preview.close();moments?.deactivate();button.setAttribute('aria-current','false');const emptyShown=!document.getElementById('empty')?.hidden;for(const t of tabs()){if(t.dataset.wasCurrent){delete t.dataset.wasCurrent;if(!emptyShown)t.setAttribute('aria-current','true');}}button.focus();
  if(!historyLayers.suspended('tree-preview')&&(hashNow()==='#explore/moments'||hashNow()==='#explore'))writeHash('');
 });
 preview.addEventListener('close',()=>{if(historyLayers.active('tree-preview'))historyLayers.dismiss('tree-preview');[...list.querySelectorAll('.community-card')].find(node=>node.dataset.shareId===selectedId)?.focus();});
 preview.addEventListener('click',event=>{if(event.target===preview)historyLayers.dismiss('tree-preview');});
 // #784 자동완성(#784 ②): 검색칸 입력마다 화면에서만 돌린다(네트워크 왕복 없음).
 // 후보를 누르거나 Enter하면 그 그룹을 고른 것으로(칩 맨 앞 + 목록 거름) 동작한다.
 const chooseGroup=name=>{selectedArtist=name;renderGroups();load(false);hideSuggest();};
 const hideSuggest=()=>{suggestions.hidden=true;suggestions.replaceChildren();suggestActive=-1;query.removeAttribute('aria-activedescendant');};
 const renderSuggest=list=>{
  suggestActive=-1;
  if(!list.length){suggestions.hidden=false;suggestions.replaceChildren(el('li','community-suggest-empty','이 이름과 맞는 그룹이 없어요. 검색을 이어서 해 보세요.'));return;}
  suggestions.hidden=false;
  suggestions.replaceChildren(...list.map((g,i)=>{
   const li=el('li',''),opt=el('button','community-suggest-option',`${g.group}  ·  공개 트리 ${g.count??0}`);
   li.id=`community-suggest-option-${i}`;opt.type='button';opt.setAttribute('role','option');opt.setAttribute('aria-selected','false');
   opt.onclick=()=>{query.value=g.group;chooseGroup(g.group);};
   li.append(opt);return li;
  }));
 };
 const updateSuggest=()=>{
  const q=query.value.trim();
  if(!q){hideSuggest();return;}
  renderSuggest(matchGroups(groupIndex(),q,{limit:5}));
 };
 const suggestMove=delta=>{
  const opts=[...suggestions.querySelectorAll('[role=option]')];
  if(!opts.length)return;
  suggestActive=(suggestActive+delta+opts.length)%opts.length;
  opts.forEach((opt,i)=>opt.setAttribute('aria-selected',String(i===suggestActive)));
  query.setAttribute('aria-activedescendant',`community-suggest-option-${suggestActive}`);
 };
 query.addEventListener('input',updateSuggest);
 query.addEventListener('keydown',event=>{
  if(suggestions.hidden)return;
  if(event.key==='ArrowDown'){event.preventDefault();suggestMove(1);}
  if(event.key==='ArrowUp'){event.preventDefault();suggestMove(-1);}
  if(event.key==='Enter'&&suggestActive>=0){event.preventDefault();suggestions.querySelectorAll('[role=option]')[suggestActive]?.click();}
  if(event.key==='Escape'){event.stopPropagation();hideSuggest();}
 });
 query.setAttribute('aria-expanded','false');
 form.append(suggestions);
 form.onsubmit=event=>{event.preventDefault();hideSuggest();load(false);};more.onclick=()=>load(true);dialog.querySelector('[data-close="community-panel"]').onclick=()=>dialog.close();
 // #784 그룹 찾기 창. 미리보기·둘러보기 판과 같은 <dialog showModal> 한 벌을 쓴다.
 const findDialog=el('dialog','community-group-find');findDialog.id='community-group-find';
 const findHead=el('div','community-group-find-head'),findClose=el('button','community-group-find-close','×');
 findClose.type='button';findClose.setAttribute('aria-label','그룹 찾기 닫기');
 const findTitle=el('h2','community-group-find-title','그룹 찾기');
 findHead.append(findTitle,findClose);
 const findQuery=el('input','community-group-find-query');
 findQuery.type='search';findQuery.placeholder='그룹 이름 찾기';findQuery.autocomplete='off';findQuery.setAttribute('aria-label','그룹 이름 찾기');
 const findList=el('div','community-group-find-list');findList.id='community-group-find-list';
 findDialog.append(findHead,findQuery,findList);
 findList.setAttribute('role','listbox');findList.setAttribute('aria-label','그룹 목록');
 let findActive=-1;
 const findOptions=()=>[...findList.querySelectorAll('[role=option]')];
 const renderFindList=q=>{
  const pool=groupIndex();
  const matched=q?matchGroups(pool,q,{limit:200}):pool;
  findList.replaceChildren();
  findActive=-1;
  if(!matched.length){findList.append(el('p','community-group-find-empty','이 이름과 맞는 그룹이 없어요. 다른 이름으로 찾기 말을 적어 보세요.'));return;}
  for(const section of sectionGroups(matched)){
   findList.append(el('h3','community-group-find-section',section.label));
   for(const g of section.items){
    const opt=el('button','community-group-find-option',`${g.group}  ·  공개 트리 ${g.count??0}`);
    opt.type='button';opt.setAttribute('role','option');opt.setAttribute('aria-selected','false');
    opt.dataset.groupName=g.group;
    opt.onclick=()=>{chooseGroup(g.group);historyLayers.dismiss('group-find');};
    findList.append(opt);
   }
  }
 };
 const findMove=delta=>{
  const opts=findOptions();
  if(!opts.length)return;
  findActive=(findActive+delta+opts.length)%opts.length;
  opts.forEach((opt,i)=>opt.setAttribute('aria-selected',String(i===findActive)));
  findQuery.setAttribute('aria-activedescendant',opts[findActive]?.id||'');
 };
 findQuery.addEventListener('input',()=>renderFindList(findQuery.value.trim()));
 findQuery.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'){event.preventDefault();findMove(1);}
  if(event.key==='ArrowUp'){event.preventDefault();findMove(-1);}
  if(event.key==='Enter'&&findActive>=0){event.preventDefault();findOptions()[findActive]?.click();}
  if(event.key==='Escape'){event.preventDefault();historyLayers.dismiss('group-find');}
 });
 // #784: 미리보기(#community-preview)처럼 찾기 창은 둘러보기 창 안에 둔다 —
 // 바깥에 뜨면 또 다른 modal dialog는 부모 modal을 닫아 버린다(Chromium). 미리보기와 같은 집 안에서 열린다.
 (dialog||document.body)?.appendChild?.(findDialog) ?? (() => { try { document.body?.appendChild?.(findDialog); } catch {} })();
 const findButton=el('button','community-group-find','그룹 찾기');findButton.type='button';
 findButton.onclick=()=>{renderFindList('');findQuery.value='';if(!findDialog.open){findDialog.showModal();historyLayers.open('group-find',()=>findDialog.close());}findQuery.focus();};
 // Esc 기본 동작(바깥 dialog 닫기 복원)을 막고 직접 닫아, 초점을 그룹 찾기 단추로 돌린다.
 findDialog.addEventListener('close',()=>{if(historyLayers.active('group-find'))historyLayers.dismiss('group-find');findButton.focus();});
 findClose.onclick=()=>historyLayers.dismiss('group-find');
 const rail=dialog.querySelector('.community-group-rail');
 findButton.hidden=true;dialog.append(findButton);
 // #792 ⑤: 둘러보기 제목 아래·검색칸 위에 '이번 주 인기 무대' 한 줄. 서버가 3표 미만을 빼고 내리므로
 // 화면도 같은 규칙으로 거른다(3 미만 숫자는 null과 함께 사라진다 — #824 결정 7).
 const popular=el('section','community-stages');popular.id='community-popular-stages';popular.setAttribute('aria-label',POPULAR_STAGE_TITLE);
 const popularList=el('div','community-stage-list');
 popular.append(el('h3','community-stages-title',POPULAR_STAGE_TITLE),popularList);
 if(rail&&typeof rail.before==='function')rail.before(popular);else treePanel.append(popular);
 const skeleton=el('div','community-stages-skeleton');skeleton.setAttribute('aria-hidden','true');
 const renderPopularStages=rows=>{
  const shown=(Array.isArray(rows)?rows:[]).filter(stage=>stage&&stage.stageId&&publicStageCount(stage.weeklyVoters)!==null);
  popularList.replaceChildren();
  // 빈 응답이면 뼈대와 제목을 통째로 접어 빈칸을 남기지 않는다.
  if(!shown.length){popular.hidden=true;popularList.replaceChildren();return;}
  popular.hidden=false;
  for(const stage of shown){
   const row=el('span','community-stage');row.dataset.stageId=stage.stageId;
   row.append(el('span','community-stage-title',stageMomentTitle(stage)),el('span','community-stage-count',`${POPULAR_STAGE_WEEK_LABEL} ${publicStageCount(stage.weeklyVoters)}`));
   popularList.append(row);
  }
 };
 async function loadPopularStages(){
  // 인기 무대 요청은 카드와 동시에 시작한다. 300ms 후 도착한 무대는 카드 위치를 밀지 않도록 버린다.
  let timer;
  const request=Promise.resolve().then(()=>api.popularStages()).catch(()=>null);
  const deadline=new Promise(resolve=>{timer=setTimeout(()=>resolve(null),300);});
  const answer=await Promise.race([request,deadline]);
  clearTimeout(timer);
  renderPopularStages(answer?.ok?answer.items:[]);
 }
 popularList.append(skeleton); // 불러오는 동안만 자리를 고정하는 뼈대
 button.onclick=openPanel;
 button.hidden=false;
 // 직접 들어온 주소와 연결 전에 접기 메뉴에서 고른 주소를 같은 길로 연다.
 if(hashNow()==='#explore'||hashNow()==='#explore/moments')openPanel();
}

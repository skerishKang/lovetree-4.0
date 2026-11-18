import {createCommunityApi} from './community-api.mjs';
import {memberLoginUrl} from './member-entry.mjs';
import {readTheme} from './header-state.mjs';
import {displayTreeTitle} from './tree-name.mjs';
import {tagKey} from './tags.mjs';
// #480 L13: 둘러보기 카드·댓글의 날짜도 책·보드·지도와 같은 한 벌로 적는다.
import {formatDisplayDate} from './book-usability.mjs';
import {matchGroups,sectionGroups} from './group-search.mjs';
// #547·#701 규칙: 서버가 내려주는 시각(UTC 타임스탬프)은 기기 지역 날짜로 바꿔 보여 준다(#547 한 벌).
import {localDateOnly} from './local-date.mjs';
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
export function mountCommunity({button,dialog,onOpenShare,onStartRecord,onShareOwn,hasOwnTree,getDateStyle,getArtistGroups=()=>[]}){
 const api=createCommunityApi(),form=dialog.querySelector('#community-search-form'),query=dialog.querySelector('#community-query'),list=dialog.querySelector('#community-list'),groups=dialog.querySelector('#community-groups'),feedback=dialog.querySelector('#community-feedback'),more=dialog.querySelector('#community-more'),preview=dialog.querySelector('#community-preview'),sortSelect=dialog.querySelector('#community-sort');
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
 const message=text=>{feedback.textContent=text;const previewMessage=preview.querySelector('[data-community-preview-message]');if(previewMessage)previewMessage.textContent=text;};
 // #480 L13: 계정 설정의 날짜 표기. 넘겨받지 않으면 기본(dot) — 새 규칙을 만들지 않는다.
 const dateStyle=()=>(typeof getDateStyle==='function'?getDateStyle():'dot');
 // 하은 1회차(261116,#728 후속): 새벽(KST 0~9시, UTC 전날)에 담은 순간의 둘러보기 카드가
 // '2026. 11. 15'(UTC 날짜 절단)로 나왔다. 예전 String(createdAt).slice(0,10) 절단 대신
 // localDateOnly(#547 한 벌)로 기기 지역 날짜를 만들어 formatDisplayDate에 넘긴다.
 const when=value=>formatDisplayDate(localDateOnly(value),dateStyle());
 const loginMessage=answer=>answer.status===401?'로그인하면 이 기능을 사용할 수 있어요.':answer.message||'요청을 처리하지 못했어요.';
 // #824 결정 7: 3 미만 숫자는 보여 주지 않는다 — 라벨만 남긴다(0·1·2 모두 같은 규칙, 3부터 숫자가 보인다).
 // '이번 주 담은 사람 수'(결정 1)도 같은 규칙 — 3 이상일 때만 카드·미리보기에 한 줄로 따라온다.
 const smallCountLabel=(label,count)=>Number(count)>=3?`${label} ${count}`:label;
 const weeklyNote=item=>{const n=Number(item.stats?.weeklyFavorites||0);return n>=3?`이번 주 ${n}명`:'';};
 // #903: 담기·공감이 서버에 막히면(가입 7일 미만 등) 서버 문구를 단추 바로 다음 줄 안내 칸에도 내린다 —
 // 누른 자리에서 바로 이유를 보게 한다. 칸은 미리보기를 그릴 때 actions 다음에 미리 두고(hidden),
 // 막혔을 때만 보여 준다. 담기에 성공하면 render()가 미리보기를 다시 그려 안내가 지워진다.
 const setVoteNote=(note,text)=>{if(!note)return;note.textContent=text;note.hidden=false;};
 // 투표 막힘(가입 7일 미만)은 단추 아래 안내 칸 하나만 내리고 상태 줄은 그대로 둔다(#903) — 다른 실패는 상태 줄로.
 const voteBlocked=answer=>answer?.code==='vote_too_new';
 function statButton(item,kind,label,voteNote){
  if(kind==='reaction')return reactionButtons(item,label,voteNote);
  const active=kind==='favorite'?item.stats.favored:item.stats.hearted,count=kind==='favorite'?item.stats.favorites:item.stats.hearts,b=el('button','community-mini',`${active?'✓ ':''}${smallCountLabel(label,count)}`);b.type='button';b.dataset.communityAction=kind;b.setAttribute('aria-pressed',String(active));
  b.onclick=async()=>{const answer=await api.favorite(item.shareId,!active);if(!answer.ok){const text=loginMessage(answer);if(voteBlocked(answer))setVoteNote(voteNote,text);else message(text);return;}item.stats=answer.stats;render();};return b;
 }
 function reactionButtons(item,label,voteNote){
  const kinds=['heart','like','love','laugh','wow','sad','angry'];
  const labels={heart:'공감',like:'좋아요',love:'사랑',laugh:'웃음',wow:'놀람',sad:'슬픔',angry:'화남'};
  const host=el('span','community-reaction-group');host.setAttribute('role','group');host.setAttribute('aria-label',label||'반응');
  const counts=item.stats.reactions||{heart:item.stats.hearts||0};const mine=new Set(item.stats.mine||[]);
  const active=kind=>mine.has(kind)||(kind==='heart'&&item.stats.hearted&&!item.stats.mine);
  // #678 후속(회차 지적): 0짜리 반응 칩 7개가 늘어서 시끄럽다 — 반응이 하나도 없으면 '반응 남기기'
  // 한 개만 보이고(누르면 7가지가 그 자리에서 펼쳐진다), 반응이 있으면 개수가 있는 것과 내가 누른 것만 보인다.
  const chips=()=>{
   const out=[];
   for(const reactionKind of kinds){
    const count=counts[reactionKind]||0;
    const isActive=active(reactionKind);
    if(!count&&!isActive)continue;
    const b=el('button','community-mini community-reaction',`${isActive?'✓ ':''}${smallCountLabel(labels[reactionKind]||reactionKind,count)}`);
    b.type='button';b.dataset.reactionKind=reactionKind;b.dataset.communityAction='reaction';b.setAttribute('aria-pressed',String(isActive));
    b.onclick=async()=>{const answer=await api.react(item.shareId,!isActive,reactionKind);if(!answer.ok){const text=loginMessage(answer);if(voteBlocked(answer))setVoteNote(voteNote,text);else message(text);return;}item.stats=answer.stats;render();};
    out.push(b);
   }
   return out;
  };
  const anyVisible=kinds.some(kind=>(counts[kind]||0)>0||active(kind));
  if(!anyVisible){
   const open=el('button','community-mini community-reaction-open','반응 남기기');
   open.type='button';open.dataset.communityAction='reaction';
   open.onclick=()=>host.replaceChildren(...chips());
   host.append(open);
   return host;
  }
  host.append(...chips());
  return host;
 }
 async function comments(item,host){
  host.replaceChildren(el('p','community-muted','댓글을 불러오는 중이에요.'));
  const answer=await api.comments(item.shareId);if(!answer.ok){host.replaceChildren(el('p','community-muted',answer.message||'댓글을 불러오지 못했어요.'));return;}
  const rows=el('div','community-comments');for(const comment of answer.comments){const row=el('article','community-comment'),editedNote=comment.edited?' · 수정됨':'',head=el('small','',`${comment.authorLabel} · ${when(comment.createdAt)}${editedNote}`),body=el('p','',comment.body);row.append(head,body);const tools=el('div','community-comment-tools');if(comment.canEdit){const edit=el('button','community-link','수정');edit.type='button';edit.onclick=()=>startEdit(row,comment,host,item);tools.append(edit);}if(comment.canDelete){const remove=el('button','community-link','삭제');remove.type='button';remove.onclick=async()=>{const result=await api.removeComment(comment.id);if(result.ok)comments(item,host);else message(loginMessage(result));};tools.append(remove);}if(tools.children.length)row.append(tools);rows.append(row);}if(!answer.comments.length)rows.append(el('p','community-muted','첫 댓글을 남겨 보세요.'));
  const write=el('form','community-comment-form'),input=el('textarea',''),submit=el('button','community-mini','댓글 남기기');input.maxLength=1000;input.required=true;input.placeholder='공개 트리에 남길 말을 적어 주세요.';submit.type='submit';write.append(input,submit);write.onsubmit=async event=>{event.preventDefault();submit.disabled=true;const result=await api.comment(item.shareId,input.value);submit.disabled=false;if(!result.ok){message(loginMessage(result));if(result.status===401){write.querySelector('.community-auth-notice')?.remove();const notice=el('p','community-auth-notice community-muted','댓글을 남기려면 로그인해 주세요. 입력은 이 화면에 남아 있어요. '),login=el('a','community-link','새 창에서 로그인');login.href=memberLoginUrl(readTheme(globalThis.localStorage));login.target='_blank';login.rel='noopener noreferrer';login.style.textDecoration='underline';notice.append(login);write.append(notice);}return;}await comments(item,host);};host.replaceChildren(rows,write);
 }
 function startEdit(row,comment,host,item){
  if(row.dataset.editing==='1')return;row.dataset.editing='1';
  const original=comment.body||'';const head=row.querySelector('small'),body=row.querySelector('p'),tools=row.querySelector('.community-comment-tools');
  row.replaceChildren();
  const form=el('form','community-comment-edit'),input=el('textarea','',original);input.maxLength=1000;input.required=true;input.value=original;
  const save=el('button','community-mini','저장');save.type='submit';
  const cancel=el('button','community-link','취소');cancel.type='button';
  form.append(input,save,cancel);
  form.onsubmit=async event=>{event.preventDefault();save.disabled=true;const result=await api.editComment(comment.id,input.value);save.disabled=false;if(!result.ok){message(loginMessage(result));return;}await comments(item,host);};
  cancel.onclick=()=>{delete row.dataset.editing;row.replaceChildren();if(head)row.append(head);if(body)row.append(body);if(tools)row.append(tools);};
  row.append(form);
 }
  function artistGroupList(){
   let mine=[];try{mine=getArtistGroups?.()||[];}catch{}
   const available=new Map();
   for(const group of publicGroups){
    const value=String(group?.value??group??'').trim(),key=tagKey(value);
    if(value&&key&&!available.has(key))available.set(key,value);
   }
   const seen=new Set(),out=[];
   const add=key=>{if(key&&available.has(key)&&!seen.has(key)){seen.add(key);out.push(available.get(key));}};
   for(const raw of Array.isArray(mine)?mine:[])add(tagKey(String(raw??'').trim()));
   for(const key of available.keys())add(key);
   return out.slice(0,7);
  }
 function renderGroups(){
  // 고른 그룹 → 전체 → 내 가수 → 공개 많은 순(최대 8칩, 한 줄 — #914 규칙 그대로).
  // artistGroupList가 내 가수·공개 상위 8을 tagKey 한 줄로 맞춘 순서를 준다.
  const seen=new Set();
  const choices=[];
  const push=(value,label)=>{
   const key=tagKey(value||'');
   if(seen.has(key))return;
   seen.add(key);choices.push({value,label});
  };
  if(selectedArtist)push(selectedArtist,selectedArtist);
  push('','전체');
  for(const value of artistGroupList())if(choices.length<8)push(value,value);
  const visible=choices.slice(0,8);
  groups.replaceChildren(...visible.map(choice=>{
   const chip=el('button',`community-group-chip${choice.value===selectedArtist?' is-active':''}`,choice.label);
   chip.type='button';chip.setAttribute('aria-pressed',String(choice.value===selectedArtist));
   chip.onclick=()=>{selectedArtist=choice.value;renderGroups();load(false);};
   return chip;
  }));
 }
 function duplicateLabel(item){
  const title=displayTreeTitle(item.title),moment=item.cover?.title||'';
  const matches=items.filter(value=>displayTreeTitle(value.title)===title&&(value.cover?.title||'')===moment);
  if(matches.length<2)return '';
  const publicName=String(item.publicDisplayName||'').trim();
  if(!publicName)return '';
  return `${item.aiTester===true?'AI 명예회원 ':''}${publicName}님`;
 }
 function renderCover(item,{loading='lazy'}={}){
  const cover=el('div','community-cover'),youtube=item.cover?.type==='youtube',video=['video','youtube'].includes(item.cover?.type),vertical=video&&item.cover?.vertical===true;
  cover.dataset.mediaKind=vertical?'video-vertical':youtube?'video-youtube':video?'video':'photo';
  const url=item.cover?.thumbnailUrl||item.cover?.url||'';
  if(url){
   const art=el('span','community-cover-art');
   if(vertical||youtube){const backdrop=el('img','community-cover-backdrop');backdrop.src=url;backdrop.alt='';backdrop.setAttribute('aria-hidden','true');backdrop.loading=loading;art.append(backdrop);}
   const image=el('img','community-cover-image');image.src=url;image.alt='';image.loading=loading;image.decoding='async';image.referrerPolicy='no-referrer';
   image.onerror=()=>{if(image.isConnected)image.replaceWith(el('span','community-cover-fallback',item.cover?.title||'순간 사진을 불러오지 못했어요.'));};
   art.append(image);cover.append(art);
  }else cover.append(el('span','community-cover-fallback',item.cover?.title||'공개된 순간'));
  if(item.aiTester===true)cover.append(el('span','community-cover-badge community-ai','AI 명예회원'));
  cover.append(el('span','community-cover-badge community-count',`순간 ${item.momentCount}`));
  return cover;
 }
 function moreMenu(item){
  const details=el('details','community-more-menu'),summary=el('summary','community-more-button','⋯');
  summary.setAttribute('aria-label','댓글, 신고, 차단 메뉴');
  const panel=el('div','community-more-panel'),commentTitle=el('h4','community-menu-title','댓글'),commentHost=el('div','community-comment-host');
  const reportForm=el('form','community-report-form'),reportInput=el('input',''),reportButton=el('button','community-link','신고');
  reportInput.maxLength=500;reportInput.required=true;reportInput.placeholder='신고 이유';reportInput.setAttribute('aria-label','신고 이유');reportButton.type='submit';reportForm.append(reportInput,reportButton);
  reportForm.onsubmit=async event=>{event.preventDefault();const answer=await api.report(item.shareId,reportInput.value);message(answer.ok?'신고를 접수했어요. 운영 검토 전에는 자동 숨김 처리하지 않아요.':loginMessage(answer));if(answer.ok)reportInput.value='';};
  const block=el('button','community-link danger','이 공개자의 트리 숨기기');block.type='button';
  block.onclick=async()=>{if(!confirm('이 공개자의 트리를 내 둘러보기 목록에서 숨길까요?'))return;const answer=await api.block(item.shareId);if(!answer.ok){message(loginMessage(answer));return;}items=items.filter(value=>value.shareId!==item.shareId);selectedId=items[0]?.shareId||null;if(preview.open)preview.close();render();message('내 둘러보기 목록에서 숨겼어요.');if(!selectedId)groups.querySelector('.community-group-chip')?.focus();};
  panel.append(commentTitle,commentHost,reportForm,block);details.append(summary,panel);
  details.ontoggle=()=>{if(details.open&&!commentHost.dataset.loaded){commentHost.dataset.loaded='1';comments(item,commentHost);}};
  return details;
 }
 function renderPreview(item){
  if(!item){preview.replaceChildren();return;}
  const head=el('div','community-preview-head'),eyebrow=el('p','community-preview-kicker','공개 순간 미리보기'),close=el('button','community-preview-close','×');
  close.type='button';close.setAttribute('aria-label','미리보기 닫기');close.onclick=()=>preview.close();head.append(eyebrow,close);
  const body=el('div','community-preview-body'),title=el('h3','',displayTreeTitle(item.title));title.id='community-preview-title';
  const subject=el('p','community-preview-subject',item.subject||''),moment=el('p','community-preview-moment-title',item.cover?.title||'공개된 순간');
  const summary=item.summary?el('p','community-preview-summary',item.summary):null;
  const weekly=weeklyNote(item),meta=el('p','community-preview-meta',`${item.cover?.emotion||item.emotions?.[0]||'공개'} · ${when(item.createdAt)} · ${smallCountLabel('공감',item.stats?.hearts||0)}${weekly?` · ${weekly}`:''}`);
  const actions=el('div','community-preview-actions');
  // #903: 안내 칸은 actions 바로 다음 줄자리에 미리 두고(hidden) 막혔을 때만 보인다 — 격자 간격이 흔들리지 않게.
  const voteNote=el('p','community-vote-note');voteNote.setAttribute('role','status');voteNote.hidden=true;
  actions.append(statButton(item,'favorite','즐겨찾기',voteNote),statButton(item,'reaction','공감',voteNote));
  const open=el('button','community-preview-open','대표 순간부터 감상');open.type='button';open.onclick=()=>onOpenShare(item);
  const start=el('button','community-preview-start','내 기록 새로 시작');start.type='button';start.onclick=()=>onStartRecord(item.subject);
  const status=el('p','community-preview-message','');status.dataset.communityPreviewMessage='';status.setAttribute('role','status');
  const choices=el('div','community-preview-choices');choices.append(open,start);
  body.append(title,subject,moment);if(summary)body.append(summary);body.append(meta,actions,voteNote,choices,moreMenu(item),status);
  preview.replaceChildren(head,renderCover(item,{loading:'eager'}),body);
 }
 function openPreview(item){selectedId=item.shareId;renderPreview(item);if(!preview.open)preview.showModal();}
 function card(item){
  const titleText=displayTreeTitle(item.title),momentText=item.cover?.title||'공개된 순간';
  const weekly=weeklyNote(item),metaText=`${item.cover?.emotion||item.emotions?.[0]||'공개'} · ${when(item.createdAt)} · ${smallCountLabel('공감',item.stats?.hearts||0)}${weekly?` · ${weekly}`:''}`;
  const article=el('button','community-card');article.type='button';article.dataset.shareId=item.shareId;
  article.setAttribute('aria-label',`${titleText}. ${momentText}. ${metaText}`);
  const distinct=duplicateLabel(item);
  article.append(renderCover(item),el('h3','community-card-title',titleText),el('p','community-card-moment',momentText));
  if(distinct)article.append(el('small','community-card-distinct',distinct));
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
 async function load(append=false){
  if(append&&loading)return;
  const requestId=++loadId;loading=true;more.disabled=true;message('공개 트리를 불러오는 중이에요.');
  if(!append){items=[];cursor='';render();}
  const answer=await api.discover({q:query.value.trim(),artist:selectedArtist,cursor,limit:12,sort:sortSelect?.value||''});
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
  button.onclick=()=>{if(!dialog.open){dialog.showModal();button.setAttribute('aria-current','true');for(const t of tabs()){if(t.getAttribute('aria-current')==='true'){t.dataset.wasCurrent='1';t.setAttribute('aria-current','false');}}load(false);}};
 dialog.addEventListener('close',()=>{if(preview.open)preview.close();button.setAttribute('aria-current','false');const emptyShown=!document.getElementById('empty')?.hidden;for(const t of tabs()){if(t.dataset.wasCurrent){delete t.dataset.wasCurrent;if(!emptyShown)t.setAttribute('aria-current','true');}}button.focus();});
 preview.addEventListener('close',()=>[...list.querySelectorAll('.community-card')].find(node=>node.dataset.shareId===selectedId)?.focus());
 preview.addEventListener('click',event=>{if(event.target===preview)preview.close();});
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
    opt.onclick=()=>{chooseGroup(g.group);findDialog.close();};
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
  if(event.key==='Escape'){event.preventDefault();findDialog.close();}
 });
 // #784: 미리보기(#community-preview)처럼 찾기 창은 둘러보기 창 안에 둔다 —
 // 바깥에 뜨면 또 다른 modal dialog는 부모 modal을 닫아 버린다(Chromium). 미리보기와 같은 집 안에서 열린다.
 (dialog||document.body)?.appendChild?.(findDialog) ?? (() => { try { document.body?.appendChild?.(findDialog); } catch {} })();
 const findButton=el('button','community-group-find','그룹 찾기');findButton.type='button';
 findButton.onclick=()=>{renderFindList('');findQuery.value='';if(!findDialog.open)findDialog.showModal();findQuery.focus();};
 // Esc 기본 동작(바깥 dialog 닫기 복원)을 막고 직접 닫아, 초점을 그룹 찾기 단추로 돌린다.
 findDialog.addEventListener('close',()=>{findButton.focus();});
 findClose.onclick=()=>findDialog.close();
 const rail=dialog.querySelector('.community-group-rail');
 if(rail&&typeof rail.appendChild==='function')rail.appendChild(findButton);
}

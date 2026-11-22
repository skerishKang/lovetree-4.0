// #1098 2단계: 공개 트리 판의 순간 목록 — 판 위쪽(한 줄 정보·단추)은 트리 숫자(1단계)를 그대로 두고,
// 이 목록의 순간 카드는 그 순간의 ♡ 수·댓글 수를 보인다. ♡ 누르기·댓글 쓰기는 순간 단위 API(서버 #1136)로 간다.
// · 순간 반응은 ♡ 하나다(다른 종은 트리 반응의 일 — 순간과 섞지 않는다).
// · 공개 숫자 규칙(#824 결정 7)을 그대로 — 3 미만 숫자는 보이지 않는다. 시험 계정 몫은 서버가 이미 뺀다.
// · AI 명예회원 댓글은 트리 작성자 표시와 같은 방식으로 작성자 이름 옆 'AI 명예회원' 머리말로 구분한다 — ♡ 단추에는 수만 둔다.
// · 쓸 수 없을 때(비공개·로그아웃·횟수 제한)는 서버 응답 안내를 그대로 보여 주고 화면이 깨지지 않게 한다 —
//   로그아웃(401)에는 트리 댓글과 같은 '새 창에서 로그인' 안내를 곁들인다.
// · 응답 모양이 다르면(예전 모의 응답 등) 조용히 숨는다 — 판의 나머지 검사(겹침·넘침)를 흔들지 않게.
import {memberLoginUrl} from './member-entry.mjs';
import {readTheme} from './header-state.mjs';

const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};

const loginHref=()=>{try{return memberLoginUrl(readTheme(typeof globalThis!=='undefined'?globalThis.localStorage:null));}catch{return '';}}; 
// 서버 응답 안내를 그대로 보여 주되, 빈 안내(네트워크 끊김 등)에는 기본 문구로 대신해 화면이 텅 비지 않게 한다.
const serverMessage=(answer,fallback)=>(answer&&answer.message)||(answer&&answer.status===401?'로그인하면 사용할 수 있어요.':fallback);
function authNotice(){const notice=el('p','community-auth-notice community-muted','댓글을 남기려면 로그인해 주세요. 입력은 이 화면에 남아 있어요. ');const login=el('a','community-link','새 창에서 로그인');login.href=loginHref();login.target='_blank';login.rel='noopener noreferrer';notice.append(login);return notice;}

export function mountMomentList({section,host,api,shareId,when,countLabel}){
 if(!section||!host||!api||typeof api.publicShare!=='function'||!shareId)return;
 const token={current:0};
 async function load(){
  const my=++token.current;
  const answer=await api.publicShare(shareId);
  if(my!==token.current||!host.isConnected)return;
  const tree=answer&&answer.ok?answer.tree:null;
  const moments=tree&&Array.isArray(tree.moments)?tree.moments.filter(m=>m&&m.id):[];
  if(!moments.length){
   if(answer&&answer.ok===false&&answer.message){host.replaceChildren(el('p','community-muted',answer.message));section.hidden=false;}
   return; // 모양이 다른 응답(모의 응답 등)은 조용히 숨긴다
  }
  const rows=[];
  for(const moment of moments){
   const stats=typeof api.momentStats==='function'?await api.momentStats(shareId,moment.id):null;
   if(my!==token.current||!host.isConnected)return;
   rows.push({moment,stats:stats&&stats.ok?stats:null});
  }
  paint(rows);section.hidden=false;
 }
 function paint(rows){
  host.replaceChildren(...rows.map(({moment,stats})=>row(moment,stats)));
 }
 // 한 순간 카드 — 제목·날짜 + ♡ 단추(그 순간 수) + 댓글 단추(그 순간 수) + 눌렀을 때 댓글 묶음.
 function row(moment,stats){
  const state={hearts:Number(stats&&Number.isFinite(stats.hearts)?stats.hearts:0),aiHearts:Number(stats&&Number.isFinite(stats.aiHearts)?stats.aiHearts:0),comments:Number(stats&&Number.isFinite(stats.comments)?stats.comments:0),hearted:!!(stats&&stats.hearted),loaded:!!stats};
  const article=el('article','community-moment');article.dataset.momentId=moment.id;
  const head=el('div','community-moment-head');
  head.append(el('span','community-moment-title',moment.title||'무제 순간'));
  if(moment.date)head.append(el('small','community-moment-date',when(moment.date)));
  const actions=el('div','community-moment-actions');
  const heart=el('button','community-mini community-moment-heart');
  heart.type='button';heart.dataset.communityAction='moment-heart';heart.dataset.momentId=moment.id;
  heart.setAttribute('aria-pressed',String(state.hearted));
  const note=el('p','community-moment-note');note.setAttribute('role','status');note.hidden=true;
  const showNote=(text,withLogin)=>{note.textContent=text;if(withLogin)note.append(authNotice());note.hidden=false;};
  const paintHeart=()=>{heart.textContent='';
   heart.append(el('span','community-moment-heart-glyph',state.hearted?'♥':'♡'));
   // 공개 숫자 규칙(#824 결정 7) — 3 이상일 때만 숫자를 남긴다(라벨이 아니라 수만: 아이콘과 겹치지 않게).
   const count=state.loaded&&state.hearts>=3?String(state.hearts):'';
   if(count)heart.append(el('span','community-moment-count',count));
   heart.setAttribute('aria-pressed',String(state.hearted));};
  paintHeart();
  heart.onclick=async()=>{
   const enabled=heart.getAttribute('aria-pressed')!=='true';
   const prevPressed=heart.getAttribute('aria-pressed');
   heart.setAttribute('aria-pressed',String(enabled)); // 낙관적 표시 — 서버가 막으면 되돌린다
   heart.querySelector('.community-moment-heart-glyph').textContent=enabled?'♥':'♡';
   const answer=await api.momentReact(shareId,moment.id,enabled);
   if(answer.ok&&Number.isFinite(answer.hearts)){state.hearts=Number(answer.hearts);state.aiHearts=Number.isFinite(answer.aiHearts)?Number(answer.aiHearts):0;state.hearted=!!answer.hearted;paintHeart();note.hidden=true;return;}
   heart.setAttribute('aria-pressed',prevPressed);heart.querySelector('.community-moment-heart-glyph').textContent=prevPressed==='true'?'♥':'♡';
   showNote(serverMessage(answer,'공감을 남기지 못했어요.'),answer.status===401);
  };
  const toggle=el('button','community-mini community-moment-comments-toggle');
  toggle.type='button';toggle.dataset.communityAction='moment-comments';toggle.dataset.momentId=moment.id;
  const paintToggle=(expanded)=>{toggle.textContent='';toggle.append(el('span','community-moment-comments-label',countLabel('댓글',state.comments)));toggle.setAttribute('aria-expanded',String(expanded));};
  paintToggle(false);
  const box=el('div','community-moment-comments');box.hidden=true;
  const commentHost=el('div','community-comment-host');
  let commentRows=[];
  const paintComments=(list)=>{
   const rows=list.map((comment)=>{
    const item=el('article','community-comment');
    const edited=comment.edited?' · 수정됨':'';
    item.append(el('small','',`${comment.aiTester?'AI 명예회원 · ':''}${comment.authorLabel} · ${when(comment.createdAt)}${edited}`));
    item.append(el('p','',comment.body));
    return item;
   });
   commentHost.replaceChildren(...(rows.length?rows:[el('p','community-muted','아직 댓글이 없어요. 첫 댓글을 남겨 보세요.')]));
  };
  const write=el('form','community-comment-form');const input=el('textarea','');const submit=el('button','community-mini','댓글 남기기');
  input.maxLength=1000;input.required=true;input.placeholder='이 순간에 남길 말을 적어 주세요.';submit.type='submit';
  write.append(input,submit);
  box.append(commentHost,write); // 댓글 그릇과 쓰기 칸을 펼침 묶음 안에 붙인다 — 이 줄이 없으면 토글이 열려도 목록이 빈 채로 남는다
  write.onsubmit=async event=>{
   event.preventDefault();submit.disabled=true;
   const answer=await api.momentComment(shareId,moment.id,input.value);
   submit.disabled=false;
   if(!answer.ok){
    note.textContent=serverMessage(answer,'댓글을 남기지 못했어요.');
    if(answer.status===401)note.append(authNotice());
    note.hidden=false;return;
   }
   input.value='';note.hidden=true;
   // 서버가 돌려 준 그 댓글을 그 자리에 더한다(POST 응답 {comment}) — 트리 댓글 묶음과는 섞이지 않는다.
   if(answer.comment&&answer.comment.body!=null){commentRows=[...commentRows,answer.comment];paintComments(commentRows);state.comments=commentRows.length;paintToggle(box.hidden);}
  };
  toggle.onclick=async()=>{
   const open=box.hidden;
   if(open&&!box.dataset.loaded){
    const answer=await api.momentComments(shareId,moment.id);
    if(answer.ok&&Array.isArray(answer.comments)){commentRows=answer.comments;paintComments(commentRows);state.comments=commentRows.length;paintToggle(false);box.dataset.loaded='1';}
    else{showNote(serverMessage(answer,'댓글을 불러오지 못했어요.'),answer.status===401);return;}
   }
   box.hidden=!open;paintToggle(!box.hidden);
  };
  actions.append(heart,toggle);
  article.append(head,actions,note,box);
  return article;
 }
 void load();
 return {load};
}

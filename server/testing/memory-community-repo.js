import { ROLE_AI_CUSTOMER, ROLE_TESTER } from '../admin-roles.js';

// #1098 3단계 — 내 소식의 하루 묶음은 한국 날짜(Asia/Seoul) 기준이다. KST는 UTC+9 고정(서머타임 없음)이라
// 9시간을 더한 UTC 날짜가 곧 서울 날짜다(feedback-service의 seoulDate·#824 주 경계와 같은 기준).
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const seoulDay = (value) => new Date(new Date(value).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
const newsLineId = (event) => [seoulDay(event.createdAt), event.kind, event.targetKind, event.shareId, event.momentId || '-'].join('|');

export function createMemoryCommunityRepo({isPrivateTree=null,isDiscoverOn=null,hasRealCustomers=false,roleFor=null,now=()=>new Date().toISOString()}={}){
 const favorites=new Set(),reactionSet=new Set(),comments=new Map(),reports=new Map(),blocks=new Set(),hiddenShares=new Set(),audits=[],votes=new Map();
 // #1098 3단계: 소식은 '언제 남겨졌는지'가 필요하다 — 담기·반응 묶음은 칸만 있으므로 남긴 시각을 곁에 둔다
 // (기존 묶음의 성질은 그대로 — 해제하면 칸과 시각을 함께 없앤다).
 const favoriteTimes=new Map(),reactionTimes=new Map(),momentReactionTimes=new Map(),newsReads=new Map();
 // #1098 2단계: 순간 단위 반응은 별도 묶음 — 트리 단위 숫자(reactionSet)와 절대 섞이지 않게 한다.
 // 키는 product\0share\0moment\0subject\0kind. 순간 반응 종류는 ♡(heart) 하나다.
 const momentReactions=new Set();
 const key=(...parts)=>parts.join('\0'),copy=value=>structuredClone(value);
 const reactionKeys=()=>[...reactionSet];
 // #538: 둘러보기 후보는 활성 공유 행 가운데 moment_count>=3(직접 올린 사진만 있는 순간도 센다)이고,
 // 2026-11-16 대표 결정으로 '둘러보기 소개'가 켜진 트리만이다(기본 꺼짐 — 고객이 켠다). 켠 트리는
 // 트리당 하나의 행(auto 우선)으로 뽑는다. isDiscoverOn 이 없으면(예전 모형) 켜짐으로 본다 — 기존 시험 호환.
 // 숨김은 행이 아니라 트리 단위로 판단한다(어느 행이 숨겨져도 그 트리는 둘러보기에서 내려간다).
 const candidates=async function*(productId,viewerSubjectId,forRanking=false){
  const picked=new Map();
  for(const row of (this.shares||[])){
   if(row.productId!==productId||row.status!=='active')continue;
   if(Number(row.momentCount??0)<3)continue;
   if(isDiscoverOn&&!await isDiscoverOn(productId,row.subjectId,row.treeId))continue;
   if(forRanking && roleFor){
    const role=await roleFor({productId,subjectId:row.subjectId});
    if(role===ROLE_TESTER || (hasRealCustomers && role===ROLE_AI_CUSTOMER))continue;
   }
   // 트리 id는 계정끼리 겹칠 수 있다(복원 기록) — (계정, 트리)로 묶어 한 행을 고른다(B-08, listPublicTagShares와 같은 방식).
   const prev=picked.get(key(row.subjectId,row.treeId));
   if(!prev||(row.origin==='auto'&&prev.origin!=='auto'))picked.set(key(row.subjectId,row.treeId),row);
  }
  for(const row of picked.values()){
   let hiddenAny=false;
   // 숨김도 (계정, 트리) 범위로만 판정한다 — 한 계정의 숨김이 같은 tree_id의 다른 계정에 번지지 않게(B-08).
   for(const other of (this.shares||[]))if(other.productId===productId&&other.subjectId===row.subjectId&&other.treeId===row.treeId&&hiddenShares.has(key(productId,other.shareId))){hiddenAny=true;break;}
   if(hiddenAny)continue;
   if(isPrivateTree&&await isPrivateTree(productId,row.subjectId,row.treeId))continue;
   if(blocks.has(key(productId,viewerSubjectId,row.subjectId)))continue;
   yield row;
  }
 };
 const self={};
 return {
  queryCount:0,
  async listDiscoverable({productId,viewerSubjectId}){this.queryCount+=1;const out=[];for await(const row of candidates.call(this,productId,viewerSubjectId))out.push(copy(row));return out;},
  async listDiscoverableSummaries({productId,viewerSubjectId,sort='latest',weekSince=null,weekUntil=null}){
   this.queryCount+=1;
   const filtered=[];
   for await(const row of candidates.call(this,productId,viewerSubjectId,sort==='popular'))filtered.push(row);
   const weekCounts=weekSince?await this.weeklyVoteCounts({productId,targetKind:'tree',since:weekSince,until:weekUntil}):{};
   let out=filtered.map(share=>{
    const prefix=key(productId,share.shareId)+'\0';
    const reqs=reactionKeys().filter(v=>v.startsWith(prefix));
    const heartCount=reqs.filter(v=>v.split('\0')[3]==='heart').length;
    const reactions={heart:0,like:0,love:0,laugh:0,wow:0,sad:0,angry:0};
    for(const v of reqs){const kind=v.split('\0')[3]||'heart';if(Object.prototype.hasOwnProperty.call(reactions,kind))reactions[kind]+=1;}
    const mine=reqs.filter(v=>viewerSubjectId&&v.split('\0')[2]===viewerSubjectId).map(v=>v.split('\0')[3]||'heart').sort();
    const visible=[...comments.values()].filter(v=>v.productId===productId&&v.shareId===share.shareId&&v.status==='visible'&&v.targetKind!=='moment');
    const lastActivityAt=visible.length?visible.map(v=>v.createdAt).sort().at(-1):share.createdAt;
    const weekFavorites=weekCounts[share.shareId]||0;
    return {share:copy(share),lastActivityAt,stats:{favorites:[...favorites].filter(v=>v.startsWith(prefix)).length,hearts:heartCount,comments:visible.length,favored:favorites.has(key(productId,share.shareId,viewerSubjectId)),hearted:reactionSet.has(key(productId,share.shareId,viewerSubjectId,'heart')),weeklyFavorites:weekFavorites,reactions,mine}};
   });
   if(sort==='popular'&&weekSince)out.sort((a,b)=>(b.stats.weeklyFavorites-a.stats.weeklyFavorites)||String(b.lastActivityAt).localeCompare(String(a.lastActivityAt))||String(b.share.shareId).localeCompare(String(a.share.shareId)));
   return out;
  },
  seedShares(rows){this.shares=rows.map(copy);},
  // #627 3단계: 태그 검색이 훑을 공개 공유 행 — active, 사람×트리당 한 행(auto 우선), 숨김·비공개·
  // 차단(양방향)·요청자 본인을 뺀다. 2026-11-16 대표 결정: 소개 켜짐 + 순간 3개 이상만 훑는다
  // (둘러보기 목록과 같은 조건). isDiscoverOn 이 없으면(예전 모형) 켜짐으로 본다.
  async listPublicTagShares({productId,viewerSubjectId,limit=400}){
   const picked=new Map();
   for(const row of (this.shares||[])){
    if(row.productId!==productId||row.status!=='active')continue;
    if(Number(row.momentCount??0)<3)continue;
    if(isDiscoverOn&&!await isDiscoverOn(productId,row.subjectId,row.treeId))continue;
    const pk=key(row.subjectId,row.treeId);
    const prev=picked.get(pk);
    if(!prev||(row.origin==='auto'&&prev.origin!=='auto'))picked.set(pk,row);
   }
   const owners=[...picked.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
   const out=[];
   for(const row of owners){
    if(out.length>=limit)break;
    let hiddenAny=false;
    // 숨김도 (계정, 트리) 범위로만 판정한다 — 한 계정의 숨김이 같은 tree_id의 다른 계정에 번지지 않게(B-08).
    for(const other of (this.shares||[]))if(other.productId===productId&&other.subjectId===row.subjectId&&other.treeId===row.treeId&&hiddenShares.has(key(productId,other.shareId))){hiddenAny=true;break;}
    if(hiddenAny)continue;
    if(isPrivateTree&&await isPrivateTree(productId,row.subjectId,row.treeId))continue;
    if(viewerSubjectId&&row.subjectId===viewerSubjectId)continue;
    if(viewerSubjectId&&(blocks.has(key(productId,viewerSubjectId,row.subjectId))||blocks.has(key(productId,row.subjectId,viewerSubjectId))))continue;
    out.push(copy(row));
   }
   return out;
  },
  async stats({productId,shareId,viewerSubjectId}){
   const prefix=key(productId,shareId)+'\0';
   const reqs=reactionKeys().filter(v=>v.startsWith(prefix));
   const heartCount=reqs.filter(v=>v.split('\0')[3]==='heart').length;
   const reactions={heart:0,like:0,love:0,laugh:0,wow:0,sad:0,angry:0};
   for(const v of reqs){const kind=v.split('\0')[3]||'heart';if(Object.prototype.hasOwnProperty.call(reactions,kind))reactions[kind]+=1;}
   const mine=reqs.filter(v=>viewerSubjectId&&v.split('\0')[2]===viewerSubjectId).map(v=>v.split('\0')[3]||'heart').sort();
   return {favorites:[...favorites].filter(v=>v.startsWith(prefix)).length,hearts:heartCount,comments:[...comments.values()].filter(v=>v.productId===productId&&v.shareId===shareId&&v.status==='visible'&&v.targetKind!=='moment').length,favored:favorites.has(key(productId,shareId,viewerSubjectId)),hearted:reactionSet.has(key(productId,shareId,viewerSubjectId,'heart')),reactions,mine};
  },
  async setFavorite({productId,shareId,subjectId,enabled}){const value=key(productId,shareId,subjectId);if(enabled){favorites.add(value);favoriteTimes.set(value,now());}else{favorites.delete(value);favoriteTimes.delete(value);}},
  // 투표 기록(#824) — append-only 메모리 모형. 이미 있으면 새 표로 세지 않는다(1인 1표 영구).
  async recordVote({productId,targetKind,targetId,subjectId,votedAt:at}){const value=key(productId,targetKind,targetId,subjectId);if(votes.has(value))return {recorded:false};votes.set(value,{productId,targetKind,targetId,subjectId,votedAt:at||now()});return {recorded:true};},
  async hasVoted({productId,targetKind,targetId,subjectId}){return votes.has(key(productId,targetKind,targetId,subjectId));},
  async weeklyVoteCounts({productId,targetKind,since,until=null}){
   const counts={},start=new Date(since).getTime(),end=until===null?Infinity:new Date(until).getTime();
   for(const row of votes.values()){
    const at=new Date(row.votedAt).getTime();
    if(row.productId!==productId || row.targetKind!==targetKind || !(at>=start && at<end))continue;
    if(hasRealCustomers && roleFor && await roleFor({productId,subjectId:row.subjectId})===ROLE_AI_CUSTOMER)continue;
    counts[row.targetId]=(counts[row.targetId]||0)+1;
   }
   return counts;
  },
  async listFavorites({productId,subjectId}){return [...favorites].filter(v=>v.startsWith(key(productId)+'\0')&&v.endsWith('\0'+subjectId)).map(v=>v.split('\0')[1]);},
  async setReaction({productId,shareId,subjectId,enabled,kind='heart'}){const value=key(productId,shareId,subjectId,kind);if(enabled){reactionSet.add(value);reactionTimes.set(value,now());}else{reactionSet.delete(value);reactionTimes.delete(value);}},
  async isBlocked({productId,blockerSubjectId,blockedSubjectId}){return blocks.has(key(productId,blockerSubjectId,blockedSubjectId))||blocks.has(key(productId,blockedSubjectId,blockerSubjectId));},
  async listComments({productId,shareId,limit}){return [...comments.values()].filter(v=>v.productId===productId&&v.shareId===shareId&&v.status==='visible'&&v.targetKind!=='moment').slice(0,limit).map(copy);},
  async getComment({productId,commentId}){const row=comments.get(key(productId,commentId));return row?copy(row):null;},
  async updateComment({productId,commentId,subjectId,body}){const row=comments.get(key(productId,commentId));if(!row||row.status!=='visible'||row.subjectId!==subjectId)return null;row.body=body;row.updatedAt=now();row.editedAt=row.updatedAt;return copy(row);},
  async createComment(input){const existing=[...comments.values()].find(v=>v.productId===input.productId&&v.subjectId===input.subjectId&&v.clientKey===input.clientKey&&(v.targetKind??'tree')==='tree');if(existing)return copy(existing);const row={id:input.commentId,...input,status:'visible',createdAt:now(),updatedAt:now(),editedAt:null};comments.set(key(input.productId,input.commentId),row);return copy(row);},
  async deleteComment({productId,commentId,subjectId,admin}){const row=comments.get(key(productId,commentId));if(!row||row.status!=='visible'||(!admin&&row.subjectId!==subjectId))return null;row.status=admin?'hidden':'deleted';row.updatedAt=now();if(admin)audits.push({productId,targetType:'comment',targetId:commentId,action:'hide_comment',actorSubjectId:subjectId});return copy(row);},
  async createReport(input){const existing=[...reports.values()].find(v=>v.productId===input.productId&&v.subjectId===input.subjectId&&v.clientKey===input.clientKey);if(existing)return copy(existing);const row={id:input.reportId,shareId:input.shareId,reporterSubjectId:input.subjectId,subjectId:input.subjectId,reason:input.reason,clientKey:input.clientKey,productId:input.productId,commentId:input.commentId??null,status:'open',createdAt:now(),resolvedAt:null,hidden:false};reports.set(key(input.productId,input.reportId),row);return copy(row);},
  async blockOwner({productId,blockerSubjectId,blockedSubjectId}){blocks.add(key(productId,blockerSubjectId,blockedSubjectId));},
  async listReports({productId,limit}){return [...reports.values()].filter(v=>v.productId===productId).slice(0,limit).map(row=>({...copy(row),hidden:row.commentId?(comments.get(key(productId,row.commentId))?.status==='hidden'):hiddenShares.has(key(productId,row.shareId))}));},
  async moderateReport({productId,reportId,status,visibility,actorSubjectId}){const row=reports.get(key(productId,reportId));if(!row)return null;row.status=status;row.resolvedAt=now();audits.push({productId,reportId,action:status,actorSubjectId});const hiddenKey=key(productId,row.shareId),wasHidden=hiddenShares.has(hiddenKey);if(visibility==='hidden')hiddenShares.add(hiddenKey);else hiddenShares.delete(hiddenKey);if(wasHidden!==(visibility==='hidden'))audits.push({productId,reportId,action:visibility==='hidden'?'hide_share':'restore_share',actorSubjectId});row.hidden=visibility==='hidden';return copy(row);},
  // ===== #1098 2단계 — 순간 단위 ♡·댓글(러브버드 규칙) =====
  // 반응 종류는 ♡ 하나(서비스 계층이 막는다), 같은 요청 두 번은 한 칸(묶음의 성질), 숫자는 시험 계정(tester)을 빼고
  // AI 명예회원(ai_customer) 비트를 함께 내려준다.
  async setMomentReaction({productId,shareId,momentId,subjectId,enabled,kind='heart'}){const value=key(productId,shareId,momentId,subjectId,kind);if(enabled){momentReactions.add(value);momentReactionTimes.set(value,now());}else{momentReactions.delete(value);momentReactionTimes.delete(value);}},
  async momentStats({productId,shareId,momentId,viewerSubjectId}){
   const role=async subjectId=>roleFor?await roleFor({productId,subjectId}):null;
   const reqs=[...momentReactions].filter(v=>v.startsWith(key(productId,shareId,momentId)+'\0')&&(v.split('\0')[4]||'heart')==='heart');
   let hearts=0,aiHearts=0;
   for(const v of reqs){const r=await role(v.split('\0')[3]);if(r===ROLE_TESTER)continue;hearts+=1;if(r===ROLE_AI_CUSTOMER)aiHearts+=1;}
   const visible=[...comments.values()].filter(v=>v.productId===productId&&v.shareId===shareId&&v.momentId===momentId&&v.targetKind==='moment'&&v.status==='visible');
   let commentCount=0;
   for(const v of visible){const r=await role(v.subjectId);if(r===ROLE_TESTER)continue;commentCount+=1;}
   const hearted=viewerSubjectId?momentReactions.has(key(productId,shareId,momentId,viewerSubjectId,'heart')):false;
   return {hearts,aiHearts,comments:commentCount,hearted};
  },
  async listMomentComments({productId,shareId,momentId,limit=50}){
   const rows=[];
   const visible=[...comments.values()].filter(v=>v.productId===productId&&v.shareId===shareId&&v.momentId===momentId&&v.targetKind==='moment'&&v.status==='visible').slice(0,limit);
   for(const v of visible){
    const r=roleFor?await roleFor({productId,subjectId:v.subjectId}):null;
    if(r===ROLE_TESTER)continue;
    rows.push({...copy(v),aiTester:r===ROLE_AI_CUSTOMER});
   }
   return rows;
  },
  async createMomentComment(input){
   const existing=[...comments.values()].find(v=>v.productId===input.productId&&v.subjectId===input.subjectId&&v.clientKey===input.clientKey&&v.targetKind==='moment'&&v.momentId===input.momentId);
   if(existing)return copy(existing);
   const row={id:input.commentId,...input,targetKind:'moment',status:'visible',createdAt:now(),updatedAt:now(),editedAt:null};
   comments.set(key(input.productId,input.commentId),row);
   return copy(row);
  },
  async getReport({productId,reportId}){const row=reports.get(key(productId,reportId));return row?copy(row):null;},
  // 순간 댓글 신고는 트리 신고와 같은 신고 표·운영센터 길로 처리한다 — 숨기면 트리가 아니라 그 댓글만 숨겨진다.
  async moderateMomentCommentReport({productId,reportId,status,visibility,actorSubjectId}){
   const row=reports.get(key(productId,reportId));
   if(!row||!row.commentId)return null;
   row.status=status;row.resolvedAt=now();
   audits.push({productId,reportId,targetType:'report',targetId:reportId,action:status,actorSubjectId});
   const comment=comments.get(key(productId,row.commentId));
   let hidden=!!comment&&comment.status==='hidden';
   if(visibility==='hidden'&&comment&&comment.status==='visible'){
    comment.status='hidden';comment.updatedAt=now();hidden=true;
    audits.push({productId,targetType:'comment',targetId:row.commentId,action:'hide_comment',actorSubjectId});
   }
   row.hidden=hidden;
   return copy(row);
  },
 // ===== #1098 3단계 — 내 소식(목록·안 읽은 수·읽음 시각) =====
 // 표(server/db/my-news-postgres.js)와 같은 규칙을 메모리에서 그대로 흉내 낸다: 내(계정) 공유 행에 남은
 // ♡(heart)·댓글·담기를 하루(KST)·종류·대상으로 묶고, 자기 것·시험 계정·숨김·삭제 댓글은 빼며,
 // AI 명예회원(ai_customer) 몫은 aiCount 로 구분한다.
 async listNewsEvents({productId,subjectId}){
  const role=async actor=>roleFor?await roleFor({productId,subjectId:actor}):null;
  const shares=new Map((this.shares||[]).filter(row=>row.productId===productId&&row.subjectId===subjectId).map(row=>[row.shareId,row]));
  const events=[];
  const push=async row=>{
   const share=shares.get(row.shareId);
   if(!share||row.actor===subjectId)return;
   const actorRole=await role(row.actor);
   if(actorRole===ROLE_TESTER)return;
   events.push({...row,treeId:share.treeId,isAi:actorRole===ROLE_AI_CUSTOMER});
  };
  for(const [value,at] of favoriteTimes){const [p,shareId,actor]=value.split('\0');if(p===productId)await push({shareId,actor,kind:'favorite',targetKind:'tree',momentId:'',body:null,createdAt:at});}
  for(const [value,at] of reactionTimes){const [p,shareId,actor,kind]=value.split('\0');if(p===productId&&kind==='heart')await push({shareId,actor,kind:'heart',targetKind:'tree',momentId:'',body:null,createdAt:at});}
  for(const [value,at] of momentReactionTimes){const [p,shareId,momentId,actor,kind]=value.split('\0');if(p===productId&&(kind||'heart')==='heart')await push({shareId,actor,kind:'heart',targetKind:'moment',momentId,body:null,createdAt:at});}
  for(const row of comments.values()){if(row.productId!==productId||row.status!=='visible')continue;await push({shareId:row.shareId,actor:row.subjectId,kind:'comment',targetKind:row.targetKind??'tree',momentId:row.momentId??'',body:row.body,createdAt:row.createdAt});}
  return events;
 },
 async listMyNewsLines({productId,subjectId,limit=50}){
  const events=await this.listNewsEvents({productId,subjectId});
  const lines=new Map();
  for(const event of events){
   const id=newsLineId(event);
   const line=lines.get(id)??{id,day:seoulDay(event.createdAt),kind:event.kind,targetKind:event.targetKind,shareId:event.shareId,treeId:event.treeId,momentId:event.momentId||'',count:0,aiCount:0,lastAt:event.createdAt,lastBody:null};
   line.count+=1;
   if(event.isAi)line.aiCount+=1;
   if(String(event.createdAt)>=String(line.lastAt)){line.lastAt=event.createdAt;if(event.kind==='comment')line.lastBody=event.body;}
   lines.set(id,line);
  }
  return [...lines.values()]
   .sort((a,b)=>String(b.lastAt).localeCompare(String(a.lastAt))||String(b.day).localeCompare(String(a.day))||a.kind.localeCompare(b.kind)||a.targetKind.localeCompare(b.targetKind)||a.shareId.localeCompare(b.shareId)||a.momentId.localeCompare(b.momentId))
   .slice(0,limit).map(copy);
 },
 async unreadNewsCount({productId,subjectId,after=null}){
  const events=await this.listNewsEvents({productId,subjectId});
  const cutoff=after?Date.parse(after):null;
  const ids=new Set();
  for(const event of events){
   if(cutoff!==null&&!(Date.parse(event.createdAt)>cutoff))continue;
   ids.add(newsLineId(event));
  }
  return ids.size;
 },
 async markNewsRead({productId,subjectId,at}){
  const value=key(productId,subjectId),next=String(at),prev=newsReads.get(value);
  if(!prev||Date.parse(next)>=Date.parse(prev))newsReads.set(value,next);
  return newsReads.get(value)??null;
 },
 async lastNewsReadAt({productId,subjectId}){return newsReads.get(key(productId,subjectId))??null;},
  inspect(){return {favorites:[...favorites],reactions:[...reactionSet],momentReactions:[...momentReactions],comments:[...comments.values()].map(copy),reports:[...reports.values()].map(copy),blocks:[...blocks],hiddenShares:[...hiddenShares],audits:audits.map(copy),newsReads:[...newsReads.entries()].map(([value,at])=>({value,at}))};}
 };
}

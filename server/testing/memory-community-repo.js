export function createMemoryCommunityRepo({isPrivateTree=null,isDiscoverOn=null}={}){
 const favorites=new Set(),reactionSet=new Set(),comments=new Map(),reports=new Map(),blocks=new Set(),hiddenShares=new Set(),audits=[];
 const key=(...parts)=>parts.join('\0'),copy=value=>structuredClone(value),now=()=>new Date().toISOString();
 const reactionKeys=()=>[...reactionSet];
 // #538: 둘러보기 후보는 활성 공유 행 가운데 moment_count>=3(직접 올린 사진만 있는 순간도 센다)이고,
 // 2026-11-16 대표 결정으로 '둘러보기 소개'가 켜진 트리만이다(기본 꺼짐 — 고객이 켠다). 켠 트리는
 // 트리당 하나의 행(auto 우선)으로 뽑는다. isDiscoverOn 이 없으면(예전 모형) 켜짐으로 본다 — 기존 시험 호환.
 // 숨김은 행이 아니라 트리 단위로 판단한다(어느 행이 숨겨져도 그 트리는 둘러보기에서 내려간다).
 const candidates=async function*(productId,viewerSubjectId){
  const picked=new Map();
  for(const row of (this.shares||[])){
   if(row.productId!==productId||row.status!=='active')continue;
   if(Number(row.momentCount??0)<3)continue;
   if(isDiscoverOn&&!await isDiscoverOn(productId,row.subjectId,row.treeId))continue;
   const prev=picked.get(row.treeId);
   if(!prev||(row.origin==='auto'&&prev.origin!=='auto'))picked.set(row.treeId,row);
  }
  for(const row of picked.values()){
   let hiddenAny=false;
   for(const other of (this.shares||[]))if(other.productId===productId&&other.treeId===row.treeId&&hiddenShares.has(key(productId,other.shareId))){hiddenAny=true;break;}
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
  async listDiscoverableSummaries({productId,viewerSubjectId}){
   this.queryCount+=1;
   const filtered=[];
   for await(const row of candidates.call(this,productId,viewerSubjectId))filtered.push(row);
   return filtered.map(share=>{
    const prefix=key(productId,share.shareId)+'\0';
    const reqs=reactionKeys().filter(v=>v.startsWith(prefix));
    const heartCount=reqs.filter(v=>v.split('\0')[3]==='heart').length;
    const reactions={heart:0,like:0,love:0,laugh:0,wow:0,sad:0,angry:0};
    for(const v of reqs){const kind=v.split('\0')[3]||'heart';if(Object.prototype.hasOwnProperty.call(reactions,kind))reactions[kind]+=1;}
    const mine=reqs.filter(v=>viewerSubjectId&&v.split('\0')[2]===viewerSubjectId).map(v=>v.split('\0')[3]||'heart').sort();
    const visible=[...comments.values()].filter(v=>v.productId===productId&&v.shareId===share.shareId&&v.status==='visible');
    const lastActivityAt=visible.length?visible.map(v=>v.createdAt).sort().at(-1):share.createdAt;
    return {share:copy(share),lastActivityAt,stats:{favorites:[...favorites].filter(v=>v.startsWith(prefix)).length,hearts:heartCount,comments:visible.length,favored:favorites.has(key(productId,share.shareId,viewerSubjectId)),hearted:reactionSet.has(key(productId,share.shareId,viewerSubjectId,'heart')),reactions,mine}};
   });
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
    for(const other of (this.shares||[]))if(other.productId===productId&&other.treeId===row.treeId&&hiddenShares.has(key(productId,other.shareId))){hiddenAny=true;break;}
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
   return {favorites:[...favorites].filter(v=>v.startsWith(prefix)).length,hearts:heartCount,comments:[...comments.values()].filter(v=>v.productId===productId&&v.shareId===shareId&&v.status==='visible').length,favored:favorites.has(key(productId,shareId,viewerSubjectId)),hearted:reactionSet.has(key(productId,shareId,viewerSubjectId,'heart')),reactions,mine};
  },
  async setFavorite({productId,shareId,subjectId,enabled}){const value=key(productId,shareId,subjectId);enabled?favorites.add(value):favorites.delete(value);},
  async listFavorites({productId,subjectId}){return [...favorites].filter(v=>v.startsWith(key(productId)+'\0')&&v.endsWith('\0'+subjectId)).map(v=>v.split('\0')[1]);},
  async setReaction({productId,shareId,subjectId,enabled,kind='heart'}){const value=key(productId,shareId,subjectId,kind);enabled?reactionSet.add(value):reactionSet.delete(value);},
  async isBlocked({productId,blockerSubjectId,blockedSubjectId}){return blocks.has(key(productId,blockerSubjectId,blockedSubjectId))||blocks.has(key(productId,blockedSubjectId,blockerSubjectId));},
  async listComments({productId,shareId,limit}){return [...comments.values()].filter(v=>v.productId===productId&&v.shareId===shareId&&v.status==='visible').slice(0,limit).map(copy);},
  async getComment({productId,commentId}){const row=comments.get(key(productId,commentId));return row?copy(row):null;},
  async updateComment({productId,commentId,subjectId,body}){const row=comments.get(key(productId,commentId));if(!row||row.status!=='visible'||row.subjectId!==subjectId)return null;row.body=body;row.updatedAt=now();row.editedAt=row.updatedAt;return copy(row);},
  async createComment(input){const existing=[...comments.values()].find(v=>v.productId===input.productId&&v.subjectId===input.subjectId&&v.clientKey===input.clientKey);if(existing)return copy(existing);const row={id:input.commentId,...input,status:'visible',createdAt:now(),updatedAt:now(),editedAt:null};comments.set(key(input.productId,input.commentId),row);return copy(row);},
  async deleteComment({productId,commentId,subjectId,admin}){const row=comments.get(key(productId,commentId));if(!row||row.status!=='visible'||(!admin&&row.subjectId!==subjectId))return null;row.status=admin?'hidden':'deleted';row.updatedAt=now();if(admin)audits.push({productId,targetType:'comment',targetId:commentId,action:'hide_comment',actorSubjectId:subjectId});return copy(row);},
  async createReport(input){const existing=[...reports.values()].find(v=>v.productId===input.productId&&v.subjectId===input.subjectId&&v.clientKey===input.clientKey);if(existing)return copy(existing);const row={id:input.reportId,shareId:input.shareId,reporterSubjectId:input.subjectId,subjectId:input.subjectId,reason:input.reason,clientKey:input.clientKey,productId:input.productId,status:'open',createdAt:now(),resolvedAt:null,hidden:false};reports.set(key(input.productId,input.reportId),row);return copy(row);},
  async blockOwner({productId,blockerSubjectId,blockedSubjectId}){blocks.add(key(productId,blockerSubjectId,blockedSubjectId));},
  async listReports({productId,limit}){return [...reports.values()].filter(v=>v.productId===productId).slice(0,limit).map(row=>({...copy(row),hidden:hiddenShares.has(key(productId,row.shareId))}));},
  async moderateReport({productId,reportId,status,visibility,actorSubjectId}){const row=reports.get(key(productId,reportId));if(!row)return null;row.status=status;row.resolvedAt=now();audits.push({productId,reportId,action:status,actorSubjectId});const hiddenKey=key(productId,row.shareId),wasHidden=hiddenShares.has(hiddenKey);if(visibility==='hidden')hiddenShares.add(hiddenKey);else hiddenShares.delete(hiddenKey);if(wasHidden!==(visibility==='hidden'))audits.push({productId,reportId,action:visibility==='hidden'?'hide_share':'restore_share',actorSubjectId});row.hidden=visibility==='hidden';return copy(row);},
  inspect(){return {favorites:[...favorites],reactions:[...reactionSet],comments:[...comments.values()].map(copy),reports:[...reports.values()].map(copy),blocks:[...blocks],hiddenShares:[...hiddenShares],audits:audits.map(copy)};}
 };
}

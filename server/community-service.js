import {randomUUID} from 'node:crypto';
import {ApiError} from './errors.js';
import {parsePrincipal} from './principal.js';
import {createRateLimiter} from './rate-limit.js';
import {projectSharedTree} from './share-service.js';
import {refreshStageIndex} from './stage-index-refresh.js';
import {ROLE_TESTER,isAiTesterRole} from './admin-roles.js';
import {coverModeOf} from '../src/domain.js';
// 꼬리표 판정은 화면과 같은 한 벌 — 서버에 규칙을 복사하지 않는다(#627 3단계 '다른 팬 보기').
import {parseTag, tagKey, isChannelLikeArtist} from '../public/v41/tags.mjs';
import {isVerticalMoment,safeYoutubeThumb,youtubeIdFrom,youtubeStageThumbUrl} from '../public/v41/youtube-id.mjs';

export const REACTION_KINDS=Object.freeze(['heart','like','love','laugh','wow','sad','angry']);
const isReactionKind=value=>typeof value==='string'&&REACTION_KINDS.includes(value);

const SHARE_ID=/^[A-Za-z0-9_-]{20,64}$/;
const ITEM_ID=/^[A-Za-z0-9_-]{1,80}$/;
const IDEMPOTENCY=/^[A-Za-z0-9._:-]{8,128}$/;
const NO_STORE={'cache-control':'no-store, max-age=0',pragma:'no-cache','x-content-type-options':'nosniff'};
// '다른 팬 보기' 응답의 개수 제한(#627 3단계) — 요청 파라미터로 늘리지 않는다.
const TAG_MOMENT_LIMIT=30;
// #1025 1단계 '순간' 보기 — 한 번에 내려주는 세로 순간 상한(요청으로 늘리지 않는다).
const MOMENT_FEED_LIMIT=30;
const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
function jsonBody(request){
 if(!String(request?.headers?.['content-type']||'').toLowerCase().startsWith('application/json'))throw new ApiError(415,'unsupported_media_type','JSON 요청만 사용할 수 있어요.');
 try{return JSON.parse(typeof request.body==='string'?request.body:String(request.body||''));}
 catch{throw new ApiError(400,'invalid_json','요청 형식을 읽을 수 없어요.');}
}
function clientKey(request){const value=String(request?.headers?.['idempotency-key']||'');if(!IDEMPOTENCY.test(value))throw new ApiError(400,'idempotency_key_required','안전한 중복 방지 키가 필요해요.');return value;}
function publicComment(row,viewer,isAdmin=false){const mine=!!viewer&&row.subjectId===viewer;const edited=!!(row.editedAt||(row.updatedAt&&row.createdAt&&String(row.updatedAt)>String(row.createdAt)));return {id:row.id,body:row.body,createdAt:row.createdAt,updatedAt:row.updatedAt,edited,mine,canDelete:mine||isAdmin,canEdit:mine,authorLabel:mine?'나':'기록한 사람'};}

export function createCommunityService({communityRepo,shareRepo,workspaceRepo,visibilityRepo=null,productId,admin=null,stageIndex=null,stageVoteRepo=null,now=()=>Date.now(),makeId=()=>randomUUID(),signupAtFor=null,random=Math.random}){
 // 속도 제한은 공용 한 벌(server/rate-limit.js)로 — 커뮤니티 창구는 1분 창을 쓴다(#1073 B-19).
 const limiter=createRateLimiter({now});
 const rate=(subjectId,kind,limit=20)=>limiter.rate(subjectId+'\0'+kind,limit);
 let totalsCache=null;
 // 이번 주의 시작(월요일 0시, KST — #824 결정 4 '주 = 월~일 KST'). KST는 UTC+9 고정이라 서머타임
 // 보정이 없다. 주 규칙은 여기 한 곳에서만 계산한다 — SQL·화면에 복제하지 않는다.
 function votingWeek(at=now()){
  const KST_OFFSET_MS=9*60*60*1000,DAY_MS=24*60*60*1000;
  const kstDay=Math.floor((at+KST_OFFSET_MS)/DAY_MS);
  const monday=kstDay-((kstDay+3)%7); // 1970-01-01(목) 기준, 월요일=0 — 목요일이 3이 나온다
  const start=monday*DAY_MS-KST_OFFSET_MS;
  return {since:new Date(start).toISOString(),until:new Date(start+7*DAY_MS).toISOString()};
 }
 async function oldEnoughToVote(subjectId,at=now()){
  const signedUpAt=await signupAtFor?.({productId,subjectId});
  const age=signedUpAt ? at-new Date(signedUpAt).getTime() : NaN;
  return age >= 7*24*60*60*1000;
 }
 const tooNew=()=>new ApiError(403,'vote_too_new','가입하고 7일이 지나면 투표할 수 있어요.');
 function publicStage(result){
  if(!result)throw new ApiError(404,'stage_not_found','공개 무대를 찾을 수 없어요.');
  return result;
 }
 async function activeShare(shareId){
  if(!SHARE_ID.test(shareId))throw new ApiError(404,'share_not_found','공개 트리를 찾을 수 없어요.');
  const share=await shareRepo.load({productId,shareId});
  if(!share||share.status!=='active')throw new ApiError(404,'share_not_found','공개 트리를 찾을 수 없어요.');
  // #538: 비공개 트리는 댓글·반응·신고·차단 등 커뮤니티 경로에서도 서버가 막는다(없는 것과 같이).
  if(visibilityRepo){const visibility=(await visibilityRepo.get({productId,subjectId:share.subjectId,treeId:share.treeId})).visibility;if(visibility==='private')throw new ApiError(404,'share_not_found','공개 트리를 찾을 수 없어요.');}
  return share;
 }
 async function card(share,viewerSubjectId,statsOverride=null,lastActivityAt=null,aiTesterLookup=null){
  const stored=await workspaceRepo.load({productId,subjectId:share.subjectId});
  if(!stored)return null;
  let projected;try{projected=projectSharedTree(stored.doc,share.treeId);}catch{return null;}
  if(!projected.tree.moments.length)return null;
  const tree=projected.tree,cover=tree.moments.find(moment=>moment.id===tree.coverMomentId)||tree.moments.find(moment=>moment.id===share.entryMomentId)||tree.moments[0];
  const youtubeId=youtubeIdFrom(cover?.url||cover?.externalUrl);
  const coverType=youtubeId?'youtube':cover?.type||'';
  // #425 2번: 표지 주소는 '순간에서(moment)'일 때만 보낸다. 사진 표지는 공개 판정에서
  // 디자인/기본으로 바뀌고(projectSharedTree), 디자인·기본 표지에는 주소가 없다.
  const coverIsMoment=coverModeOf(tree)==='moment';
  const coverUrl=coverIsMoment?(cover?.url||''):'';
  const vertical=['video','youtube'].includes(coverType)&&isVerticalMoment(cover);
  const safeCoverThumbnail=safeYoutubeThumb(cover?.mediaMetadata?.thumbnail||cover?.mediaMetadata?.thumbnailUrl||cover?.thumbnailUrl);
  const thumbnailId=youtubeId||youtubeIdFrom(safeCoverThumbnail);
  const youtubeThumbnail=youtubeStageThumbUrl(thumbnailId,'mqdefault')||safeCoverThumbnail;
  // #887: 표지 후보 사슬 — 명시 표지(모드 moment) → 사진 표지(같은 자리) → 첫 YouTube 순간 썸네일(mqdefault) → 글자 칸.
  // 기본·디자인 표지 트리도 썸네일을 비워 보내면 카드가 글자 칸만 남는다(운영 7카드 전부 해당 — 261118 확인).
  // 사진 주소는 #425 규칙 그대로 모드가 'moment'일 때만 내보내고, 없는 트리는 공개 YouTube 썸네일
  // (i.ytimg.com mqdefault)로만 채운다 — 개인 미디어 주소는 흘리지 않는다.
  let thumbnailUrl=coverIsMoment
   ? coverType==='youtube'?youtubeThumbnail:coverUrl
   : '';
  let cardCoverType=coverType,cardVertical=vertical;
  if(!thumbnailUrl){
   const ytMoment=tree.moments.find(moment=>youtubeIdFrom(moment.url||moment.externalUrl));
   const fallbackThumb=youtubeStageThumbUrl(ytMoment?youtubeIdFrom(ytMoment.url||ytMoment.externalUrl):null,'mqdefault')||'';
   if(fallbackThumb){thumbnailUrl=fallbackThumb;cardCoverType='youtube';cardVertical=isVerticalMoment(ytMoment);}
  }
  const emotions=[...new Set(tree.moments.map(moment=>moment.emotion).filter(Boolean))];
  const stats=statsOverride||await communityRepo.stats({productId,shareId:share.shareId,viewerSubjectId});
  const card={shareId:share.shareId,title:tree.title,subject:tree.subject,summary:clean(cover?.note,160),emotions,momentCount:tree.moments.length,entryMomentId:share.entryMomentId,view:share.view,cover:{momentId:cover.id,title:cover?.title||tree.title,url:coverUrl,thumbnailUrl,type:cardCoverType,vertical:cardVertical,emotion:cover?.emotion||''},createdAt:share.createdAt,lastActivityAt:lastActivityAt||share.createdAt,stats};
  // #611 3번: AI 명예회원 기록은 남에게 보이는 카드에 'AI 명예회원' 배지 한 비트만 내린다
  // (계정·이메일·subject는 공개 응답에 넣지 않는다).
  if(aiTesterLookup&&await aiTesterLookup(share.subjectId))card.aiTester=true;
  // #627: 둘러보기 검색에 이 트리 순간들의 제목(사용자 제목 + 영상 제목)도 넣는다. 트리 이름이 자동 이름
  // ('모아둔 순간')이어도 영상 제목에 있는 그룹 이름으로 찾을 수 있게 하려는 것이다. 순간은 카드를 만들 때
  // 이미 읽은 공개 사본(projectSharedTree)에서 가져오므로 쿼리는 늘지 않는다. 응답에 내보내지 않도록
  // 열거하지 않는 속성(non-enumerable)으로 붙인다 — JSON.stringify 와 펼침({...card})에 섞이지 않는다.
  // #784: 그룹 · 공개 트리 수 집계는 카드별 아티스트 이름을 같이 들고 잇는다.
  // 표시 이름은 같은 묶음에 처음 본 원본 표기를 쓴다. 응답에는 내보내지 않는다(아래 비열거).
  const artistTags=new Set(),artistNames=new Map(),searchTerms=[];
  for(const [index,moment] of tree.moments.entries()){
   if(index<200)searchTerms.push(clean(moment.title,120),clean(moment.mediaMetadata?.title,120));
   for(const raw of Array.isArray(moment.keywords)?moment.keywords:[]){
    const parsed=parseTag(raw);if(!parsed)continue;
    if(index<200)searchTerms.push(parsed.value);
    if(parsed.kindId==='artist'){
     // #935: 채널 이름이 '가수' 꼬리표로 저장돼 있어도 칩(그룹 집계)에는 올리지 않는다 — 저장 값은 그대로.
     if(isChannelLikeArtist(parsed.value))continue;
     const key=tagKey(parsed.value);
     artistTags.add(key);
     if(!artistNames.has(key))artistNames.set(key,parsed.value);
    }
   }
  }
  Object.defineProperty(card,'searchText',{value:searchTerms.filter(Boolean).join(' '),enumerable:false});
  Object.defineProperty(card,'artistTags',{value:[...artistTags],enumerable:false});
  Object.defineProperty(card,'artistNames',{value:artistNames,enumerable:false});
  return card;
 }
 return {
  async momentStage({viewerSubjectId,shareId,momentId}){
   return publicStage(await stageVoteRepo.resolveMoment({productId,viewerSubjectId,shareId,momentId}));
  },
  async stageDetail({viewerSubjectId,stageId,currentShareId,afterShareId}){
   if((currentShareId&&!SHARE_ID.test(currentShareId))||(afterShareId&&!SHARE_ID.test(afterShareId))){
    throw new ApiError(400,'invalid_stage_page','공개 트리 목록의 주소를 확인해 주세요.');
   }
   return publicStage(await stageVoteRepo.detail({productId,viewerSubjectId,stageId,currentShareId,afterShareId,...votingWeek()}));
  },
  async popularStages(viewerSubjectId){
   const week=votingWeek();
   const items=await stageVoteRepo.popular({productId,viewerSubjectId,...week});
   return {weekStart:week.since,weekEndExclusive:week.until,items};
  },
  async voteStage(subjectId,stageId,enabled){
   rate(subjectId,'stage-vote',40);
   const requestedAt=now();
   const scope={productId,stageId,...votingWeek(requestedAt)};
   if(enabled && !await oldEnoughToVote(subjectId,requestedAt)){
    // 공개 근거가 사라진 무대는 가입 시각에 관계없이 같은 404를 돌려준다.
    publicStage(await stageVoteRepo.detail({...scope,viewerSubjectId:subjectId}));
    throw tooNew();
   }
   const result=await stageVoteRepo.setVote({...scope,subjectId,enabled,votedAt:new Date(requestedAt).toISOString()});
   if(enabled)return publicStage(result);
  },
  // 첫 화면 둘러보기 숫자(261116 PR 2) — 공개 집계(로그인 없이 읽는다). 서버에서 1분 메모리 캐시를 두고,
  // 응답 헤더에도 cache-control: max-age=60을 실어 브라우저·중간 단계가 같은 한도로 재활용하게 한다.
  async discoverTotals(){
   const at=now();
   if(totalsCache&&at-totalsCache.at<60_000)return totalsCache.value;
   if(typeof communityRepo.discoverTotals!=='function')return {trees:0,moments:0};
   const value=await communityRepo.discoverTotals({productId});
   totalsCache={at,value};
   return value;
  },
  async discover({query='',emotion='',artistGroup='',cursor='',limit=12,viewerSubjectId=null,sort='latest'}={}){
   const q=clean(query,80).toLocaleLowerCase('ko-KR'),tag=clean(emotion,12),artistKey=tagKey(clean(artistGroup,24)),size=Math.max(1,Math.min(24,Number(limit)||12));
   // #824 결정 2: sort='popular'면 이번 주 표 수 내림차순. 모르는 값은 기본(latest)으로 돌린다.
   const sortKey=sort==='popular'?'popular':'latest';
   // #611 3번: AI 명예회원 배지 비트 — 이번 한 번의 둘러보기 조회에서는 같은 주인이면 한 번만 묻는다.
   // #678 후속: 역할을 한 번만 물어 두고(주인당 한 번) 그 값으로 배지와 시험 계정 거름을 함께 판정한다.
   const roleCache=new Map();
   const roleOf=admin?async subjectId=>{
    if(!roleCache.has(subjectId))roleCache.set(subjectId,await admin.roleFor({productId,subjectId}));
    return roleCache.get(subjectId);
   }:null;
   const aiTesterLookup=roleOf?async subjectId=>isAiTesterRole(await roleOf(subjectId)):null;
   const isTesterLookup=roleOf?async subjectId=>await roleOf(subjectId)===ROLE_TESTER:null;
   let entries;
   if(typeof communityRepo.listDiscoverableSummaries==='function'){
    const {since,until}=votingWeek();
    const summaries=await communityRepo.listDiscoverableSummaries({productId,viewerSubjectId,limit:240,sort:sortKey,weekSince:since,weekUntil:until});
    entries=await Promise.all(summaries.map(async summary=>{
     // 시험 계정(tester 역할) 트리는 둘러보기 목록·검색에서 뺀다(#678 후속 — 공유 링크 직접 열기는 그대로).
     if(await isTesterLookup(summary.share.subjectId))return null;
     const item=await card(summary.share,viewerSubjectId,summary.stats,summary.lastActivityAt,aiTesterLookup);
     return item;
    }));
   }else{
    const shares=await communityRepo.listDiscoverable({productId,viewerSubjectId,limit:240});
    entries=await Promise.all(shares.map(async share=>{
     if(await isTesterLookup(share.subjectId))return null;
     return card(share,viewerSubjectId,null,null,aiTesterLookup);
    }));
   }
   const baseCards=[];
    for(const item of entries){if(!item)continue;const haystack=(item.title+' '+item.subject+' '+item.summary+' '+(item.searchText||'')).toLocaleLowerCase('ko-KR');if(q&&!haystack.includes(q))continue;if(tag&&!item.emotions.includes(tag))continue;baseCards.push(item);}
   const cards=artistKey?baseCards.filter(item=>item.artistTags?.includes(artistKey)):baseCards;
   const start=cursor?Math.max(0,cards.findIndex(item=>item.shareId===cursor)+1):0,items=cards.slice(start,start+size),next=start+size<cards.length?items.at(-1)?.shareId||null:null;
   // #784 '그룹 찾기' 창 + 칩 순서: 필터 결과(cards)가 아니라 baseCards(가수 필터만 떼기 전)를 센다 —
   // 그룹을 고른 뒤 목록이 비어도 개수(상태)가 사라지지 않기 위함이다. 개수 = 공개 트리 수
   // (한 트리가 한 그룹을 여러 순간 가져도 한 번). groups는 칩용 상위 8, groupsAll은 찾기 창용 전체
   // (가나다순, 상한 200). 내 그룹은 화면(getArtistGroups)이 합친다.
   const byKey=new Map();
   for(const item of baseCards){
    if(!item)continue;
    const counted=new Set();
    for(const [key,name] of (item.artistNames||[])){
     if(counted.has(key))continue;
     counted.add(key);
     const rec=byKey.get(key);
     if(rec)rec.count+=1;
     else byKey.set(key,{group:name,count:1});
    }
   }
   const all=[...byKey.values()].map(({group,count})=>({value:group,count}));
   const groups=[...all].sort((a,b)=>b.count-a.count||String(a.value).localeCompare(String(b.value),'ko')).slice(0,8);
   const groupsAll=[...all].sort((a,b)=>String(a.value).localeCompare(String(b.value),'ko')).slice(0,200);
   return {items,nextCursor:next,totalVisible:cards.length,groups,groupsAll};
  },
  // #627 3단계 '다른 팬 보기': 같은 꼬리표('종류:값')를 담은 공개 순간(공유 상태 active·비공개 아님)을 찾는다.
  // 화면은 아직 만들지 않는다(회차 진행 중 — 서버 규칙만). 판정은 화면과 같은 한 벌(public/v41/tags.mjs의
  // parseTag·tagKey)로 표기 차이('Super Shy'와 'super shy.')를 하나로 묶는다. 개수 제한·순서(무대 날짜 최신 먼저)는
  // 여기서 정하고, 비공개 미디어 주소 거름은 공개 읽기 경로(projectSharedTree)를 그대로 쓴다.
  async tagMoments({tag='',viewerSubjectId=null}={}){
   const parsed=parseTag(clean(tag,28));
   if(!parsed||parsed.kindId===null||!parsed.value)throw new ApiError(400,'tag_invalid','꼬리표 형식을 확인해 주세요(종류:값).');
   const valueKey=tagKey(parsed.value);
   const matches=(raw)=>{const p=parseTag(raw);return !!p&&p.kindId===parsed.kindId&&tagKey(p.value)===valueKey;};
   // 공개 공유 행을 스캔한 뒤(최근 것부터 상한 400행) 문서에서 순간을 걸러 낸다 — 지금 규모(수십~수백 트리)에서
   // 충분하다. 공개 트리가 수천 개가 되면 파생 꼬리표 표(moments_tags)+색인으로 SQL에서 바로 걸러 내야 한다.
   const shares=await communityRepo.listPublicTagShares({productId,viewerSubjectId,limit:400});
   const docs=new Map(),roles=new Map(),items=[];
   for(const share of shares){
    let stored=docs.get(share.subjectId);
    if(stored===undefined){stored=await workspaceRepo.load({productId,subjectId:share.subjectId});docs.set(share.subjectId,stored);}
    if(!stored)continue;
    let tree;
    try{tree=projectSharedTree(stored.doc,share.treeId).tree;}catch{continue;} // 문서에서 사라진 트리는 건너뛴다
    if(!tree.moments.length)continue;
    // #678 후속: 역할을 주인당 한 번만 물어 두고, 시험 계정(tester 역할) 트리는 '다른 팬 보기' 목록에서
    // 뺀다(공유 링크 직접 열기 /t/<id>는 그대로). AI 명예회원 배지는 같은 판정으로 한 비트만 내린다.
    let role=roles.get(share.subjectId);
    if(role===undefined){role=admin?await admin.roleFor({productId,subjectId:share.subjectId}):null;roles.set(share.subjectId,role);}
    if(role===ROLE_TESTER)continue;
    const aiTester=isAiTesterRole(role);
    for(const moment of tree.moments){
     if(!Array.isArray(moment.keywords)||!moment.keywords.some(matches))continue;
     items.push({
      shareId:share.shareId,
      link:'/t/'+share.shareId,
      treeTitle:tree.title,
      title:moment.title,
      url:moment.url||'',
      thumbnail:moment.mediaMetadata?.thumbnail||moment.thumbnailUrl||'',
      date:moment.date||'',
      aiTester
     });
    }
   }
   items.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(a.shareId).localeCompare(String(b.shareId)));
   return {tag:parsed.raw,items:items.slice(0,TAG_MOMENT_LIMIT)};
  },
  // #1025 1단계: 공개 순간 중 '세로 영상'만 무작위로 내려준다.
  // 공개 판정은 공개 읽기 경로(listPublicTagShares + projectSharedTree)를 그대로 쓰고,
  // 세로 판정도 화면과 같은 한 벌(isVerticalMoment)을 쓴다 — 서버에 규칙을 복사하지 않는다.
  // 이미 본 영상 id(youtube id)는 요청에서 받아 제외한다(세션 동안 같은 영상 반복 0).
  async moments({limit=MOMENT_FEED_LIMIT,exclude=[],tag='',viewerSubjectId=null}={}){
   const want=Number.isFinite(Number(limit))?Math.max(1,Math.min(MOMENT_FEED_LIMIT,Math.floor(Number(limit)||MOMENT_FEED_LIMIT))):MOMENT_FEED_LIMIT;
   const seen=new Set((Array.isArray(exclude)?exclude:[]).map(x=>String(x||'').trim()).filter(Boolean));
   const parsedTag=tag?parseTag(clean(tag,28)):null;
   const tagValue=parsedTag?.kindId!==null&&parsedTag?.kindId!==undefined?tagKey(parsedTag.value):null;
   const matchesTag=moment=>!tagValue||(Array.isArray(moment.keywords)&&moment.keywords.some(raw=>{const p=parseTag(raw);return !!p&&p.kindId===parsedTag.kindId&&tagKey(p.value)===tagValue;}));
   const shares=await communityRepo.listPublicTagShares({productId,viewerSubjectId,limit:400});
   const docs=new Map(),roles=new Map(),found=[],groupCounts=new Map();
   for(const share of shares){
    let stored=docs.get(share.subjectId);
    if(stored===undefined){stored=await workspaceRepo.load({productId,subjectId:share.subjectId});docs.set(share.subjectId,stored);}
    if(!stored)continue;
    let tree;
    try{tree=projectSharedTree(stored.doc,share.treeId).tree;}catch{continue;}
    let role=roles.get(share.subjectId);
    if(role===undefined){role=admin?await admin.roleFor({productId,subjectId:share.subjectId}):null;roles.set(share.subjectId,role);}
    if(role===ROLE_TESTER)continue;
    const aiTester=isAiTesterRole(role);
    for(const moment of tree.moments){
     // 세로 판정값이 없는 옛 순간(isVerticalMoment=false)은 내보내지 않는다 — 화면에서 한 번 판정한 뒤 다시 요청한다.
     if(!isVerticalMoment(moment))continue;
     const videoId=youtubeIdFrom(moment.url||moment.externalUrl||'');
     const id=videoId||moment.id;
     if(seen.has(id)||seen.has(moment.id))continue;
     seen.add(id);seen.add(moment.id);
     // 2단계 칩: 공개 세로 순간에서 가수 꼬리표를 센다(순간당 한 번, 채널성 이름 제외) — discover의 같은 규칙.
     const counted=new Set();
     for(const raw of (Array.isArray(moment.keywords)?moment.keywords:[])){
      const parsed=parseTag(raw);
      if(!parsed||parsed.kindId!=='artist'||isChannelLikeArtist(parsed.value))continue;
      const key=tagKey(parsed.value);
      if(counted.has(key))continue;
      counted.add(key);
      const rec=groupCounts.get(key);
      if(rec)rec.count+=1;else groupCounts.set(key,{value:parsed.value,count:1});
     }
     if(!matchesTag(moment))continue;
     found.push({
      id:moment.id,
      videoId,
      shareId:share.shareId,
      treeTitle:tree.title,
      title:moment.title,
      url:moment.url||'',
      thumbnail:safeYoutubeThumb(moment.mediaMetadata?.thumbnail||moment.thumbnailUrl||'')||(videoId?youtubeStageThumbUrl(videoId,'oardefault'):'')||moment.mediaMetadata?.thumbnail||'',
      note:moment.note||'',
      emotion:moment.emotion||'',
      date:moment.date||'',
      keywords:Array.isArray(moment.keywords)?moment.keywords.slice(0,12):[],
      startSeconds:Number.isSafeInteger(moment.startSeconds)&&moment.startSeconds>=0?moment.startSeconds:null,
      endSeconds:Number.isSafeInteger(moment.endSeconds)&&moment.endSeconds>Number(moment.startSeconds||0)?moment.endSeconds:null,
      aiTester
     });
    }
   }
   // Fisher-Yates — 무작위 순서지만 같은 배열 안에서 중복은 없다. random 은 시험에서 고정할 수 있다.
   for(let i=found.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[found[i],found[j]]=[found[j],found[i]];}
   const groups=[...groupCounts.values()].sort((a,b)=>b.count-a.count||String(a.value).localeCompare(String(b.value),'ko')).slice(0,6);
   return {items:found.slice(0,want),total:found.length,groups};
  },
  // 담기 = 트리 투표(#824 대표 결정). 켤 때만 두 일을 한다:
  // ① 가입 7일 게이트 — 가입일(첫 로그인 시각)이 7일 미만이면 막는다(403 vote_too_new).
  //    가입일을 못 읽으면(행 없음·미연결) 보수적으로 신규와 같이 막는다 — 뚫리는 쪽으로 잘못 나가지 않게.
  //    signupAtFor 가 아예 연결되지 않은 조립(기존 시험)에서는 게이트가 꺼진다 — 운영 조립(index.js)은 항상 연결한다.
  // ② 즐겨찾기 행 + 투표 표 기록 — 표는 append-only(1인 1표 영구, 재담기도 새 표 아님).
  // 해제는 자유 — 즐겨찾기 행만 지고, 표는 남는다.
  async favorite(subjectId,shareId,enabled){
   await activeShare(shareId);rate(subjectId,'favorite',40);
   if(enabled){
    if(signupAtFor && !await oldEnoughToVote(subjectId))throw tooNew();
    await communityRepo.setFavorite({productId,shareId,subjectId,enabled:true});
    await communityRepo.recordVote({productId,targetKind:'tree',targetId:shareId,subjectId});
   }else{
    await communityRepo.setFavorite({productId,shareId,subjectId,enabled:false});
   }
   const stats=await communityRepo.stats({productId,shareId,viewerSubjectId:subjectId});
   const voted=await communityRepo.hasVoted({productId,targetKind:'tree',targetId:shareId,subjectId});
   const weeklyFavorites=(await communityRepo.weeklyVoteCounts({productId,targetKind:'tree',...votingWeek()}))[shareId]||0;
   return {...stats,voted,weeklyFavorites};
  },
  async favorites(subjectId){return communityRepo.listFavorites({productId,subjectId});},
  async react(subjectId,shareId,enabled,kind='heart'){
   if(!isReactionKind(kind))throw new ApiError(400,'reaction_kind_invalid','지원하지 않는 반응이에요.');
   const share=await activeShare(shareId);rate(subjectId,'reaction',40);
   if(communityRepo?.isBlocked){
    const blocked=await communityRepo.isBlocked({productId,blockerSubjectId:subjectId,blockedSubjectId:share.subjectId});
    if(blocked)throw new ApiError(403,'reaction_blocked','차단한 기록에는 반응할 수 없어요.');
   }
   await communityRepo.setReaction({productId,shareId,subjectId,kind,enabled});
   // #824 결정 7: 담기·공감 응답 모양을 같게 — 화면이 카드를 다시 그릴 때 이번 주 표 수가 사라지지 않게 한다.
   const stats=await communityRepo.stats({productId,shareId,viewerSubjectId:subjectId});
   const voted=await communityRepo.hasVoted({productId,targetKind:'tree',targetId:shareId,subjectId});
   const weeklyFavorites=(await communityRepo.weeklyVoteCounts({productId,targetKind:'tree',...votingWeek()}))[shareId]||0;
   return {...stats,voted,weeklyFavorites};},
  async comments(shareId,viewerSubjectId){await activeShare(shareId);const isAdmin=!!viewerSubjectId&&!!admin&&await admin.roleFor({productId,subjectId:viewerSubjectId})==='admin';return (await communityRepo.listComments({productId,shareId,limit:50})).map(row=>publicComment(row,viewerSubjectId,isAdmin));},
  async comment(subjectId,shareId,body,key){const share=await activeShare(shareId);rate(subjectId,'comment',12);if(communityRepo?.isBlocked){const blocked=await communityRepo.isBlocked({productId,blockerSubjectId:subjectId,blockedSubjectId:share.subjectId});if(blocked)throw new ApiError(403,'comment_blocked','차단한 기록에는 댓글을 남길 수 없어요.');}const text=clean(body,1000);if(!text)throw new ApiError(400,'comment_empty','댓글을 입력해 주세요.');const row=await communityRepo.createComment({productId,commentId:makeId(),shareId,subjectId,body:text,clientKey:key});return publicComment(row,subjectId);},
  async updateComment(subjectId,commentId,body){if(!ITEM_ID.test(commentId))throw new ApiError(404,'comment_not_found','댓글을 찾을 수 없어요.');rate(subjectId,'comment',12);const text=clean(body,1000);if(!text)throw new ApiError(400,'comment_empty','댓글을 입력해 주세요.');const current=await communityRepo.getComment?.({productId,commentId});if(!current||current.status!=='visible')throw new ApiError(404,'comment_not_found','댓글을 찾을 수 없어요.');if(current.subjectId!==subjectId)throw new ApiError(403,'comment_forbidden','이 댓글을 수정할 수 없어요.');const share=await shareRepo.load({productId,shareId:current.shareId});if(!share||share.status!=='active')throw new ApiError(404,'share_not_found','공개 트리를 찾을 수 없어요.');if(communityRepo?.isBlocked){const blocked=await communityRepo.isBlocked({productId,blockerSubjectId:subjectId,blockedSubjectId:share.subjectId});if(blocked)throw new ApiError(403,'comment_blocked','차단한 기록에는 댓글을 남길 수 없어요.');}const row=await communityRepo.updateComment({productId,commentId,subjectId,body:text});if(!row)throw new ApiError(403,'comment_forbidden','이 댓글을 수정할 수 없어요.');return publicComment(row,subjectId);},
  async deleteComment(subjectId,commentId){if(!ITEM_ID.test(commentId))throw new ApiError(404,'comment_not_found','댓글을 찾을 수 없어요.');const principal={productId,subjectId};const isAdmin=!!admin&&await admin.roleFor(principal)==='admin';const row=await communityRepo.deleteComment({productId,commentId,subjectId,admin:isAdmin});if(!row)throw new ApiError(403,'comment_forbidden','이 댓글을 지울 수 없어요.');return {deleted:true};},
  async report(subjectId,shareId,reason,key){await activeShare(shareId);rate(subjectId,'report',6);const text=clean(reason,500);if(!text)throw new ApiError(400,'report_reason_required','신고 이유를 입력해 주세요.');const row=await communityRepo.createReport({productId,reportId:makeId(),shareId,subjectId,reason:text,clientKey:key});return {id:row.id,status:row.status,createdAt:row.createdAt};},
  async block(subjectId,shareId){const share=await activeShare(shareId);if(share.subjectId===subjectId)throw new ApiError(400,'cannot_block_self','내 공개 트리는 차단할 수 없어요.');await communityRepo.blockOwner({productId,blockerSubjectId:subjectId,blockedSubjectId:share.subjectId});return {blocked:true};},
  async reports(principal){if(!admin||await admin.roleFor(principal)!=='admin')throw new ApiError(403,'admin_forbidden','관리자 권한이 필요해요.');return communityRepo.listReports({productId,limit:100});},
  async moderate(principal,reportId,{status,visibility}){
   if(!admin||await admin.roleFor(principal)!=='admin')throw new ApiError(403,'admin_forbidden','관리자 권한이 필요해요.');
   if(!['resolved','dismissed'].includes(status))throw new ApiError(400,'moderation_status_invalid','처리 상태를 확인해 주세요.');
   if(!['hidden','visible'].includes(visibility))throw new ApiError(400,'moderation_visibility_invalid','공개 상태를 확인해 주세요.');
   const row=await communityRepo.moderateReport({productId,reportId,status,visibility,actorSubjectId:principal.subjectId});
   if(!row)throw new ApiError(404,'report_not_found','신고를 찾을 수 없어요.');
   await refreshStageIndex(stageIndex,{productId,shareId:row.shareId},shareRepo);
   return {id:row.id,status:row.status,hidden:row.hidden,resolvedAt:row.resolvedAt};
  }
 };
}

export function createCommunityHandler({authenticate,service,productId}){
 async function principal(request,required=true){
  try{return parsePrincipal(await authenticate(request),productId);}
  catch(error){if(!required&&error instanceof ApiError&&error.status===401)return null;if(error instanceof ApiError)throw error;throw new ApiError(503,'auth_unavailable','로그인 연결에 문제가 생겼어요.');}
 }
 async function handle(request){
  const path=String(request?.path||''),method=request?.method||'GET',query=request?.query||new URLSearchParams();
  if(path==='/api/community/stages/popular'&&method==='GET'){
   const who=await principal(request,false);
   return {status:200,body:await service.popularStages(who?.subjectId??null),headers:NO_STORE};
  }
  const momentStage=path.match(/^\/api\/community\/shares\/([A-Za-z0-9_-]{20,64})\/moments\/([A-Za-z0-9_-]{1,80})\/stage$/);
  if(momentStage&&method==='GET'){
   const who=await principal(request,false);
   return {status:200,body:await service.momentStage({viewerSubjectId:who?.subjectId??null,shareId:momentStage[1],momentId:momentStage[2]}),headers:NO_STORE};
  }
  const stageDetail=path.match(/^\/api\/community\/stages\/([A-Za-z0-9_-]{1,80})$/);
  if(stageDetail&&method==='GET'){
   const who=await principal(request,false);
   return {status:200,body:await service.stageDetail({viewerSubjectId:who?.subjectId??null,stageId:stageDetail[1],
    currentShareId:query.get('currentShareId'),afterShareId:query.get('cursor')}),headers:NO_STORE};
  }
  const stageVote=path.match(/^\/api\/community\/stages\/([A-Za-z0-9_-]{1,80})\/vote$/);
  if(stageVote&&(method==='PUT'||method==='DELETE')){
   const who=await principal(request);
   const result=await service.voteStage(who.subjectId,stageVote[1],method==='PUT');
   return {status:method==='PUT'?200:204,body:result,headers:NO_STORE};
  }
  // #627 3단계 '다른 팬 보기' — 공개 경로라 로그인 없이도 부른다. 로그인했으면 자기 트리·차단 관계를 뺀다.
  if(path==='/api/public/tag-moments'&&method==='GET'){const who=await principal(request,false);return {status:200,body:await service.tagMoments({tag:String(query.get('tag')||''),viewerSubjectId:who?.subjectId||null}),headers:NO_STORE};}
  // #1025: 공개 세로 순간 무작위 조회(로그인 없이도 부른다). exclude=쉼표로 구분한 본 영상 id.
  if(path==='/api/public/moments'&&method==='GET'){const who=await principal(request,false);return {status:200,body:await service.moments({limit:query.get('limit')||MOMENT_FEED_LIMIT,exclude:String(query.get('exclude')||'').split(',').map(x=>x.trim()).filter(Boolean),tag:String(query.get('tag')||''),viewerSubjectId:who?.subjectId||null}),headers:NO_STORE};}
  if(path==='/api/community/stats'&&method==='GET'){return {status:200,body:await service.discoverTotals(),headers:{...NO_STORE,'cache-control':'public, max-age=60'}};}
  if(path==='/api/community/shares'&&method==='GET'){const who=await principal(request,false);return {status:200,body:await service.discover({query:query.get('q')||'',emotion:query.get('emotion')||'',artistGroup:query.get('artist')||'',cursor:query.get('cursor')||'',limit:query.get('limit')||12,viewerSubjectId:who?.subjectId||null,sort:query.get('sort')||'latest'}),headers:NO_STORE};}
  if(path==='/api/community/me/favorites'&&method==='GET'){const who=await principal(request);return {status:200,body:{shareIds:await service.favorites(who.subjectId)},headers:NO_STORE};}
  if(path==='/api/community/admin/reports'&&method==='GET'){const who=await principal(request);return {status:200,body:{reports:await service.reports(who)},headers:NO_STORE};}
  const moderate=path.match(/^\/api\/community\/admin\/reports\/([^/]+)$/);
  if(moderate&&method==='PATCH'){const who=await principal(request),body=jsonBody(request);return {status:200,body:{report:await service.moderate(who,moderate[1],body)},headers:NO_STORE};}
  const comments=path.match(/^\/api\/community\/shares\/([^/]+)\/comments$/);
  if(comments){if(method==='GET'){const who=await principal(request,false);return {status:200,body:{comments:await service.comments(comments[1],who?.subjectId||null)},headers:NO_STORE};}if(method==='POST'){const who=await principal(request),body=jsonBody(request);return {status:201,body:{comment:await service.comment(who.subjectId,comments[1],body.body,clientKey(request))},headers:NO_STORE};}}
  const commentItem=path.match(/^\/api\/community\/comments\/([^/]+)$/);
  if(commentItem&&method==='DELETE'){const who=await principal(request);return {status:200,body:await service.deleteComment(who.subjectId,commentItem[1]),headers:NO_STORE};}
  if(commentItem&&method==='PATCH'){const who=await principal(request),body=jsonBody(request);return {status:200,body:{comment:await service.updateComment(who.subjectId,commentItem[1],body.body)},headers:NO_STORE};}
  const action=path.match(/^\/api\/community\/shares\/([^/]+)\/(favorite|reaction|report|block)$/);
  if(action){const who=await principal(request),[,shareId,kind]=action;if(kind==='favorite'&&(method==='PUT'||method==='DELETE'))return {status:200,body:{stats:await service.favorite(who.subjectId,shareId,method==='PUT')},headers:NO_STORE};if(kind==='reaction'&&(method==='PUT'||method==='DELETE')){let reactionKind='heart';if(method==='PUT'){try{const body=jsonBody(request);reactionKind=(body&&typeof body==='object'&&typeof body.kind==='string'&&body.kind.trim()!==''?body.kind.trim():'heart');}catch{reactionKind='heart';}}else{const q=String(request?.query?.get?.('kind')||'').trim();reactionKind=q||'heart';}return {status:200,body:{stats:await service.react(who.subjectId,shareId,method==='PUT',reactionKind)},headers:NO_STORE};}if(kind==='report'&&method==='POST'){const body=jsonBody(request);return {status:201,body:{report:await service.report(who.subjectId,shareId,body.reason,clientKey(request))},headers:NO_STORE};}if(kind==='block'&&method==='POST')return {status:200,body:await service.block(who.subjectId,shareId),headers:NO_STORE};}
  throw new ApiError(404,'not_found','요청을 찾을 수 없어요.');
 }
 return async request=>{try{return await handle(request);}catch(error){if(error instanceof ApiError)return {status:error.status,body:{error:{code:error.code,message:error.message,...(error.details||{})}},headers:NO_STORE};console.error('[lovetree-community] request failed',{path:request?.path,method:request?.method});return {status:500,body:{error:{code:'internal_error',message:'서버에서 처리하지 못했어요.'}},headers:NO_STORE};}};
}

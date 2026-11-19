// #792 4단계 ⑤ — 공개 무대 담기(투표) 화면 부품.
// 규칙은 ④ 서버 계약 그대로다: 한 사람 한 표, 가입 7일 뒤부터, 주는 한국 시간 월~일,
// 서버가 3표 미만이면 weeklyVoters를 null로 내린다(#824 결정 7 — 3부터 숫자가 보인다).
// 여기서는 서버가 준 값을 그리기만 한다(새 저장소 키를 만들지 않는다).
export const STAGE_VOTE_LABEL='이 무대 담기';
export const STAGE_VOTE_DONE_LABEL='✓ 이 무대 담기';
export const VOTE_TOO_NEW_NOTICE='가입하고 7일이 지나면 투표할 수 있어요.';
export const POPULAR_STAGE_TITLE='이번 주 인기 무대';
export const POPULAR_STAGE_EMPTY='이번 주 인기 무대를 모으고 있어요';
export const POPULAR_STAGE_WEEK_LABEL='이번 주 담은 사람';
// 3 미만은 숫자를 감춘다 — null·0·1·2 모두 같은 규칙이다.
export const publicStageCount=count=>{const n=Number(count);return Number.isFinite(n)&&n>=3?Math.round(n):null;};
export const stageCountLabel=(label,count)=>{const n=publicStageCount(count);return n===null?label:`${label} ${n}`;};
export const stageVoteLabel=voted=>voted?STAGE_VOTE_DONE_LABEL:STAGE_VOTE_LABEL;
// 담기가 막혔을 때 단추 아래에 내릴 한 줄. 가입 7일 안내는 화면에서 한 번만 쓴다(서버 문구도 같은 말).
export const stageVoteNotice=answer=>answer?.code==='vote_too_new'?VOTE_TOO_NEW_NOTICE:(answer?.message||'무대를 담지 못했어요.');
// 공유 책 화면은 주소(#share/<id>/<보기>)로 지금 공유 번호를 안다 — 셸을 고치지 않는다.
export const stageShareId=hash=>{
 const matched=/^#?share\/([A-Za-z0-9_-]{20,64})(?:\/|$)/.exec(String(hash||''));
 return matched?matched[1]:'';
};
export const stageMomentTitle=item=>String(item?.title||'').trim()||'공개 무대';
// 표지 순간이 공개 무대인지 먼저 확인한다 — 아니면 단추를 만들지 않는다.
export async function readStage({api,shareId,momentId}){
 if(!shareId||!momentId)return null;
 const found=await api.momentStage(shareId,momentId);
 if(!found?.ok||!found.stageId)return null;
 const detail=await api.stageDetail(found.stageId,{currentShareId:shareId});
 return {
  stageId:found.stageId,
  title:detail?.ok?String(detail.title||''):'',
  voted:detail?.ok&&detail.voted===true,
  saved:detail?.ok&&detail.saved===true,
  weeklyVoters:detail?.ok?publicStageCount(detail.weeklyVoters):null,
  publicTreeCount:detail?.ok?publicStageCount(detail.publicTreeCount):null
 };
}
// 담기·담기 취소. 성공하면 화면이 쓰는 현재 상태를 돌려준다(해제는 204라 본문이 없다).
export async function toggleStage({api,stageId,voted}){
 const answer=await api.voteStage(stageId,!voted);
 if(!answer?.ok)return {ok:false,answer};
 return {ok:true,voted:!voted,weeklyVoters:answer.weeklyVoters==null?null:publicStageCount(answer.weeklyVoters)};
}

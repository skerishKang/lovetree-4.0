import {workspaceModel} from './workspace-model.mjs';
export function createServerReader({api,onClear,onDocument,onStatus}) {
  let generation=0;
  return {
    async read(){
      const gen=++generation;onClear();onStatus('서버 기록을 확인하고 있어요.');
      const answer=await api.get();if(gen!==generation)return;
      if(!answer.ok){onStatus(answer.status===401?'로그인이 필요해요.':answer.code==='timeout'?'서버 응답 시간이 초과됐어요. 다시 시도해 주세요.':'서버 기록을 읽지 못했어요. 다시 시도해 주세요.');return;}
      try{workspaceModel(answer);onDocument(answer);onStatus('로그인한 계정의 서버 기록 · 읽기 전용');}
      catch{onClear();onStatus('서버 기록 형식을 확인하지 못했어요.');}
    },
    async logout(){++generation;onClear();const result=await api.logout();onStatus(result.ok?'로그아웃했습니다.':'화면의 기록은 비웠지만 서버 로그아웃은 실패했어요. 다시 시도해 주세요.');},
    cancel(){++generation;onClear();}
  };
}

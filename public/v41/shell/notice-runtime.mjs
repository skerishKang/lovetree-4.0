// 안내 줄의 자리와 순서, 읽기 오류 안내.
import {createNotifier, syncedNoticeText, newlyPublishedTrees, NOTICE_HIDE_MS} from "./notice.mjs";
import {createNoticeQueue} from "./notice-queue.mjs";

export function createNoticeRuntime(ctx){
  let $, noticeQueue, syncedNoticeKeys, shellNotice, updatesCardBox, guardNoticeKey;
  // #666: 알림 줄(토스트)은 화면 아래에 늘 붙어 있는 것들 — '새 소식·의견 보내기' 링크 줄, ＋ 단추, 새 소식 카드 —
  // 을 덮지 않는다. 붙어 있는 것들의 가장 높은 윗변을 좌표로 재서 그 위로 올린다(글자 크기·화면 폭이 달라도 겹침 0).
  // 390 실측: 링크 줄 아래 10~37px·＋ 단추 12~68px·카드 86~152px → 알림 줄 아래 134px.
  function keepClearEls(doc){const out=[];const walk=(root)=>{for(const el of root.querySelectorAll('[data-lt-keep-clear]'))out.push(el);for(const el of root.querySelectorAll('*'))if(el.shadowRoot)walk(el.shadowRoot)};walk(doc);return out}

  function placeToast(){let above=0;for(const el of document.querySelectorAll('.home-links,#mobile-add,.updates-card')){if(el.hidden)continue;const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0)continue;const r=el.getBoundingClientRect();if(r.width<1||r.height<1)continue;above=Math.max(above,document.documentElement.clientHeight-r.top+10)}
   // 화면 안의 아래쪽 내용(data-lt-keep-clear 표식 — 책의 페이지 알약·이유 안내·갈림길 책갈피, 첫 화면 숫자판)도 알림이 덮지 않게 한다.
   // 보이는 프레임 문서까지 같은 좌표로 잰다(3회차 보람 회차 — 알림이 책 아래 안내 줄에 포개졌다).
   // 첫 화면 숫자판은 그림자 뿌리(#898) 안에 있으므로 그림자 뿌리까지 걸어 들어가 표식을 모은다.
   const keepFrame=[...document.querySelectorAll('#view,#view-next')].find(f=>!f.hidden&&f.contentDocument&&keepClearEls(f.contentDocument).length);
   if(keepFrame){const fr=keepFrame.getBoundingClientRect();for(const el of keepClearEls(keepFrame.contentDocument)){const cs=keepFrame.contentDocument.defaultView.getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0)continue;const r=el.getBoundingClientRect();if(r.width<1||r.height<1)continue;above=Math.max(above,document.documentElement.clientHeight-(fr.top+r.top)+10)}}
   const style=document.documentElement.style;if(above>0)style.setProperty('--lt-toast-bottom',Math.round(above)+'px');else style.removeProperty('--lt-toast-bottom')}

  function hideToast(){const toast=$('toast');if(toast)toast.hidden=true;}

  function notify(text,options){return shellNotice.notify(text,options);}

  function workspaceGuardNotice(read){
   const skipped=Array.isArray(read?.skipped)?read.skipped:[];
   const quarantined=Number.isSafeInteger(read?.quarantined)?read.quarantined:0;
   const total=skipped.length+quarantined;
   if(!total)return;
   const key=`${skipped.map(item=>`${item?.id||''}:${item?.reason||''}`).join('|')}#${quarantined}`;
   if(guardNoticeKey===key)return;
   guardNoticeKey=key;
   if(skipped.length)console.warn(`[LT41] 열 수 없는 트리 ${skipped.length}개를 잠시 빼고 열었어요: ${skipped.map(item=>`${item?.id||'(아이디 없음)'}(${item?.reason||'형식을 읽을 수 없어요.'})`).join(', ')}`);
   if(quarantined)console.warn(`[LT41] 서버 기록에서 열 수 없는 트리 ${quarantined}개를 빼고 열었어요(개수만 전해 왔어요).`);
   notify(`열 수 없는 트리 ${total}개를 잠시 빼고 열었어요.`,{hold:true});
  }
  Object.defineProperties(ctx,{
    $:{get:()=>$,set:value=>{$=value;}},
    placeToast:{value:placeToast},
    noticeQueue:{get:()=>noticeQueue,set:value=>{noticeQueue=value;}},
    syncedNoticeKeys:{get:()=>syncedNoticeKeys,set:value=>{syncedNoticeKeys=value;}},
    shellNotice:{get:()=>shellNotice,set:value=>{shellNotice=value;}},
    hideToast:{value:hideToast},
    notify:{value:notify},
    workspaceGuardNotice:{value:workspaceGuardNotice}
  });
  return {mount(){
    $=id=>document.getElementById(id);

    addEventListener('resize',placeToast);

    addEventListener('orientationchange',()=>setTimeout(placeToast,0));

    // ＋ 단추(body.lt-fab-ok)·새 소식 카드가 늦게 뜨거나 닫힐 때도 다시 잰다.
    placeToast();

    new MutationObserver(placeToast).observe(document.body,{attributes:true,attributeFilter:['class']});

    placeToast();

    // #1103: 세 안내가 같은 줄을 차례로 지나간다. 판·띠가 떠 있는 동안 토스트는 띄우지 않는다.
    noticeQueue=createNoticeQueue();

    syncedNoticeKeys=new Set();

    // 안내 한 벌(#353 후속): 담기·중복·로그인 필요 안내(hold)가 상태 안내보다 먼저 일정 시간 보인다.
    // 안내가 스스로 내려가면(시간이 다 되어 숨을 때) 줄을 비워 다음 안내가 올라오게 한다.
    shellNotice=createNotifier({$,beforeShow:placeToast,afterShow:()=>{placeToast();setTimeout(placeToast,600);setTimeout(placeToast,1400);},onHide:()=>{noticeQueue.release('toast');}});

    // 새 소식 띠도 같은 줄을 탄다 — 먼저 뜬 안내가 내려간 뒤에 올라온다.
    updatesCardBox=$('updates-card');

    if(updatesCardBox)new MutationObserver(()=>{
      placeToast();
      if(updatesCardBox.hidden){if(noticeQueue.currentId()==='updates')noticeQueue.release('updates');}
      else if(noticeQueue.currentId()!=='updates'){
        updatesCardBox.hidden=true;
        noticeQueue.request('updates',{show:()=>{hideToast();updatesCardBox.hidden=false;},hide:()=>{updatesCardBox.hidden=true;}});
      }
    }).observe(updatesCardBox,{attributes:true,attributeFilter:['hidden']});

    // #977: 서버 기록에 형식이 어긋난 트리가 섞여 있으면 그 트리만 빼고 셸을 연다(읽기는 workspace-guard.mjs).
    // #986: 서버가 읽지 못해 빼 둔 트리는 개수(quarantined)만 응답에 온다 — 화면 안내에 함께 센다.
    // 화면에는 짧은 안내 한 줄, 콘솔에는 어느 트리가 왜 어긋났는지 한 줄만 남긴다 — 같은 기록을 다시 읽어도 한 번만.
    guardNoticeKey='';
  }};
}

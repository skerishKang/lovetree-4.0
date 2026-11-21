// createTreeTips — shell.mjs에서 코드 위치만 옮긴 모듈(#886 PR 2). 동작은 그대로다.
export function createTreeTips(deps){
const { $, document, localStorage, noticeQueue, FIRST_TREE_TIPS, tipsWanted, readTipsSeen, writeTipsSeen, shellPanels, hideToast, flowNavigation } = deps;
// #213 3번: 첫 트리 안내 말풍선. 한 번만 보여 주고, 닫으면 기억한다(저장소가 막히면 다시 보여 준다).
// #549: 모달 창이 열려 있는 동안에는 창 밖 요소가 전부 inert가 되어 '알겠어요'가 눌리지 않았다(빈 알림
// 요소가 가로채는 것이 아니라 모달 창 자체가 누름을 막는다). #566에서는 창 안 맨 위로 옮겨 붙였지만
// 안내 판이 창 내용 위에 포개지는 일이 반복됐다(#845·#846 사용 일지 — 순간 추가·내 의견 창, PR #851 캡처).
// 261118 대표 결정: 창 안으로 옮기지 않고, 창(#845 설계안의 15개 모달 창)이 하나라도 열려 있는 동안은
// 안내 판을 숨긴다. 창이 모두 닫히면 다시 띄우고, 이때 '봤음'으로 적지 않는다(#666의 계정 메뉴 미루기와
// 같은 규칙 — 미뤘다고 본 것으로 치지 않는다).
let tipsReturnFocus=null;
function anyDialogOpen(){return !!document.querySelector('dialog[open]');}
function tipsFollowDialogs(){
  const box=$('tree-tips');if(!box)return;
  if(anyDialogOpen()){
    if(!box.hidden){tipsHeld=true;noticeQueue.release('tips');}
    return;
  }
  if(!tipsHeld)return;
  tipsHeld=false;
  // #845 2단계: 창이 닫히면서 자동으로 다시 뜰 때는 초점을 뺏지 않는다 — 초점은 창을 연 단추로 돌아간다.
  syncTreeTips(false);
}
function closeTreeTips(remember=true){
  const box=$('tree-tips');if(!box||box.hidden)return;
  box.hidden=true;if(remember)writeTipsSeen(localStorage);
  const back=tipsReturnFocus||$('tree-views')?.querySelector('button')||$('mobile-more');tipsReturnFocus=null;
  if(back&&document.contains(back)&&!back.hidden)back.focus();
}
// 이슈 666: 계정 메뉴와 첫 트리 안내는 한 번에 하나만 보인다. 안내(z-index 25)는 머리줄 상자
// (z-index 5) 안에 있는 메뉴 위로 떠 메뉴 항목을 가렸다. 메뉴가 열려 있으면 안내는 미뤄 두고,
// 메뉴가 닫히면 그때 띄운다. 미뤘다고 '봤음'으로 적지 않는다 — 닫은 뒤에도 다시 보여 준다.
function accountMenuOpen(){const pop=$('account-popover');return !!pop&&!pop.hidden;}
let tipsHeld=false;
function tipsFollowAccountMenu(){
  const box=$('tree-tips');
  if(accountMenuOpen()){
    if(box&&!box.hidden){tipsHeld=true;noticeQueue.release('tips');closeTreeTips(false);}
    return;
  }
  if(!tipsHeld)return;
  tipsHeld=false;
  // 메뉴가 닫히며 자동으로 다시 뜰 때도 초점은 계정 동그라미로 돌아간다(#845 2단계와 같은 규칙).
  syncTreeTips(false);
}
function showTreeTips(takeFocus=true){
  const box=$('tree-tips');if(!box||!box.hidden)return;
  if(accountMenuOpen()||anyDialogOpen()){tipsHeld=true;return;}
  // #845 2단계: 창이 닫히면 close 이벤트보다 먼저 주소 처리가 안내를 다시 띄우는 길이 있다.
  // 창·메뉴 때문에 숨었던 판이 다시 뜨는 때는 초점을 뺏지 않는다 — 초점은 창을 연 단추로 돌아간다.
  const resuming=tipsHeld;tipsHeld=false;
  const list=$('tree-tips-list');
  if(list&&!list.children.length)for(const tip of FIRST_TREE_TIPS){const li=document.createElement('li');const strong=document.createElement('strong');const span=document.createElement('span');strong.textContent=tip.title;span.textContent=tip.body;li.append(strong,span);list.append(li);}
  if(!tipsReturnFocus)tipsReturnFocus=document.activeElement;
  box.hidden=false;
  // 초점은 직접 열 때만 가져간다. 자동으로 뜬 판은 Tab으로만 들어간다 — 닫기 단추는 Tab 순서에 그대로 있다.
  if(takeFocus&&!resuming)$('tree-tips-close')?.focus();
}
function syncTreeTips(takeFocus=true){
  const momentCount=deps.model?.trees?.reduce((n,t)=>n+((t.moments||[]).length),0)||0;
  // 이슈 933: 새 트리 만들기(첫 여정) 화면에서는 안내 판을 띄우지 않는다 — 아직 트리를 만든 적이 없는데
  // '첫 트리를 만들었어요' 판이 미리보기 카드를 덮었다. 트리를 실제로 만든 뒤(다른 화면)에만 띄운다.
  const wanted=deps.current!=='first-journey.html'&&tipsWanted({owned:!!deps.member?.snapshot().owned,treeCount:deps.model?.trees?.length||0,momentCount,seen:readTipsSeen(localStorage),source:deps.source});
  if(wanted){
   if(accountMenuOpen()||anyDialogOpen())showTreeTips(takeFocus);
   else{
    // 메뉴·창 때문에 숨었던 안내가 다시 보일 때 줄 상태를 맞춘다(#666 순서 유지).
    if(noticeQueue.currentId()==='tips'&&$('tree-tips')?.hidden)noticeQueue.release('tips');
    noticeQueue.request('tips',{show:()=>{hideToast();showTreeTips(takeFocus);},hide:()=>{const box=$('tree-tips');if(box)box.hidden=true;}});
   }
  }else{noticeQueue.release('tips');closeTreeTips(false);}
}
// 창이 닫힐 때마다 안내를 다시 맞춘다 — 열려 있는 창이 없어지면 숨긴 안내를 다시 띄운다(#845).
document.addEventListener('close',()=>tipsFollowDialogs(),true);
// 계정 메뉴가 열리고 닫힐 때마다 안내와의 순서를 다시 맞춘다(메뉴를 여는 길이 여럿이라 상태 변화를 본다).
const accountPopoverBox=$('account-popover');
if(accountPopoverBox)new MutationObserver(()=>tipsFollowAccountMenu()).observe(accountPopoverBox,{attributes:true,attributeFilter:['hidden']});
$('tree-tips-close')?.addEventListener('click',()=>{closeTreeTips();noticeQueue.release('tips');});
// #571: 안내의 [이름 바꾸기]는 트리 관리 창을 바로 열고 이름 칸에 초점을 둔다(openTreeManager가 초점을 옮긴다).
// 창이 열려 있는 동안은 안내 판이 숨고(#845), 이름 창을 닫고 돌아오면 두 번째 안내와 알겠어요가 다시 보인다 —
// 이때 '봤음'으로 적지 않는다. 순간 추가 창이 열려 있는 동안에는 안내가 숨어 누르지 않는다(#845 결정).
$('tree-tips-rename')?.addEventListener('click',()=>shellPanels.openTreeManager());
return { anyDialogOpen, tipsFollowDialogs, closeTreeTips, accountMenuOpen, tipsFollowAccountMenu, showTreeTips, syncTreeTips };
}





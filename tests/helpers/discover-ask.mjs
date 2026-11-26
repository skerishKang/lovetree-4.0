// #1478: 첫 화면 둘러보기 소개 질문 창(#discover-ask)의 '지금은 안 할래요'(#discover-ask-no)를 창이 떠 있을 때만 누른다.
// 창이 없는데 locator.click()을 부르면 Playwright가 보이지 않는 단추를 기본 제한 30초 동안 기다린 뒤 실패한다
// (#1475 서재·날짜 시험이 이 헛대기로 20.4분 걸렸다). isVisible()은 기다리지 않는다.
// 질문 창은 쓰기 가능한 계정에서 순간이 3개 이상이고 아직 묻지 않은 트리가 있을 때만 뜬다
// (public/v41/shell/member-runtime.mjs·shell/discover-runtime.mjs). 창이 반드시 뜨는 흐름은 이 도우미를 쓰지 않고
// 지금처럼 단추가 보일 때까지 기다려 누른다 — 이 도우미는 창이 뜨지 않는 흐름에서만 쓴다.
export async function dismissDiscoverAskIfOpen(page) {
  const no = page.locator('#discover-ask-no');
  if (!(await no.isVisible().catch(() => false))) return false;
  await no.click().catch(() => {});
  return true;
}

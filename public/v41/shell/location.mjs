// 셸 주소 처리 (#231 1-B 후속).
// 2026-11-08 리팩터링: 동작·주소 형식 변경 0. shell.mjs에서 조건·조회 방식을 바꾸지 않고 그대로 옮겼다.
// 지금 화면·선택을 주소(#view, #tree/…, #share/…, #journey/NN)로 읽고 쓰는 일만 맡는다.
import {ownerSelectionRoute,accountPosition,rememberAccountPosition,resolveAccountPosition,parseSelectionRoute} from '../selection-location.mjs';
import {journeyRouteDecision} from '../first-journey.mjs';
import {screenForView,viewForFile} from './navigation.mjs';

export function createLocation(deps) {
  const {$} = deps;
  const getCurrent = deps.getCurrent;
  const setCurrent = deps.setCurrent;
  const getMember = deps.getMember;
  const getSource = deps.getSource;
  const getActiveShareId = deps.getActiveShareId;
  const setHandled = deps.setHandled;
  const show = deps.show;
  const choose = deps.choose;
  const notify = deps.notify;
  const startMember = deps.startMember;
  const showPublicRoute = deps.showPublicRoute;
  const requestNetworkOpen = deps.requestNetworkOpen;
  const requestBoardOpen = deps.requestBoardOpen;
  const journey = deps.journey;
  const gotoJourneyStep = deps.gotoJourneyStep;
  const openFirstJourney = deps.openFirstJourney;
  const finishJourney = deps.finishJourney;
  const leaveJourney = deps.leaveJourney;

  function ownerPosition() {
    const c = window.LT41;
    return c ? {treeId: c.tree.id, momentId: c.momentId, view: viewForFile(getCurrent())} : null;
  }

  function writeLocation(mode = 'push') {
    const position = ownerPosition();
    const owned = getSource() === 'server' && getMember()?.snapshot().owned && position;
    const shareId = getActiveShareId();
    // #1175: 공유 주소는 공유에서 보는 화면(책·보드·지도)에서만 남긴다. 첫 화면·서재 같은 다른 화면으로
    // 나가는 길이 share 주소(#share/<아이디>/home 같은 없는 경로)로 덮이면 그 주소로 다시 들어올 때마다
    // 공유 기록을 새로 읽어 '감상' 안내가 되풀이되고, 로그아웃 상태에서는 공유 상태에서 빠져나오지 못한다.
    const shareView = ['book', 'board', 'network'].includes(viewForFile(getCurrent()));
    const hash = getSource() === 'share' && shareId && shareView ? `#share/${shareId}/${viewForFile(getCurrent())}` : owned ? ownerSelectionRoute(position) : '#' + viewForFile(getCurrent());
    if (location.hash !== hash) history[mode === 'replace' ? 'replaceState' : 'pushState'](null, '', hash);
    setHandled(hash);
    if (owned) rememberAccountPosition(localStorage, getMember().snapshot().subject, position);
  }

  function applyBrowserLocation() {
    if (location.hash === deps.getHandled()) return;
    setHandled(location.hash);
    const journeyRoute = journeyRouteDecision({hash: location.hash, open: getCurrent() === 'first-journey.html', saved: journey.saved()});
    if (journeyRoute.action === 'goto') { gotoJourneyStep(journeyRoute.step); return; }
    if (journeyRoute.action === 'open') { openFirstJourney({step: journeyRoute.step, route: true}); return; }
    if (journeyRoute.action === 'finished') { finishJourney(); return; }
    if (journeyRoute.action === 'leave') { leaveJourney(); return; }
    // #1092: 둘러보기도 화면이다 — 주소(#explore·#explore/moments)로 돌아오면(뒤로·앞으로 가기) 둘러보기 화면을 연다.
    if (/^#explore/.test(location.hash)) { deps.communityScreen?.openRoute(); return; }
    const route = parseSelectionRoute(location.hash);
    if (route.scope === 'public') { showPublicRoute(route); return; }
    // #1175: 공유 화면을 본 뒤 남은 share 잔여를 치운다 — 뒤로 가기·주소로 비공유 화면(첫 화면 등)에
    // 돌아왔을 때 share 상태가 남으면 탭 줄이 숨고(서재 단추에 닿지 않음) 화면을 옮길 때마다
    // 공유 기록을 다시 읽어 '감상' 안내가 되풀이된다. 내 기록 주소(owner)는 기존 로그인 이어 주기 그대로 둔다.
    if (getSource() === 'share' && route.scope !== 'owner') { deps.leaveShare?.(screenForView(route.view)[1]); return; }
    setCurrent(screenForView(route.view)[1]);
    if (route.scope === 'owner') {
      if (getSource() !== 'server' || !getMember()?.snapshot().owned) { show(getCurrent(), false); void startMember(); return; }
      const saved = accountPosition(localStorage, getMember().snapshot().subject) || {}, resolved = resolveAccountPosition(deps.getModel()?.trees || [], route, saved);
      // #583 '이 순간 열기': 주소가 지도(network)의 특정 순간을 가리키고 그 순간을 실제로 찾았을 때만
      // 지도가 그 순간을 가운데 두고 열리게 한다(찾지 못했으면 시작 순간 안내만 — 가운데 뜸 없음).
      // choose()가 안에서 show()로 지도 프레임을 새로 띄우므로, 표시는 choose 전에 남긴다.
      if (route.view === 'network' && route.momentId && resolved.position.momentId === route.momentId) requestNetworkOpen(route.momentId);
      // #891: 보드 주소가 특정 순간을 가리키고 그 순간을 찾았을 때만 상세 판 자동 열림을 요청한다.
      if (route.view === 'board' && route.momentId && resolved.position.momentId === route.momentId) requestBoardOpen(route.momentId);
      choose(resolved.position.treeId, resolved.position.momentId);
      if (resolved.treeMissing || resolved.momentMissing) {
        writeLocation('replace');
        notify(resolved.treeMissing ? '이 주소의 기록을 현재 계정에서 찾을 수 없어 최근 위치를 열었어요.' : '이 주소의 순간을 찾을 수 없어 트리의 시작 순간을 열었어요.');
      } else rememberAccountPosition(localStorage, getMember().snapshot().subject, {...resolved.position, view: route.view});
      return;
    }
    show(getCurrent(), false);
  }

  addEventListener('popstate', applyBrowserLocation);
  addEventListener('hashchange', applyBrowserLocation);

  return {ownerPosition, writeLocation, applyBrowserLocation};
}

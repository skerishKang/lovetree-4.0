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
    const hash = getSource() === 'share' && shareId ? `#share/${shareId}/${viewForFile(getCurrent())}` : owned ? ownerSelectionRoute(position) : '#' + viewForFile(getCurrent());
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
    const route = parseSelectionRoute(location.hash);
    if (route.scope === 'public') { showPublicRoute(route); return; }
    setCurrent(screenForView(route.view)[1]);
    if (route.scope === 'owner') {
      if (getSource() !== 'server' || !getMember()?.snapshot().owned) { show(getCurrent(), false); void startMember(); return; }
      const saved = accountPosition(localStorage, getMember().snapshot().subject) || {}, resolved = resolveAccountPosition(deps.getModel()?.trees || [], route, saved);
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

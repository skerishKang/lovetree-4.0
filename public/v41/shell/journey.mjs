// 셸의 첫 여정 연결 (#231 1-B③-3).
// 2026-11-08 리팩터링: 동작·문구·주소 형식 변경 0. shell.mjs에서 조건·조회 방식·인자 형태를 바꾸지 않고 그대로 옮겼다.
// 여정 화면(iframe)과 셸 사이의 저장·이동·뒤로가기 기록을 이 파일 하나가 맡는다.
import {journeyEntry, journeySavePlan, journeyRouteHash, parseJourneyRoute} from '../first-journey.mjs';

export function createJourney(deps) {
  const {$} = deps;
  const getCurrent = deps.getCurrent;
  const setCurrent = deps.setCurrent;
  const getMember = deps.getMember;
  const getSource = deps.getSource;
  const notify = deps.notify;
  const panel = deps.panel;
  const show = deps.show;
  const screens = deps.screens;
  const choose = deps.choose;
  const writeLocation = deps.writeLocation;
  const openLoginStart = deps.openLoginStart;
  const flowNavigation = deps.flowNavigation;
  const setHandled = deps.setHandled;

  let journeyReturn = 'src064-orbit.html';
  let journeyStep = 0;
  let journeySaved = false;
  let journeyRouteOpened = false;

  // 2026-11-07 첫 트리 = 첫 여정(A안, 어두운 무대). 새 트리를 여는 모든 경로가 이 화면으로 오고,
  // 순간 추가·이 순간 수정은 기존 오른쪽 패널을 그대로 쓴다. 저장은 member.apply('new'/'add') 하나뿐이다.
  function journeyReply(message) {
    try { $('view').contentWindow?.postMessage(message, location.origin); } catch {}
  }

  // 2026-11-08 첫 여정 기록: 열 때와 단계를 옴길 때마다 #journey/00~04를 history에 남긴다.
  // 같은 단계로 다시 쓰지 않고, 뒤로가기는 이 기록만 보고 단계 복귀·종료를 정한다.
  function writeJourneyLocation(step, mode = 'push') {
    const hash = journeyRouteHash(step);
    if (location.hash !== hash) {
      const depth = Number(history.state?.lt41Journey) || 0;
      history[mode === 'replace' ? 'replaceState' : 'pushState'](mode === 'replace' ? history.state : {lt41Journey: depth + 1}, '', hash);
    }
    setHandled(hash);
  }

  function noteJourneyStep(step, {replace = false} = {}) {
    if (getCurrent() !== 'first-journey.html') return;
    journeyStep = parseJourneyRoute(journeyRouteHash(step))?.step || 0;
    writeJourneyLocation(journeyStep, replace ? 'replace' : 'push');
  }

  function gotoJourneyStep(step) {
    if (getCurrent() !== 'first-journey.html') { openFirstJourney({step, route: true}); return; }
    journeyStep = parseJourneyRoute(journeyRouteHash(step))?.step || 0;
    try { $('view').contentWindow?.postMessage({type: 'lt41-journey-goto', step: journeyStep}, location.origin); } catch {}
    setHandled(location.hash);
  }

  function leaveJourney({replaceHash = false} = {}) {
    if (getCurrent() !== 'first-journey.html') return;
    const target = screens.some(screen => screen[1] === journeyReturn) ? journeyReturn : 'src064-orbit.html';
    journeySaved = false; journeyRouteOpened = false;
    show(target, false);
    if (replaceHash) { history.replaceState(null, '', '#home'); setHandled('#home'); } else setHandled(location.hash);
  }

  // 저장을 마친 뒤(04 이후) 뒤로가기는 성장 단계로 다시 들어가지 않고 첫 화면으로 나간다.
  function finishJourney() {
    journeySaved = false; journeyRouteOpened = false;
    show('src064-orbit.html', false);
    history.replaceState(null, '', '#home');
    setHandled('#home');
  }

  function openFirstJourney({subject = '', step = null, route = false} = {}) {
    const gate = journeyEntry({owned: !!getMember()?.snapshot().owned, writable: !!getMember()?.snapshot().writable, mode: 'new'});
    const routed = route && Number.isFinite(step);
    if (gate.screen === 'login') {
      if (routed) { history.replaceState(null, '', '#home'); setHandled('#home'); }
      openLoginStart('new-tree'); return;
    }
    if (gate.screen === 'records') {
      if (routed) { history.replaceState(null, '', '#home'); setHandled('#home'); }
      notify('서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.');
      panel('records'); return;
    }
    if (screens.some(screen => screen[1] === getCurrent())) journeyReturn = getCurrent();
    if ($('community-panel').open) $('community-panel').close();
    const start = routed ? parseJourneyRoute(journeyRouteHash(step))?.step || 0 : 0;
    setCurrent('first-journey.html');
    journeySaved = false; journeyStep = start; journeyRouteOpened = routed;
    document.body.classList.remove('home-screen');
    $('empty').hidden = true;
    const frame = $('view');
    frame.hidden = false;
    frame.title = '러브트리 · 첫 여정';
    const query = new URLSearchParams();
    if (subject) query.set('subject', subject);
    if (routed) query.set('step', String(start));
    const suffix = query.toString();
    frame.contentWindow.location.replace(new URL('/v41/views/first-journey.html' + (suffix ? '?' + suffix : ''), location.origin).href);
    flowNavigation();
    writeJourneyLocation(start, routed ? 'replace' : 'push');
  }

  function saveFirstJourney(draft) {
    if (getSource() !== 'server' || !getMember()?.snapshot().owned) {
      journeyReply({type: 'lt41-journey-result', ok: false, message: '로그인한 뒤 내 기록에 저장할 수 있어요.'}); return;
    }
    if (!getMember().snapshot().writable) {
      journeyReply({type: 'lt41-journey-result', ok: false, message: '서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.'}); return;
    }
    let plan;
    try { plan = journeySavePlan(draft); } catch (error) { journeyReply({type: 'lt41-journey-result', ok: false, message: error.message}); return; }
    try {
      let treeId = plan.treeId, momentId = plan.momentId, firstMomentId = plan.momentId;
      if (plan.first) {
        const created = getMember().apply('new', plan.first, {});
        treeId = created.treeId; firstMomentId = created.momentId; momentId = created.momentId;
      }
      if (plan.second) {
        const added = getMember().apply('add', plan.second, {treeId, momentId});
        momentId = added.momentId;
      }
      journeyReply({type: 'lt41-journey-result', ok: true, treeId, firstMomentId, momentId, connected: !!plan.second});
    } catch (error) { journeyReply({type: 'lt41-journey-result', ok: false, message: error.message}); }
  }

  function openJourneyBook({treeId, firstMomentId} = {}) {
    if (!treeId || !getMember()?.state().trees.some(tree => tree.id === treeId && tree.moments.some(moment => moment.id === firstMomentId))) return;
    journeySaved = true;
    setCurrent('track59-sketchbook.html');
    choose(treeId, firstMomentId);
    show(getCurrent());
    writeLocation();
  }

  function closeFirstJourney() {
    if (getCurrent() !== 'first-journey.html') return;
    const depth = Number(history.state?.lt41Journey) || 0;
    if (!journeyRouteOpened && depth > 0) { journeyStep = 0; history.go(-depth); return; }
    leaveJourney({replaceHash: true});
  }

  return {
    noteJourneyStep,
    gotoJourneyStep,
    leaveJourney,
    finishJourney,
    openFirstJourney,
    saveFirstJourney,
    openJourneyBook,
    closeFirstJourney,
    saved: () => journeySaved
  };
}

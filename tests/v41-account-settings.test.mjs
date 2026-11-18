// #368 1차: 설정 창 5묶음 재구성 + 내 기록(records) 창 폐지의 소스 계약.
// markup은 index.html·shell.css에서, 배선·행선지는 shell.mjs·shell/에서 글자로 고정한다(레포 관례: v41-topmenu와 같은 방식).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const html = read('public/v41/index.html');
const css = read('public/v41/shell.css');
const shell = read('public/v41/shell.mjs');

const settingsStart = html.indexOf('<dialog id="account-settings"');
const settingsEnd = html.indexOf('</dialog>', settingsStart);
const settings = html.slice(settingsStart, settingsEnd);
const popover = html.slice(html.indexOf('id="account-popover"'), html.indexOf('</div></div><button id="mobile-more"'));

test('설정 창은 탭 넷(화면·프로필·기록 보기·계정·개인정보)을 이 순서로 가진다', () => {
  const order = [...html.matchAll(/id="settings-tab-(screen|profile|records|account)"/g)].map(m => m[1]);
  assert.deepEqual(order, ['screen', 'profile', 'records', 'account']);
  // 탭은 tablist 안의 role=tab이고, 같은 이름의 패널과 aria-controls로 이어진다.
  assert.match(html, /class="settings-tabs" role="tablist" aria-label="설정 묶음"/);
  for (const id of order) {
    assert.match(html, new RegExp(`id="settings-tab-${id}"[^>]*aria-controls="account-settings-${id}"`), id);
    assert.match(html, new RegExp(`id="account-settings-${id}"[^>]*aria-labelledby="settings-${id}-title"`), id);
  }
  // 기본은 화면 탭이다(나머지 패널은 hidden).
  assert.match(html, /id="settings-tab-screen"[^>]*aria-selected="true"/);
  for (const id of ['profile', 'records', 'account']) assert.match(html, new RegExp(`id="settings-tab-${id}"[^>]*aria-selected="false"[^>]*tabindex="-1"`), id);
  // 탭 배치·좁은 화면 가로 탭·정원 색은 CSS 계약으로 고정한다(--lt-* 토큰만).
  assert.match(css, /\.settings-layout\{display:grid;grid-template-columns:auto minmax\(0,1fr\)/);
  assert.match(css, /@media\(max-width:780px\)\{\.settings-layout\{grid-template-columns:minmax\(0,1fr\)\}\.settings-tabs\{flex-direction:row/);
  assert.match(css, /html\[data-lt-theme=garden\] \.settings-tabs \[role=tab\]\[aria-selected=true\]\{color:var\(--lt-ink\)/);
});

test('프로필 묶음: 동그라미 + 이메일 전체(없으면 내 계정), 편집 입구는 아직 없다', () => {
  const profile = settings.slice(settings.indexOf('id="account-settings-profile"'), settings.indexOf('id="account-settings-records"'));
  assert.match(profile, /id="settings-profile-initial"/);
  assert.match(profile, /id="settings-profile-name"/);
  assert.match(profile, /id="settings-profile-email"/);
  // #368 2차: 프로필 편집 폼 — 표시 이름(20자)·동그라미 색 8칸(기본+7색). 저장 위치는 계정.
  assert.match(profile, /id="profile-form"/);
  assert.match(profile, /id="profile-name" maxlength="20"/);
  const colorIds = [...profile.matchAll(/data-accent-color="([a-z]*)"/g)].map(m => m[1]);
  assert.deepEqual(colorIds, ['', 'rose', 'gold', 'green', 'blue', 'purple', 'orange', 'teal']);
  assert.match(profile, /id="profile-reset"[^>]*>되돌리기</);
  assert.match(profile, /계정에 저장/);
  // 동그라미 글자 규칙: 표시 이름 첫 글자 → 이메일 첫 글자 → 나(accountPresentation이 이미 1차에 채택).
  assert.match(shell, /function paintSettingsProfile\(email=shellHeader\.currentAccountEmail\(\)\)\{[\s\S]*?accountPresentation\(\{owned:!!member\?\.snapshot\(\)\.owned,email,name:prefs\.displayName\}\)/);
  // 저장은 setPrefs(계정 기록 경로) 재사용 — 새 API 없음. 저장 뒤 맨 위 동그라미와 설정 프로필을 다시 칠한다.
  assert.match(shell, /member\.apply\('setPrefs',patch\);/);
  assert.match(shell, /renderAccount\(\);\s*paintSettingsProfile\(\);\s*fillProfileForm\(\);/);
  // 쓰다 만 이름·색이 있으면 공통 틀이 한 번 묻는다(PANEL_DIRTY).
  assert.match(shell, /isSettingsDirty:\(\)=>profileDirty\(\),/);
  assert.match(shell, /function profileDirty\(\)\{if\(!\$\('account-settings'\)\.open\)return false;if\(!profileBaseline\)return false;return profileFormValue\(\)!==profileBaseline;\}/);
  // 공통 틀 등록: dialogs.mjs의 PANEL_DIRTY에 account-settings가 있어야 ×·바깥 클릭·Esc 모두 같은 확인을 지난다.
  const dialogs = read('public/v41/shell/dialogs.mjs');
  assert.match(dialogs, /PANEL_DIRTY\['account-settings'\]\s*=\s*\(\)\s*=>\s*deps\.isSettingsDirty\?\.\(\)\s*===\s*true;/);
});

test('화면 탭: 기본은 테마·움직임·처음 보여 줄 곳·첫 화면 카드, 나머지는 더 보기(고급) 접힘 안에', () => {
  const screen = settings.slice(settings.indexOf('id="account-settings-screen"'), settings.indexOf('id="account-settings-profile"'));
  const basic = screen.slice(0, screen.indexOf('account-settings-screen-more'));
  const more = screen.slice(screen.indexOf('account-settings-screen-more'));
  // 기본: 테마·움직임·처음 보여 줄 곳. '첫 화면 카드' 줄은 이번 정리에서 손대지 않았다(첫 화면에서 바로 고르는 단추로 옮기는 작업이 따로 있다).
  assert.match(basic, /data-set-theme="night"/);
  assert.match(basic, /id="settings-motion"/);
  assert.match(basic, /data-start-place="resume"/);
  assert.match(basic, /data-home-cards="example"/);
  // 더 보기: 보드·지도 판·관계 지도 기본 보기·페이지 넘김·날짜 표기·제목·고급 기능 보기.
  assert.match(more, /data-board-theme="paper"/);
  assert.match(more, /data-network-view="network"/);
  assert.match(more, /data-page-turn="paper"[^>]*>종이처럼</);
  assert.match(more, /data-page-turn="smooth"[^>]*>부드럽게</);
  assert.match(more, /data-date-style="dot"/);
  assert.match(more, /data-title-display="both"/);
  assert.match(more, /id="settings-advanced"/);
  assert.doesNotMatch(basic, /data-write-tab/, '먼저 보일 탭은 화면 탭에 없다');
  // 줄마다 붙던 '이 기기에만 / 계정에 저장' 꼬리말은 없다 — 화면 탭 맨 아래 한 줄로 모았다.
  assert.doesNotMatch(settings, /settings-scope">이 기기에만</);
  assert.doesNotMatch(settings, /settings-scope">계정에 저장</);
  assert.match(screen, /id="settings-screen-note" class="panel-note">테마·움직임·보드·지도 판·관계 지도 보기·페이지 넘김·첫 화면 카드·고급 기능 보기는 이 기기에만 저장되고/);
  // 먼저 보일 탭은 기록 보기 탭의 더 보기(고급) 안으로 간다.
  const records = settings.slice(settings.indexOf('id="account-settings-records"'), settings.indexOf('id="account-settings-account"'));
  assert.match(records, /id="settings-write-tab-label">먼저 보일 탭</);
  assert.match(records, /data-write-tab="easy"/);
  assert.match(records, /data-write-tab="detailed"/);
});

test('계정·개인정보 탭: 내 보관 파일·로그아웃·약관은 바로, 백업·새 소식·탈퇴는 더 보기(고급) 접힘 안에', () => {
  const account = settings.slice(settings.indexOf('id="account-settings-account"'), settingsEnd);
  const basic = account.slice(0, account.indexOf('id="account-settings-more"'));
  const more = account.slice(account.indexOf('id="account-settings-more"'));
  // 기본: 내 보관 파일 열기·로그아웃·처리방침·약관.
  assert.match(basic, /id="settings-assets-open"[^>]*>내 보관 파일 열기</);
  assert.match(basic, /id="logout" type="button" hidden>로그아웃</);
  assert.match(basic, /id="account-settings-policy"/);
  // 더 보기: 내 데이터(백업·불러오기·고급 접힘)·새 소식·계정 탈퇴.
  assert.match(more, /id="advanced-backup"[^>]*>기록 백업 \(내보내기\)</);
  assert.match(more, /id="server"[^>]*hidden>계정 기록 불러오기</);
  assert.match(more, /<summary>고급 · 가져오기·화면 비우기·예시<\/summary>/);
  assert.match(more, /id="advanced-import"/);
  assert.match(more, /id="clear"/);
  assert.match(more, /id="sample"/);
  assert.match(more, /id="settings-updates-open"[^>]*>새 소식 보기</);
  assert.match(more, /<summary>계정 탈퇴<\/summary>/);
  // 운영 묶음은 접힘 밖 맨 아래에 남는다(관리자에게만 보임 — 평소에는 hidden).
  assert.match(account, /id="account-settings-ops"[^>]*hidden/);
  // CTO 결정(2026-11-12): 설정의 "백업 파일 열기"는 기록 가져오기와 같은 JSON 선택 창이라 뺀다.
  assert.doesNotMatch(more, /id="settings-open-file"/);
  assert.doesNotMatch(settings, /백업 파일 열기/);
  // JSON input은 창 밖에 숨겨 둔다 — 설정이 닫혀 있어도(빈 화면) 열 수 있어야 한다.
  assert.ok(html.indexOf('id="file" type="file"') > settingsEnd, 'file input은 account-settings 밖에 있다');
});

test('계정 묶음: 로그아웃 + 맨 아래 접힌 탈퇴(확인 문구 흐름 그대로)', () => {
  const account = settings.slice(settings.indexOf('account-settings-account"'));
  assert.match(account, /id="logout"/);
  const del = account.slice(account.indexOf('account-settings-delete'));
  assert.match(del, /<summary>계정 탈퇴<\/summary>/);
  assert.match(del, /id="account-confirm-label"/);
  assert.match(del, /id="account-delete"[^>]*disabled>계정 탈퇴 실행</);
  assert.ok(account.indexOf('account-settings-delete') > account.indexOf('id="logout"'), '탈퇴는 묶음 맨 아래다');
});

test('내 기록 창(#records)은 없어지고 중복 트리 고르기도 함께 사라진다', () => {
  assert.equal(html.includes('id="records"'), false);
  assert.equal(html.includes('id="trees"'), false);
  assert.equal(html.includes('record-feedback'), false);
  assert.equal(html.includes('record-description'), false);
  // 트리 고르기는 트리 ▾ 드롭다운 한 곳이다.
  assert.match(html, /id="tree-popover"/);
  assert.doesNotMatch(shell, /\$\('trees'\)/);
});

test('계정 메뉴: 맨 위 이메일 → 설정 → 새 소식 → 내 의견 → 어떻게 쓰나요 → 내 보관 파일 → 운영센터 → 로그아웃(고급 기능 보기는 설정 화면 탭으로 옮겼다)', () => {
  assert.match(popover, /<strong id="account-email"><\/strong>/);
  const order = ['account-open-settings', 'account-updates', 'account-my-posts', 'account-guide', 'account-assets-open', 'account-ops-group', 'account-logout'];
  let at = popover.indexOf('account-head');
  for (const id of order) {
    const next = popover.indexOf(`id="${id}"`, at);
    assert.ok(next > at, `${id} 순서`);
    at = next;
  }
  // 2026-11-16 CTO 지적: 관리자 항목은 고객 메뉴와 섞지 않는다 — 구분선 아래 운영센터가
  // 로그아웃 바로 위에 있고, 고객 항목 사이에 있지 않다. 2026-11-17에 겹치던 '운영' 라벨 글자는 없앴다.
  const opsGroup = popover.slice(popover.indexOf('id="account-ops-group"'), popover.indexOf('id="account-logout"'));
  assert.match(opsGroup, /role="group" aria-label="운영"/);
  assert.match(opsGroup, /id="account-ops"[^>]*>운영센터</);
  assert.ok(popover.indexOf('id="account-ops-group"') > popover.indexOf('id="account-assets-open"'), '운영 묶음은 고객 항목 뒤다');
  // 2026-11-16 수리: 메뉴의 '의견 보내기' 칸을 없애고 내 의견 창 안에서 바로 보낸다.
  // 탈퇴 상태 줄과 메뉴 단추가 같은 id(account-feedback)를 써서 설정을 열 때마다 메뉴 글자가 지워졌다 — 두 id는 같을 수 없다.
  assert.doesNotMatch(html, /id="account-feedback"/);
  assert.match(html, /id="myposts-send"[^>]*>의견 보내기</);
  assert.match(shell, /\$\('myposts-send'\)\.onclick=\(\)=>\{shellDialogs\.requestClose\('myposts-panel'\);feedbackDialog\.open\(\);\};/);
  assert.match(shell, /\$\('account-delete-status'\)\.textContent='';/);
  // '어떻게 쓰나요'는 첫 화면의 안내 패널(#635)을 연다 — 셸 계정 메뉴에서 프레임 메시지로, home.js에서 같은 패널을 연다.
  const homeJs = read('v41/home.js');
  assert.match(shell, /\$\('account-guide'\)\.onclick=openGuideFromMenu;/);
  assert.match(shell, /\{type:'lt41-open-guide'\}/);
  assert.match(homeJs, /else if\(type==='lt41-open-guide'\)\{if\(!guideDialog\.open\)openGuide\(\);\}/);
  // 고급 기능 보기 스위치는 이제 설정 '화면' 탭에 있다(2026-11-16).
  assert.doesNotMatch(popover, /id="account-advanced"/);
  // 헷갈리는 옛 항목(내 계정 · 백업·내 기록)은 없다.
  assert.doesNotMatch(popover, /id="account-records"/);
  assert.doesNotMatch(popover, /id="account-backup"/);
  assert.doesNotMatch(popover, />내 계정</);
});

test('옮겨진 기능 연결: 보관 파일·백업 파일(빈 화면만)·예시·비우기·로그아웃·기록 불러오기', () => {
  assert.match(shell, /\$\('settings-assets-open'\)\.onclick=\(\)=>openAssets\(\$\('settings-assets-open'\)\)/);
  // CTO 결정(2026-11-12): 설정의 "백업 파일 열기" 배선은 빼고, 로그아웃 빈 화면 입구만 남긴다.
  assert.doesNotMatch(shell, /\$\('settings-open-file'\)/);
  assert.match(shell, /\$\('empty-file'\)\.onclick=\(\)=>\$\('file'\)\.click\(\)/);
  assert.match(shell, /\$\('sample'\)\.onclick=sample;/);
  assert.match(shell, /\$\('clear'\)\.onclick=/);
  assert.match(shell, /\$\('server'\)\.onclick=startMember;/);
  assert.match(shell, /\$\('logout'\)\.onclick=/);
});

// 고급 기능 보기 스위치(2026-11-16): 계정 메뉴에서 설정 '화면' 탭의 더 보기(고급)로 옮겼다. 저장 키·효과는 그대로다.
test('고급 기능 보기 스위치는 설정 화면 탭 더 보기(고급) 안에 있고, 저장 키(lt41.advanced.<subject>)는 그대로다', () => {
  assert.doesNotMatch(html, /id="account-advanced"/);
  const screenMore = settings.slice(settings.indexOf('id="account-settings-screen-more"'), settings.indexOf('id="settings-screen-note"'));
  assert.match(screenMore, /id="settings-advanced" aria-checked="false" aria-describedby="settings-advanced-desc">끔</);
  assert.match(screenMore, /id="settings-advanced-desc">보드에서 편집 도구·되돌리기·이어 그리기가 늘어나요/);
  assert.match(shell, /const sw=\$\('settings-advanced'\);if\(sw\)\{sw\.setAttribute\('aria-checked',String\(on\)\);sw\.textContent=on\?'켬':'끔';\}/);
  assert.match(shell, /\$\('settings-advanced'\)\.onclick=\(\)=>\{const next=!readAdvanced\(\);try\{localStorage\.setItem\(advancedKey\(\),next\?'1':'0'\)\}catch\{\}applyAdvanced\(\);\};/);
  assert.match(shell, /function advancedKey\(\)\{try\{return 'lt41\.advanced\.'\+\(member\?\.snapshot\(\)\.subject\|\|''\)\}catch\{return 'lt41\.advanced\.'\}\}/);
});

test('설정 입구는 로그인 상태에서만 열리고, 묶음 이름으로 열면 해당 묶음으로 초점을 옮긴다', () => {
  assert.match(shell, /if\(!member\?\.snapshot\(\)\.owned\)\{notify\('로그인한 뒤 설정을 열 수 있어요\.'\);return;\}/);
  // #453 C1: 기본은 맨 위에서 열고, 구역을 지정했을 때만 그 묶음으로 내려간다.
  assert.match(shell, /function focusSettingsSection\(section=''\)\{[\s\S]*?paintSettingsTab\('settings-tab-screen'\);return;[\s\S]*?scrollIntoView\(\{block:'start'\}\)[\s\S]*?heading\.focus\(\{preventScroll:true\}\)/);
  // 탭 넷과 키보드 이동, 행선지로 열 때 더 보기 접힘을 펼치는 것도 한 벌로 고정한다.
  assert.match(shell, /const SETTINGS_TABS=\[\['settings-tab-screen','account-settings-screen'\],\['settings-tab-profile','account-settings-profile'\],\['settings-tab-records','account-settings-records'\],\['settings-tab-account','account-settings-account'\]\]/);
  assert.match(shell, /function paintSettingsTab\(tabId\)\{for\(const\[t,p\]of SETTINGS_TABS\)\{const tab=\$\(t\),panel=\$\(p\);if\(!tab\|\|!panel\)continue;const on=t===tabId;tab\.setAttribute\('aria-selected',String\(on\)\);tab\.tabIndex=on\?0:-1;panel\.hidden=!on;\}\}/);
  assert.match(shell, /settingsTabList\.addEventListener\('keydown'/);
  assert.match(shell, /const foldFor=\{data:'account-settings-more',records:'account-settings-records-more',write:'account-settings-records-more',share:'account-settings-records-more',look:'account-settings-screen-more'\};/);
  assert.match(shell, /void openAccountSettings\(\{section:'data'\}\);/);
  assert.match(shell, /paintSettingsProfile\(\);\s*fillProfileForm\(\);\s*paintDateStyleControls\(\);paintStartPlaceControls\(\);paintNetworkViewControls\(\);paintShareControls\(\);paintQuickTargetControls\(\);\s*void paintSettingsUsage\(\);void loadTreeVisibility\(\);\s*panel\('account-settings'\);\s*focusSettingsSection\(section\);/);
});

test('옛 내 기록 입구는 설정 "내 데이터"(로그아웃이면 로그인)로 열린다', () => {
  // 빈 화면: 로그아웃→로그인, 읽기 전용→내 데이터, 평소→순간 추가.
  assert.match(shell, /\$\('empty-records'\)\.onclick=\(\)=>\{if\(!member\?\.snapshot\(\)\.owned\)\{openLoginStart\('first'\);return;\}member\.snapshot\(\)\.writable\?openEditor\(\):openAccountData\(\);\};/);
  // 모듈 행선지: 읽기 전용 안내는 openSettingsData로.
  assert.match(shell, /openSettingsData:intent=>openAccountData\(intent\)/);
  const panels = read('public/v41/shell/panels.mjs');
  const quick = read('public/v41/shell/quick-add.mjs');
  const journey = read('public/v41/shell/journey.mjs');
  const messages = read('public/v41/shell/messages.mjs');
  assert.match(panels, /openSettingsData\?\.\(\); return;/);
  assert.match(quick, /deps\.openSettingsData\?\.\(\); return false;/);
  assert.match(journey, /openSettingsData\?\.\(\); return;/);
  assert.match(messages, /openSettingsData\(\); \}/);
  assert.match(messages, /openSettingsData\('new-tree'\); return;/);
  // 게이트 순수 함수도 settings로 이름을 옮긴다.
  const firstJourney = read('public/v41/first-journey.mjs');
  assert.match(firstJourney, /\{screen: 'settings', reason: 'not-writable'\}/);
  // 옛 panel('records')은 어디에도 없다.
  for (const [name, source] of [['shell.mjs', shell], ['panels.mjs', panels], ['quick-add.mjs', quick], ['journey.mjs', journey], ['messages.mjs', messages]]) {
    assert.equal(source.includes("panel('records')"), false, `${name}: panel('records') 잔재`);
  }
});

test('빈 화면에는 로그아웃 상태에서도 백업 파일 열기와 예시 둘러보기가 남는다', () => {
  const empty = html.slice(html.indexOf('<div id="empty"'), html.indexOf('<dialog id="community-panel"'));
  assert.match(empty, /id="empty-sample"[^>]*>예시 둘러보기</);
  assert.match(empty, /id="empty-records"[^>]*>내 기록 불러오기</);
  assert.match(empty, /id="empty-file"[^>]*>백업 파일 열기</);
});

test('공지·로그인 만료 안내는 설정 상태 줄 한 벌을 쓴다', () => {
  const notice = read('public/v41/shell/notice.mjs');
  const auth = read('public/v41/shell/auth.mjs');
  // #453 C2: 설정이 닫혀 있을 때 온 안내가 창 안에 쌓이지 않는다(열려 있을 때만 그 줄에 쓴다).
  assert.match(notice, /if \(\$\('settings-feedback'\) && \$\('account-settings'\)\?\.open\) \$\('settings-feedback'\)\.textContent = text;/);
  // #666: 안내 줄을 띄우기 직전에 자리를 재는 길(beforeShow)이 붙어도 설정 창 안에 쓰는 규칙은 그대로다.
  assert.match(notice, /if \(\$\('account-settings'\)\?\.open\) \$\('toast'\)\.hidden = true;/);
  assert.doesNotMatch(auth, /record-feedback/);
});

// 개인정보 처리방침·이용약관 링크(2026-11-16): 설정 창 맨 아래에 같은 두 링크가 있다.
// 새 창(target=_blank, rel=noopener)으로 열고, 처리방침은 공용 로그인 처리방침의 러브트리 절(#lovetree)로 바로 간다.
test('계정·개인정보 탭에 처리방침·약관 링크가 있다(새 창, 러브트리 절, 누름 영역 44px — 기본 항목)', () => {
  const policy = settings.slice(settings.indexOf('id="account-settings-policy"'));
  assert.ok(policy.includes('id="account-settings-policy"'), '설정 창 안에 처리방침 묶음이 있다');
  assert.match(policy, /<a class="feedback-link policy-link" href="https:\/\/auth\.padiem\.net\/privacy#lovetree" target="_blank" rel="noopener">개인정보 처리방침<\/a>/);
  assert.match(policy, /<a class="feedback-link policy-link" href="https:\/\/auth\.padiem\.net\/terms" target="_blank" rel="noopener">이용약관<\/a>/);
  // 처리방침은 계정·개인정보 탭의 기본 항목이다 — 더 보기(고급) 접힘보다 앞에 있다.
  const account = settings.slice(settings.indexOf('id="account-settings-account"'));
  assert.ok(account.indexOf('id="account-settings-policy"') < account.indexOf('id="account-settings-more"'), '더 보기 접힘보다 앞(기본 항목)에 있다');
  // 누름 영역 44px.
  assert.match(css, /\.settings-policy \.policy-link\{min-height:44px/);
});

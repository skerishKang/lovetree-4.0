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

test('설정 창은 묶음 다섯 개(프로필·화면·순간 추가·내 데이터·계정)를 이 순서로 가진다', () => {
  const order = [...settings.matchAll(/id="account-settings-(profile|screen|write|data|account)"/g)].map(m => m[1]);
  assert.deepEqual(order, ['profile', 'screen', 'write', 'data', 'account']);
  // 각 묶음 제목은 초점을 받을 수 있어야 한다(입구가 묶음으로 초점을 옮긴다).
  for (const id of order) assert.match(settings, new RegExp(`id="account-settings-${id}"[^>]*aria-labelledby="settings-${id === 'write' ? 'write' : id}-title"`), id);
  assert.match(css, /\.settings-group\{padding:16px 0 0\}/);
});

test('프로필 묶음: 동그라미 + 이메일 전체(없으면 내 계정), 편집 입구는 아직 없다', () => {
  const profile = settings.slice(settings.indexOf('account-settings-profile'), settings.indexOf('account-settings-screen'));
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

test('화면 묶음은 기존 항목(테마·움직임·제목·첫 화면 카드)을 유지하고, 먼저 보일 탭은 순간 추가 묶음으로 간다', () => {
  const screen = settings.slice(settings.indexOf('account-settings-screen"'), settings.indexOf('account-settings-write"'));
  assert.match(screen, /data-set-theme="night"/);
  assert.match(screen, /id="settings-motion"/);
  assert.match(screen, /data-title-display="both"/);
  assert.match(screen, /data-home-cards="example"/);
  // #368 2차(댓글 2): 페이지 넘김 — 종이처럼(기본) / 부드럽게.
  assert.match(screen, /id="settings-page-turn-label">페이지 넘김</);
  assert.match(screen, /data-page-turn="paper"[^>]*>종이처럼</);
  assert.match(screen, /data-page-turn="smooth"[^>]*>부드럽게</);
  assert.doesNotMatch(screen, /data-write-tab/, '먼저 보일 탭은 화면 묶음에 없다');
  const write = settings.slice(settings.indexOf('account-settings-write"'), settings.indexOf('account-settings-data"'));
  assert.match(write, /id="settings-write-tab-label">먼저 보일 탭</);
  assert.match(write, /data-write-tab="easy"/);
  assert.match(write, /data-write-tab="detailed"/);
});

test('내 데이터 묶음: 백업·계정 기록 불러오기·내 보관 파일은 바로, 가져오기·화면 비우기·예시는 고급 접힘 안에', () => {
  const data = settings.slice(settings.indexOf('account-settings-data"'), settings.indexOf('account-settings-account"'));
  assert.match(data, /id="advanced-backup"[^>]*>기록 백업 \(내보내기\)</);
  assert.match(data, /id="server"[^>]*hidden>계정 기록 불러오기</);
  assert.match(data, /id="settings-assets-open"[^>]*>내 보관 파일 열기</);
  const advanced = data.slice(data.indexOf('account-settings-advanced'));
  assert.match(advanced, /<summary>고급 · 가져오기·화면 비우기·예시<\/summary>/);
  assert.match(advanced, /id="advanced-import"/);
  assert.match(advanced, /id="clear"/);
  assert.match(advanced, /id="sample"/);
  // CTO 결정(2026-11-12): 설정의 "백업 파일 열기"는 기록 가져오기와 같은 JSON 선택 창이라 뺀다.
  assert.doesNotMatch(advanced, /id="settings-open-file"/);
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

test('계정 메뉴: 맨 위 이메일 전체 → 설정 → 내 보관 파일 → 고급 기능 보기 → 로그아웃', () => {
  assert.match(popover, /<strong id="account-email"><\/strong>/);
  const order = ['account-open-settings', 'account-assets-open', 'account-advanced', 'account-logout'];
  let at = popover.indexOf('account-head');
  for (const id of order) {
    const next = popover.indexOf(`id="${id}"`, at);
    assert.ok(next > at, `${id} 순서`);
    at = next;
  }
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

test('설정 입구는 로그인 상태에서만 열리고, 묶음 이름으로 열면 해당 묶음으로 초점을 옮긴다', () => {
  assert.match(shell, /if\(!member\?\.snapshot\(\)\.owned\)\{notify\('로그인한 뒤 설정을 열 수 있어요\.'\);return;\}/);
  assert.match(shell, /function focusSettingsSection\(section='profile'\)\{[\s\S]*?scrollIntoView\(\{block:'start'\}\)[\s\S]*?heading\.focus\(\{preventScroll:true\}\)/);
  assert.match(shell, /void openAccountSettings\(\{section:'data'\}\);/);
  assert.match(shell, /paintSettingsProfile\(\);\s*fillProfileForm\(\);\s*paintDateStyleControls\(\);paintStartPlaceControls\(\);paintNetworkViewControls\(\);paintShareControls\(\);\s*void paintSettingsUsage\(\);\s*panel\('account-settings'\);\s*focusSettingsSection\(section\);/);
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
  assert.match(notice, /if \(\$\('settings-feedback'\)\) \$\('settings-feedback'\)\.textContent = text;/);
  assert.match(notice, /\$\('toast'\)\.hidden = !!\$\('account-settings'\)\?\.open;/);
  assert.doesNotMatch(auth, /record-feedback/);
});

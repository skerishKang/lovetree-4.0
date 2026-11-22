// 셸 진입점: 기능별 모듈을 연결하고 기존 순서로 초기화한다.
import {createExampleLoader} from "./shell/example-loader.mjs";
import {createLazyPanel} from "./shell/lazy-panel.mjs";
import {createNoticeRuntime} from "./shell/notice-runtime.mjs";
import {createViewPreferences} from "./shell/view-preferences.mjs";
import {createNavigationMenu} from "./shell/navigation-menu.mjs";
import {createSessionState} from "./shell/session-state.mjs";
import {createWritingRuntime} from "./shell/writing-runtime.mjs";
import {createNavigationRuntime} from "./shell/navigation-runtime.mjs";
import {createFrameSheet} from "./shell/frame-sheet.mjs";
import {createWorkspaceRuntime} from "./shell/workspace-runtime.mjs";
import {createDiscoverRuntime} from "./shell/discover-runtime.mjs";
import {createMemberRuntime} from "./shell/member-runtime.mjs";
import {createSettingsRuntime} from "./shell/settings-runtime.mjs";
import {createBootRuntime} from "./shell/boot-runtime.mjs";

const ctx=Object.create(null);
// 모든 함수와 공유 상태를 먼저 연결한다(기존 함수 선언 호이스팅과 같은 순서).
const modules=[
  createExampleLoader(ctx),
  createLazyPanel(ctx),
  createNoticeRuntime(ctx),
  createViewPreferences(ctx),
  createNavigationMenu(ctx),
  createSessionState(ctx),
  createWritingRuntime(ctx),
  createNavigationRuntime(ctx),
  createFrameSheet(ctx),
  createWorkspaceRuntime(ctx),
  createDiscoverRuntime(ctx),
  createMemberRuntime(ctx),
  createSettingsRuntime(ctx),
  createBootRuntime(ctx)
];
// 실제 DOM 및 세션 초기화는 기존 문서 실행 순서 그대로 진행한다.
for(const module of modules)module.mount();

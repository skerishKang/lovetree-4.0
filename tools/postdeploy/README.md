# lovetree-postdeploy (저장소 사본)

러브트리 4.1 배포 직후 읽기 위주로 확인하는 도구입니다. 기본은 읽기 전용이며
비밀번호를 저장하지 않습니다. 브라우저는 설치된 Chrome 채널을 사용합니다.

## 준비

```powershell
cd <저장소 루트>
npm install --prefix tools/postdeploy
```

`playwright-core`는 루트가 아니라 `tools/postdeploy/package.json`에만 선언되어
있습니다. 루트 `npm ci`는 이 도구의 의존성을 설치하지 않으므로, 도구를 실행하는
컴퓨터에서 위 명령을 한 번 실행합니다. Chrome이 설치되어 있어야 합니다.

## 실행 경로

| 항목 | 인자 | 환경변수 | 기본값 |
| --- | --- | --- | --- |
| 비밀 파일 | `--secrets <path>` | `LOVETREE_SECRETS` | `%USERPROFILE%\.secrets\.env` |
| 로그인 프로필 | `--profile <dir>` | `LOVETREE_POSTDEPLOY_PROFILE` | `tools/postdeploy/.profile` |
| 출력 | `--out <dir>` | `LOVETREE_POSTDEPLOY_OUT` | `tools/postdeploy/out` |

`.profile/`, `out/`, `package-lock.json`, `node_modules/`는 저장소에 커밋하지
않습니다. 비밀값·쿠키·리포트·스크린샷도 커밋하지 않습니다.

## 로그아웃 상태 읽기 검사

빈 임시 프로필을 지정하면 로그인하지 않고 공개 화면만 검사합니다.

```powershell
node tools/postdeploy/postdeploy.mjs https://lovetree-4-0.pages.dev/v41/ --profile <빈 임시 폴더>
```

기대 결과: `fail=0` (경고·건너뜀은 허용), 종료 코드 0. `--strict`를 주면 경고도
실패로 계산합니다. 실패가 있으면 종료 코드 2입니다.

### 프레임 다시 뜨기 검사 (#477, `--frame-reload`)

2026-11-12 본 주소 사고: 첫 화면이 5초 동안 30회 가까이 다시 떠서 카드가 자리를 못 잡았습니다
(셸이 프레임이 뜰 때마다 보내는 `lt41-date-style`을 첫 화면이 받을 때마다 `location.reload()`).
그 고장을 배포 직후에 잡는 검사입니다. **계정이 필요 없습니다**(로그아웃으로 돕니다).

```powershell
node tools/postdeploy/postdeploy.mjs https://<미리보기>.pages.dev/v41/ --frame-reload
```

- 화면마다(첫 화면·책·보드·지도·책장) 연 뒤 **5초 동안 안쪽 프레임(`#view`·`#view-next`)이 다시 뜬 횟수**를 셉니다.
  검사 이름은 `stability/frame-reload-<화면>`(`home`·`book`·`board`·`map`·`shelf`)이고 **2회를 넘으면 fail**입니다.
- 첫 화면은 5초 뒤 카드까지 봅니다: transform이 빈 카드 **0장**, 가운데 안전 구역(`.center` + 32px) 침범 **0장**.
- `about:blank`로 이전 장을 비우는 순간(screens.mjs의 화면 교대)은 '다시 뜬 것'으로 세지 않습니다.
- 기본 실행(읽기 검사)에서도 아직 로그아웃일 때 함께 돕니다. 로그인 세션이면 `skip`으로 남깁니다.

**세기 증명(2026-11-12)**: 수리 전 빌드(**4055286**, `4055286` 커밋 = #476 이전)에서는 첫 화면이
5초 동안 **14~17회** 다시 떠서 fail(사고 눈금 초당 약 6회 = 5초에 약 30회), 수리 뒤 지금 main
(**0693a8e** 이후)에서는 **0~1회**로 pass, 가운데 안전 구역 침범 0장입니다.

### 미리보기 503 구분 (#496) — 기다렸다 채점, 환경/제품 나누기

미리보기 배포는 **정적 자산이 먼저 끝나고 /api/* Functions는 잠시 뒤 붙습니다**(#337 실측).
배포 직후 채점에 들어가면 "아직 안 뜬 503"과 실제 결함이 똑같은 빨강으로 보입니다(#493 e102493·9a1488a).

**기다리기** — `preview-url.mjs`가 주소를 찾은 뒤 `/api/account`를 60초까지 3초 간격으로 봅니다.

| 응답 | 판정 | 왜 |
| --- | --- | --- |
| 200·401·403 | `ready` — 채점해도 된다 | Functions가 응답한다 |
| 404 | 아직 안 뜸 | Functions 라우트가 아직 안 붙었다(#337 실측) |
| 502·503·504 | 아직 안 뜸 | 엣지/게이트웨이가 뒷단을 못 찾는다 |
| 그 외 | `ready` | 정상 응답 |

기한 안에 404·503만 봤으면 `readiness=cold`로 다음 단계에 넘기고, 요약에 한 줄을 남깁니다.
**(이전 동작: 503을 준비 완료로 읽어 채점에 들어갔습니다 — 그게 #493 실패의 직접 원인.)**

**구분** — 판정 단계(`preview-gate.mjs`)가 결과를 두 갈래로 나눕니다(종료 코드도 구분).

| 갈래 | 때 | 종료 코드 |
| --- | --- | --- |
| 제품 결함(product) | 남은 실패가 있으면서 제품 신호(페이지 오류 또는 미리보기 503이 **아닌** 콘솔 오류)가 있다 | 2 |
| 환경 문제(environment) | `readiness=cold`이고 제품 신호가 하나도 없다(남은 실패는 다 503) | 3 |
| 통과 | 제품 결함 0 | 0 |

**미리보기에는 서버가 없어 API 503이 정상인 경로** — 허용 목록 안에서만 예외로 넘깁니다(진짜 회귀를 표시에 묻지 않으려고):

- `youtube/youtube-oembed` · `youtube/youtube-caption` — oEmbed API 응답을 그대로 확인
- `community/community-cards` — 공유 목록 API(`/api/community/shares`)
- `console/console-errors` — 콘솔 오류가 **모두** 미리보기 503일 때만(하나라도 다른 오류면 제품 결함)

**화면 검사(visual/·screen-settings)는 503과 무관하므로 예외 대상이 아닙니다.** 503 창에 모듈이 안 떠서
화면이 그려지지 않았다면(정의에 따르면 visual 실패) 두 갈래 법칙이 가립니다: 준비가 cold이면 환경 문제로,
콘솔에 비-503 오류(모듈 MIME 실패 등)가 잡히면 제품 결함으로.

`cold`로 나왔으면 그 실행은 **환경 준비 안 됨**이지 빨강이 아닙니다 — 배포가 다 뜬 뒤 다시 실행합니다.

### 로컬에서 미리보기처럼 돌리기 (배포 전 확인)

```powershell
npx vite build
node tools/postdeploy/serve-dist.mjs dist 4173   # 서버만 띄운다(브라우저·프로필 없음)
node tools/postdeploy/postdeploy.mjs http://127.0.0.1:4173/v41/ --frame-reload
```

정적 서버는 API를 맡지 않으므로 로그아웃 상태로 돕니다. 끝낼 때는 출력된 PID만 종료합니다.

## 로그인 실행

수동 로그인은 열린 Chrome 창에서 직접 로그인한 뒤 터미널에서 Enter를 누릅니다.

```powershell
node tools/postdeploy/postdeploy.mjs https://lovetree-4-0.pages.dev/v41/ --login
```

자동 로그인은 `--secrets` 파일에서 **그 계정의** `PADIEM_TUTORIAL<NN>_EMAIL`·`_PASSWORD`를 실행 중에만 읽습니다.

### 레인별 전용 시험 계정 (#300)

시험 계정은 **레인마다 하나**입니다. 두 레인이 같은 계정을 동시에 쓰면 (1) 한쪽 정리가 다른 쪽 트리를 지우고, (2) 로그아웃 검사가 상대 세션을 끊고, (3) 트리 개수에 따라 화면이 달라져 결과가 오염됩니다. 그래서 계정을 나눠 쓰고, **동시에 돌려도 됩니다**(브라우저 프로필도 계정별로 분리).

| 레인 | 계정 | 실행 |
| --- | --- | --- |
| 로컬1 | **02** | `--account 02` |
| 로컬2 | **04** | `--account 04` |
| 로컬3 | **01**(기존) | `--account 01` |

```powershell
# 자기 계정만 사용한다. 계정 선택: --account 인자 > LT_ACCOUNT 환경변수 > 둘 다 없으면
# 계정을 쓰는 실행(--auto-login·--auth-flows)은 시작 전에 멈춘다(#344, 기본값 01로 조용히 진행하지 않는다).
node tools/postdeploy/postdeploy.mjs https://lovetree-4-0.pages.dev/v41/ --account 02 --auto-login
```

- `.secrets` 키: `PADIEM_TUTORIAL02_EMAIL`, `PADIEM_TUTORIAL02_PASSWORD` (04도 같은 규칙).
- 계정 값이 없으면 로그인을 건너뛰고 **warn**으로 남깁니다(실패 아님). 이메일·비밀번호 값은 화면·로그·리포트에 쓰지 않습니다.
- 프로필 기본 폴더: `01` → `tools/postdeploy/.profile`, `02`·`04` → `.profile-02`·`.profile-04`. (03은 2026-11-09 삭제 — 프로필 노출 건, 재사용 금지)
- 작업을 마치면 **자기 계정으로** 트리 0개·보관 파일 0개 정리까지 확인합니다.

```powershell
node tools/postdeploy/postdeploy.mjs https://lovetree-4-0.pages.dev/v41/ --auto-login --account 02 --secrets C:\Users\<user>\.secrets\.env
```

이후 같은 `--profile`로 `--login`/`--auto-login` 없이 읽기 검사를 반복합니다.

## 컴1 예시

```powershell
cd E:\lt-postdeploy-repo-261108
node tools\postdeploy\postdeploy.mjs https://lovetree-4-0.pages.dev/v41/ --profile E:\temp\pd-empty
node tools\postdeploy\postdeploy.mjs https://lovetree-4-0.pages.dev/v41/ --auto-login --secrets C:\Users\limone\.secrets\.env
```

## 컴2 예시

```powershell
cd C:\padiem\lovetree-4.0
node tools\postdeploy\postdeploy.mjs https://lovetree-4-0.pages.dev/v41/ --profile C:\temp\pd-empty
node tools\postdeploy\postdeploy.mjs https://lovetree-4-0.pages.dev/v41/ --auto-login --secrets C:\Users\<com2user>\.secrets\.env
```

출력은 각 저장소의 `tools/postdeploy/out`에 저장됩니다. 기대 결과는 로그인·로그아웃
모두 `fail=0`이며, 실패가 있으면 종료 코드 2로 멈춥니다.

## 로그인 흐름 전체 검사 (--auth-flows)

이 모드는 전용 시험 계정의 트리·순간을 만들고 마지막에 계정의 트리를 삭제합니다.
다른 작업과 시험 계정을 공유하거나 동시에 실행하지 마세요. 빈 계정에서 시작하며,
실패한 실행도 `flow-cleanup`과 `flow-cleanup-assets` 결과를 확인해야 합니다.

```powershell
node tools/postdeploy/postdeploy.mjs https://lovetree-4-0.pages.dev/v41/ --auth-flows --strict --secrets "$env:USERPROFILE\.secrets\.env" --out tools/postdeploy/out/auth-run1
# 첫 실행과 정리가 끝난 뒤 같은 명령을 auth-run2 출력 폴더로 다시 실행
```

- A2(빈 계정) → A1(로그인 복귀·intent 제거·첫 여정) → A2(별도 context에서 트리 준비 뒤 새 context의 책장 로그인 복귀) → A3(정원 테마) → H1(로그아웃) → H2(미저장 보호 진단·만료 복원)를 새 context에서 순차 검사합니다.
- H2는 탭 A 편집기 열기 → 탭 B 로그아웃 → 탭 A 입력·저장 순서입니다. 만료 안내·입력·임시 키를 확인한 뒤 화면의 **새 창에서 로그인**을 사용합니다. 로그인 셸의 `member=in`을 기다리고 원래 탭을 새로고침하여 복원 안내의 **다시 시도**를 누릅니다. 성공 PUT, 서버 재조회로 시험 순간 존재, 임시 키 삭제까지 확인합니다.
- 확인창은 기본 취소합니다. 예외는 정리 단계의 삭제 confirm과, H2에서 임시 키를 확인한 뒤 원래 탭을 새로고침할 때의 beforeunload뿐입니다.
- 정리는 첫 트리 안내를 닫고 책 정보를 연 뒤, `#tree-manager[open]`과 클릭 가능한 `#tree-delete`를 합계 최대 8초 기다립니다. 삭제 PUT 성공 뒤 `/api/workspace`의 트리 0개를 확인합니다. DOM의 0개 표시만으로 통과하지 않습니다.
- 삭제 실패 순간의 screenshot과 dialog 열림·가시성, 삭제 버튼 가시성·활성 상태를 JSON에 기록합니다. 끝에는 트리 화면과 열린 보관 파일 목록의 명시적인 빈 상태를 캡처합니다.
- 각 flow의 `notFound`에는 404 주소(origin/path), resource type, 호출 위치를 남깁니다. 인증 쿼리·요청 헤더·비밀번호·쿠키 값은 기록하지 않습니다. 실제 누락 파일은 검사 도구가 수정하거나 무시하지 않습니다.
- 모든 결과와 화면은 `--out` 아래에만 저장하며 커밋하지 않습니다. `--strict` 실행은 경고도 실패로 처리합니다.

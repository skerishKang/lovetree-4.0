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

## 로그인 실행

수동 로그인은 열린 Chrome 창에서 직접 로그인한 뒤 터미널에서 Enter를 누릅니다.

```powershell
node tools/postdeploy/postdeploy.mjs https://lovetree-4-0.pages.dev/v41/ --login
```

자동 로그인은 `--secrets` 파일의 `PADIEM_TUTORIAL01_PASSWORD`를 실행 중에만 읽습니다.

```powershell
node tools/postdeploy/postdeploy.mjs https://lovetree-4-0.pages.dev/v41/ --auto-login --secrets C:\Users\<user>\.secrets\.env
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

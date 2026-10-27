# COM1 · CGI에서 다른 AI 모델로 작업하기

이 저장소는 특정 AI 도구에 종속되지 않는다. 모델이 로컬 파일과 Git을 사용할 수 있으면 작업할 수 있다. 도구별 GitHub 인증은 해당 PC에 연결된 계정을 사용하며 토큰을 파일에 적지 않는다.

## 기준 폴더

| 장비 | 기준 사본 | 모델 작업 폴더의 권장 상위 경로 |
| --- | --- | --- |
| COM1 / Padiem-Command-Center | `G:\Ddrive\BatangD\task\workdiary\lovetree-4.0` | `D:\lovetree-4.0-worktrees` |
| CGI / CGI-1 | `C:\cgi-work\lovetree-4.0` | `C:\cgi-work\lovetree-4.0-worktrees` |

Owner가 정한 G드라이브 기준 폴더는 유지한다. 여러 모델의 편집 충돌을 줄이도록 실제 모델 작업은 장비별 로컬 worktree에서 수행한다. 확인된 COM1의 G드라이브는 NTFS 외장 디스크다. `node_modules`와 빌드 산출물은 Git에 포함하지 않는다.

## 새 작업 시작

COM1 PowerShell 예:

```powershell
cd 'G:\Ddrive\BatangD\task\workdiary\lovetree-4.0'
pwsh -File scripts/start-task.ps1 -Device com1 -Task improve-first-moment -WorktreeRoot 'D:\lovetree-4.0-worktrees'
```

CGI PowerShell 예:

```powershell
cd 'C:\cgi-work\lovetree-4.0'
pwsh -File scripts/start-task.ps1 -Device cgi -Task review-tree-editor -WorktreeRoot 'C:\cgi-work\lovetree-4.0-worktrees'
```

PowerShell 7의 `pwsh`가 없으면 `powershell -ExecutionPolicy Bypass -File ...`로 **이 스크립트 한 번만** 실행할 수 있다. 시스템 실행 정책은 변경하지 않는다.

스크립트는 최신 `origin/main`에서 고유 브랜치와 worktree를 만들고 경로를 출력한다. 브랜치 예시는 `ai/com1-improve-first-moment-날짜-고유값`이다. Windows 예약 이름인 `com1`을 단독 폴더 이름으로 쓰지 않는다. 만들어진 폴더를 AI 도구/에디터에서 연 뒤 실행한다.

```sh
npm ci
npm run dev
```

같은 PC에서 서버를 둘 이상 실행하려면 `npm run dev -- --port 5174`처럼 서로 다른 포트를 지정한다. 각 주소는 별도 브라우저 저장소다. 데이터는 내 트리의 JSON 내보내기/가져오기로 옮긴다.

## 모델에 전달할 시작 지시

> 이 폴더의 AGENTS.md, README.md, docs/PRODUCT.md, docs/HANDOFF.md를 읽고 현재 브랜치와 변경사항부터 확인하세요. 이번 작업 범위만 구현하고 npm test / npm run build로 검증하세요. 맡은 브랜치에 commit/push하고 변경 내용, SHA, 검증 결과, 남은 사항을 보고하세요. 다른 모델의 작업과 기존 서비스는 변경하지 마세요.

작업 지시에는 구체적인 목표와 담당 범위를 한 줄 추가한다. 한 모델은 `src/styles.css`, 다른 모델은 저장소 어댑터처럼 담당을 나누는 편이 좋다. 같은 파일을 다뤄야 하면 먼저 완료된 변경을 합친 뒤 다음 모델이 최신 `main`에서 시작한다.

## 마무리

```sh
npm run check
git status --short
git add <이번에-변경한-경로>
git commit -m "feat: describe the change"
git push -u origin HEAD
```

GitHub PR로 변경을 비교할 수 있다. 코멘트/리뷰 요청 전송은 Owner 지시가 있을 때 수행한다. 기준 폴더 업데이트는 변경사항이 없을 때 `git pull --ff-only`로 한다. 기준 폴더가 수정 중이면 덮어쓰지 말고 작업 브랜치로 보존한다.

## 개발과 서비스의 차이

현재 `npm run dev`는 개발용이다. 인터넷에 공개하는 서버로 사용하지 않는다. 정적 결과물은 Cloudflare Pages `lovetree-4-0`(https://lovetree-4-0.pages.dev/)이 GitHub 저장소에 연결되어 `main` push 때 자동 배포된다. 프로덕션 분기는 `main`이며, Pages 프로젝트 이름에는 점을 쓸 수 없어 `lovetree-4.0.pages.dev` 주소는 만들 수 없다. 인증·서버 저장·DB는 아직 없고 별도 단계다. COM2의 PADIEM 서버를 이 프로젝트 실행에 사용하거나 설정을 변경하지 않는다.

## 초기 연결 확인 — 2026-10-27 KST

두 PC에서 소스 커밋 `8e787e2`의 테스트 13개와 빌드가 통과했다. 두 PC 모두 GitHub push 권한을 `git push --dry-run`으로 확인했으며, 실제 테스트 브랜치를 원격에 만들지는 않았다. CGI의 커밋 작성자 설정은 이 저장소에만 GitHub 계정 이름과 noreply 주소로 설정했다.

처음 만들어 둔 AI 작업 폴더:

- COM1: `D:\lovetree-4.0-worktrees\com1-first-review-20261027-003944-ec6bd3`
- CGI: `C:\cgi-work\lovetree-4.0-worktrees\cgi-first-review-20261027-003548-dbfbef`

위 두 폴더에는 의존성이 설치되어 있다. 해당 폴더에서 `npm run dev -- --host 127.0.0.1`을 실행하고 `http://127.0.0.1:5173/`을 연다. 초기 검증 때 두 PC에서 HTTP 200을 확인했다. 실행 프로세스는 재부팅 후 유지되지 않으므로 포트와 실행 상태를 먼저 확인한다. 새 작업은 앞의 스크립트로 새 worktree를 만들거나 Owner가 지정한 기존 작업 폴더를 사용한다. 현재 목록은 기준 폴더에서 `git worktree list`로 확인한다.

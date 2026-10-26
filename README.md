# LoveTree 4.0

좋아하는 순간을 남기고, 그 마음이 이어지는 길을 다시 보고 감상하는 팬 기록 서비스.

LoveBud 2.0과 lovetree-limone 3.0의 자료를 참고한 새 프로젝트다. UI는 아직 확정하지 않았으며 현재 화면은 수정 가능한 첫 작동 시안이다. 공부·업무·범용 생각트리는 별도 서비스 범위다.

## 지금 실행하기

Node.js 22.13 이상. Windows PowerShell, macOS, Linux에서 같은 명령을 사용한다.

```sh
npm ci
npm run dev
```

터미널에 표시된 주소를 연다. 기본 주소는 `http://localhost:5173`이다. 브라우저 기록은 origin에 묶이므로 계속 같은 주소·포트를 사용한다. 포트가 이미 사용 중이면 이전 서버를 확인하고 임의로 다른 서버를 중복 실행하지 않는다.

```sh
npm test
npm run build
npm run preview
```

`preview`는 빌드 결과를 확인하는 별도 주소이며 개발 주소의 브라우저 저장 기록과 다를 수 있다.

## 구현한 범위

- 따뜻한 종이·순간 카드 표현의 시작 화면, 가상 예시 트리 3개
- 첫 순간 생성, 감정·메모·날짜·원본 링크 기록
- 이전 순간을 선택해 연결, 순간 수정·삭제, 내 트리 검색·삭제
- 연결 트리/시간순 보기, 확대·축소
- 브라우저 저장·다시 열기, JSON 백업·가져오기, 손상 데이터 복구용 사본
- 입력/링크/연결 구조 검증, 다른 탭의 최신 저장을 덮어쓰지 않는 보호
- 모바일 화면, 키보드 조작, 모달 포커스, 모션 감소 설정

**현재 데이터는 각 브라우저 localStorage에만 저장된다.** COM1·CGI의 소스 동기화와 사용자 기록 동기화는 별개다. 데이터는 JSON으로 옮길 수 있다. 파일에는 개인 메모와 링크가 포함되므로 공개 GitHub에 커밋하지 않는다.

계정 로그인, 서버 DB, 사진 업로드, 다른 사용자의 공개 트리 탐색·공유는 아직 구현하지 않았다. 예시는 가상 자료이며 공개 사용자 데이터가 아니다. 예시의 연출 이미지는 이 프로젝트에서 제작한 SVG이다.

## 다음 모델이 읽을 것

1. `AGENTS.md` — 작업 규칙
2. `docs/PRODUCT.md` — 제품 방향과 첫 사용 흐름
3. `docs/HANDOFF.md` — 현재 상태·검증·다음 작업
4. `docs/DEVELOPMENT.md` — COM1/CGI에서 모델별 작업 시작
5. `reference/SOURCES.md` — 참고 원본과 적용 범위

## 코드 지도

| 경로 | 역할 |
| --- | --- |
| `src/main.js` | 화면·입력·내비게이션 |
| `src/styles.css` | 수정 가능한 첫 시안의 시각 스타일 |
| `src/domain.js` | 트리·순간·연결과 가져오기 검증 |
| `src/storage.js` | 브라우저 저장 어댑터 |
| `src/examples.js` | 서비스 가치 설명용 가상 예시 |
| `public/art` | 자체 제작한 예시용 SVG |
| `tests` | 저장·연결·복구 등 실제 데이터 위험 검증 |
| `scripts` | Windows 모델별 Git 작업 폴더 생성 |
| `reference/originals` | 이전 버전 원본 참고본. 제품 빌드에 포함하지 않음 |

Vite + 표준 JavaScript ES modules로 시작한다. 데이터 규칙과 저장소를 UI에서 분리했으므로 향후 Worker/D1 어댑터로 교체할 수 있다. React 전면 이식이나 대규모 공통 플랫폼 구축은 현재 범위에 포함하지 않는다.

## 저장소와 장비

- 기준 저장소: https://github.com/skerishKang/lovetree-4.0
- COM1 기준 사본: `G:\Ddrive\BatangD\task\workdiary\lovetree-4.0`
- CGI 기준 사본: `C:\cgi-work\lovetree-4.0`
- COM2: 기존 PADIEM 서버 운영. 이 초기 작업에서는 변경하지 않음.

`main`은 공통 출발점이다. 모델별 작업은 별도 브랜치와 worktree에서 시작한다. 기존 프로젝트 정책 문서는 4.0에 자동 승계하지 않으며 최신 Owner 지시가 우선한다.

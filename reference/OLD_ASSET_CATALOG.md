# OLD 화면 자산 카탈로그 (LoveTree 4.0)

이슈: #8 (상위 #1) · 조사: 2026-10-27 KST · COM1
조사 대상: `G:\Ddrive\BatangD\task\workdiary\lovetree-limone\old\reference`
경로 기준: 이 문서의 `reference/...` 경로는 **모두 `G:\Ddrive\BatangD\task\workdiary\lovetree-limone\old` 기준**이다. 즉 `reference/source-track-…`는 실제로 `old/reference/source-track-…`를 뜻한다. 7절 표도 같은 기준을 쓴다(`old/reference` 기준이라는 별도 표기를 쓰지 않는다).
조사 방법: 파일 해시·구조·이벤트 처리 코드를 읽는 **소스 확인**. 아래 모든 항목은 **브라우저에서 실행해 확인하지 않았다(소스 확인만)**.

`★_최종`, `현재후보`, `PASS` 같은 폴더·파일 이름은 원본 작성자의 표시이며, 이 문서는 그것을 채택 근거로 쓰지 않는다. 채택 여부는 Owner/UI 담당이 정한다. 이번 조사는 **64번 첫 화면을 대체하는 새 랜딩을 선정하지 않았다**(요청 범위 밖).

base64 미디어 본문, 전체 HTML, 개인정보·비밀값은 이 문서에 옮기지 않았다. 미디어는 **개수만** 기록한다.

---

## 1. 추천 후보 비교표

권장 표기: **재사용**(구조·상호작용을 가져온다) / **보완**(일부만 가져오고 4.0 규칙으로 다시 만든다) / **보류**(지금 쓰지 않고 근거만 남긴다).

| 자산 | 4.0에서의 용도 | 권장 | 핵심 근거 | 데이터 위치 | 모바일 | 키보드 | 동일 사본 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **58** 리빙메모리 핀보드 | 순간 보드(배치형) 보기 | 보완 | 핀 이동·경로 강조·시네마 재생·연결 이유 저장 흐름이 모두 코드로 구현 | 코드 상수(메모리) | `@media` 4 | 없음 | 2부 |
| **59** 메모리 스케치북 | 트리 시간순 읽기(책 넘김) | 재사용 | 스프레드 단위 읽기 + 모서리 드래그/화살표 페이지 넘김 + 목차 패널 | 코드 상수(메모리) | 380·820 | ←→ | 1부 |
| **56** 세로형 관계망 | 전체 조망 그래프 | 보완 | 6클러스터 조망·경로 재생·모바일 리본이 구현. 단 canvas 2D라 접근성 없음 | 코드 상수(메모리) | 640·980 | 없음 | 2부 |
| **66** 첫 트리 가이드 | **첫 기록 작성** 흐름 | 재사용 | 후보 선택→경로(MAIN/BRANCH)→이유 작성→트리 성장이 실제 동작 | sessionStorage 4키 | 900 | 없음 | 2부 |
| **55** LUPT 패치베이 | 다음 순간 **연결 편집** | 재사용 | 케이블 연결·재배선·절점/곡선·정리·되돌리기 + 키보드/aria | 코드 상수(메모리) | 820 | Enter·Space·Delete | 5부 |
| **32** 사람별 기억 책장 | **내 트리 목록**(대상별) | 재사용 | 책장→책→챕터 페이지 넘김. 선택 위치를 localStorage에 유지 | 코드 상수 + localStorage(UI 상태) | 2개 | ←→ | 1부 |
| **57** 리빙글라스 모먼트 카드 | **순간 상세** 카드/모달 | 재사용 | 카드 선택→상세→다음 순간→편집 모달이 완결. ESC·Enter·Space 지원 | 코드 상수(메모리) | 4개 | Enter·Space·Esc | 4부 |
| **44** 메모리 윈도우 컴포저 | 기록 커버·프레젠테이션 참고 | 보류 | 저장은 단일 키 localStorage. "쓰기" 폼이 아니라 커버 조정 도구 | 코드 상수 + localStorage 1키 | 3개 | 1곳 | 3부 |
| **61** 연결 검토실 | 연결 검토(추천형) | 보류 | 추천은 고정 ROUTES. 상호 이동 경로가 끊김. 추천 로직은 4.0 범위 밖 | 코드 상수 + localStorage 1키 | 10개 | Enter·Space·Esc | 2부 |

추천 조합(참고): **66 → 57 → 55**가 4.0의 "첫 기록 → 순간 상세 → 다음 순간 연결"과 가장 직접 대응한다. **32**는 내 트리 목록, **59**는 시간순 읽기, **58·56**은 보기 방식 대안으로 비교 검토할 수 있다.

---

## 2. 4.0 데이터 모델과의 대응 (후보 선택 전에 읽을 것)

4.0 현재 저장 구조는 `version: 1`, `trees[{ id, subject, title, createdAt, updatedAt, moments[] }]`, 각 순간은 `{ id, parentId, relation, title, note, emotion, date, url, createdAt }`이다. **부모 1개 + 연결 이유 문자열 1개**가 규칙이다(`src/domain.js`).

- **다중 연결은 그대로 못 쓴다.** 58은 `moments[]`와 별도 `connections[]`, 55는 순간 사이 임의 연결, 61은 `ROUTES` 인접 그래프를 쓴다. 4.0 스키마로 옮기려면 "한 순간에 여러 연결"을 표현할 규칙이 먼저 필요하다(이슈 #9).
- **감정 값이 다르다.** 58은 12종(설렘·행복·그리움·위로·놀람·몰입·울컥함·아쉬움·감사·각성·궁금함·확신), 55는 영문(CURIOSITY·SURPRISE·AFFECTION·SEARCH), 61은 한글/혼합, 59는 스프레드별 문자열. 4.0은 6종(설렘·위로·벅참·그리움·고마움·즐거움)이다. 매핑은 이슈 #12에서 정한다. **이 문서는 매핑을 확정하지 않았다.**
- **old에는 기록 저장이 사실상 없다.** 58·59·56·57·55는 저장 코드가 0(되돌리기용 메모리 스냅샷만 있음). 66은 sessionStorage, 44·32·61은 localStorage에 UI 상태만 쓴다. 따라서 old 화면을 붙여도 **기록은 반드시 4.0 `storage.js` 경계를 통과**해야 한다.
- **파일 하나가 완결형 HTML이다.** CSS·JS·이미지가 인라인이고 44·57·58은 base64 미디어를 품는다. 통째로 복사하면 4.0의 모듈 구조(`domain.js` / `storage.js` / `main.js`)와 검증 규칙이 깨진다. **값·상호작용·문구만 발췌**한다.

---

## 3. 우선 검토 5종

### 58. Living Memory Pinboard V1.2

- 경로: `reference/source-track-58-living-memory-pinboard/★_최종_58_리빙메모리_핀보드.html`
- HTML title: `LoveTree — Living Memory Pinboard V1.2`
- 크기: 532,697 bytes · SHA-256 `9fd5b6e7b69bc14347cf3eb1905e7a118ad9bd7b62faa9d81f47b4389a7d3cb5`
- 동일 사본: `reference/source-tracks-snapshot/58_리빙메모리_핀보드_시네마틱/버전_1.2_유튜브실제미디어·모바일보정/이전_루트최종복사본_현재후보.html` (바이트 동일)
- 화면 용도: 한 대상의 순간들을 코르크보드 핀처럼 배치하고, 핀 사이를 연결선으로 잇는다. 선택한 핀 기준 경로만 강조하고, 경로를 따라가는 시네마 재생이 있다.
- 주요 버튼: `Moment 꽂기`, `Moment 열기`, `FIT ALL`, `RESET VIEW`, `UNDO`, `⌁ 선택 경로만 보기`, `▶ CINEMA REPLAY`, `PAUSE`, `NEXT ▶`, `YouTube에서 재생`, `Connection 저장`, `저장`(편집), `Memory Board로 돌아가기`, 핀 스타일 5종(LETTER·MINT·NIGHT·PEARL·WARM CORK), 타입 4종(PHOTO·VIDEO·LINK·NOTE)
- 구현된 동작: 순간 추가(로컬 파일/YouTube URL 소스 선택), 편집(제목·메모·링크·미리보기·되돌리기), 감정·키워드 필터, 핀 드래그 이동, 경로 수집·강조, "왜 이 순간 다음으로 이어졌나요?" 입력 후 `Connection 저장`, 연결 삭제, 되돌리기, 전체 맞춤, 포인터 기반 시네마 재생
- 예시·미구현: **저장 없음**(새로고침하면 사라진다). YouTube 실제 재생은 네트워크 필요. 원본의 `검증결과.json`도 로컬 Chromium 아웃바운드 차단으로 실재생은 미확인이라고 기록하고 있다(원본 작성자의 기록이며, 이번 조사도 재생을 확인하지 않았다).
- 데이터 위치: 코드 상수 `moments`(7개) + `connections`(7개). 편집 결과는 메모리. 되돌리기는 `JSON.stringify` 스냅샷. **localStorage/sessionStorage 사용 0**
- 외부 의존성: `i.ytimg.com` 썸네일, `youtube-nocookie.com` 임베드, `youtube.com` 시청 링크, 인라인 base64 JPEG 6개, 표시용 도메인 `lovetree.example`
- 모바일/키보드: `@media` 4개(380·700·760px). **키보드 처리 없음**(keydown 0, tabindex 0) — 포인터 전용이다.
- 4.0 재사용: 핀 배치·경로 강조·시네마 재생의 시각 규칙. 연결 이유를 입력받는 흐름은 4.0의 `relation`과 의미가 같다.
- 연결해야 할 부분: `connections[]`를 4.0 `parentId`/`relation`으로 표현할 수 있는 범위를 먼저 확정(#9). 저장은 `saveState` 경유, 순간 개수 상한(`MAX_MOMENTS`) 준수.

### 59. Memory Sketchbook Journey (페이지 여정)

- 경로: `reference/source-tracks-snapshot/59_메모리스케치북_페이지여정/버전4_캐릭터실자산_최신후보/현재후보.html`
- HTML title: `LoveTree · Memory Sketchbook Journey · V1.1 Link + Korean Editorial Typography`
- 크기: 120,614 bytes · SHA-256 `85fecda2339f2e8287daf09bbd8572d8ca568bb2ff536a6e6599e30078c45916`
- 동일 사본: 없음(1부). 같은 폴더의 `SHA256SUMS.txt`에 위 해시가 기록되어 있어 대조 완료.
- 화면 용도: 스케치북 양면(스프레드) 단위로 순간을 넘겨 읽는 여정. 분기 지점에서 다음 갈래를 고르고, 돋보기로 확대하며, 목차 패널로 전체 경로를 본다.
- 주요 버튼: `←` `→`, `경로 한눈에`, `돋보기 ON`, `Moment 열기`, `+ 링크 Moment`, `Memory Path Index`, `목차에서 보기`, `책으로 돌아가기`, `저장하고 이 Moment로 이동`, `취소`, `닫기`
- 구현된 동작: 페이지 넘김(버튼 + 종이 모서리 드래그), **키보드 ←→ 페이지 넘김**, 확대 렌즈(모바일 위치 보정 포함), 경로 목차/아카이브 패널, 분기 선택지, 링크 순간 추가 모달(URL 정규화·YouTube 판별·실패 시 대체 이미지), 순간 상세 보기
- 예시·미구현: **스프레드 4개(양면 기준 순간 8개, `m1`~`m8`)가 코드 상수 `SPREADS`에 들어 있다.** 추가한 링크 순간은 런타임에 `SPREADS`에 push될 뿐 저장되지 않는다.
- 데이터 위치: 코드 상수 `SPREADS`(JSON 형태, 스프레드 4개) + `DEMO_VIDEO`(base64). 상태는 메모리. **저장 없음**
- 외부 의존성: **구분해서 읽어야 한다.**
  - 기본 내장 예시는 **외부 요청 없음**. 사진 4장·영상 1개가 base64 data URI이고, 썸네일 실패 시 대체 이미지도 인라인 SVG data URI(`linkFallbackImage`)다.
  - **사용자가 링크 Moment를 추가하는 흐름은 예외다.** `previewLink()`와 제출 핸들러가 YouTube URL을 판별하면 `https://img.youtube.com/vi/${id}/hqdefault.jpg`를 `img.src`로 지정한다(원격 요청 2곳). 그 밖의 링크는 표시용 도메인만 쓴다(코드 상수의 `https://example.com/`, 입력 `placeholder`).
  - 따라서 이 파일을 오프라인으로 열면 기본 예시는 보이지만, **YouTube 링크 Moment의 썸네일은 네트워크가 필요하다.** "외부 의존성 없음"은 내장 예시에만 해당한다.
- 모바일/키보드: `@media` 380·820 + `prefers-reduced-motion`. **키보드 있음**(ArrowLeft/Right)
- 4.0 재사용: 시간순 보기 → "책 넘김 읽기 모드"의 근거. 스프레드 상단 eyebrow(날짜 구간), 연결 이유 문장 배치, 목차 패널 구조.
- 연결해야 할 부분: 4.0 순간 배열을 `parentId` 기준으로 정렬해 스프레드에 매핑. 분기(`branch`)는 4.0의 다중 자식 순간으로 계산. 저장 없음 → 저장은 4.0 경계 사용.

### 56. 세로형 모먼트 관계망 전체조망

- 경로: `reference/source-track-56-vertical-moment-network/후보_버전1.2_세로형_모먼트관계망_전체조망.html`
- HTML title: `LoveTree · 세로형 모먼트관계망 전체조망 · 버전1.2 후보`
- 크기: 45,761 bytes · SHA-256 `1828ef47acefd25f1f2b7cff0a3f58c74aa35e28bf127f41975491dcc156d909`
- 동일 사본: `reference/source-tracks-snapshot/56_세로형_모먼트관계망_전체조망/후보_버전1.2_세로형_모먼트관계망_전체조망.html` (바이트 동일)
- 화면 용도: 세로로 긴 관계망 전체를 한눈에 보고, 확대·이동하며, 한 경로를 따라 재생한다. 모바일에서는 리본 형태로 요약한다.
- 주요 버튼: `전체조망`, `전체조망으로`, `확대 +`, `축소 −`, `Moment 열기`, `이 경로 끝까지 따라가기 →`, `사용법`, `First Moment · 전체 분기`
- 구현된 동작: canvas 2D 렌더(노드·허브·베지어 간선), 휠/포인터 확대·이동, 히트 테스트, 클러스터 선택·순간 선택, 분기 선택기, 경로 재생(재생 오브·도착 처리·취소), 모바일 리본 동기화, 리사이즈 대응
- 예시·미구현: 클러스터 6개는 코드 상수(요약 count 값 포함). 개별 순간 상세는 제한적이고 편집·저장은 없다.
- 데이터 위치: 코드 상수 `CLUSTERS`·`WORLD`·`COLORS`·`FIRST`. 상태 메모리. **저장·JSON 사용 0**
- 외부 의존성: 없음(외부 URL 0, base64 0, `<img>` 0). **canvas 2D**
- 모바일/키보드: `@media` 640·980 + `prefers-reduced-motion`, 모바일 리본. **키보드 없음**
- 4.0 재사용: 전체 조망 + 경로 재생 개념, 클러스터→순간 2단계 선택.
- 연결해야 할 부분: canvas는 텍스트 선택·스크린리더·포커스가 불가능하다. 4.0에서 접근성을 유지하려면 SVG/DOM으로 다시 그려야 한다. 좌표 계산은 `domain.js`의 `treeLayout`과 역할이 겹치므로 이중 구현을 피한다.

### 66. First Connection Guide (첫 트리 만들기)

- 경로: `reference/source-tracks-snapshot/66_첫트리만들기_인터랙티브스크롤가이드/버전1.2_제품목적·실제Moment체험강화_후보/현재후보.html`
- HTML title: `LoveTree · First Connection Guide · Track 66 V1.2`
- 크기: 166,996 bytes · SHA-256 `b50e16984774f3284be38b2b8609fd0a6d7ca9f3d51e3ce5bcd910995911ffc6`
- 동일 사본: `reference/source-track-69-fullviewport-portfolio/선택-D_V3_EXACT_SOURCE_MULTI_TEMPLATE_PORTAL/works/03_first_tree.html` (바이트 동일)
- 화면 용도: 첫 트리를 만드는 과정을 스크롤로 안내하며, 실제로 후보 순간을 고르고 이유를 적어 트리를 자라게 하는 체험형 가이드.
- 주요 버튼: `START WITH A MOMENT`, `ADD MY FIRST MOMENT`, `ADD A VIDEO`, `FOLLOW A SAMPLE PATH`, `FOLLOW A SAMPLE TREE`, `BRANCH`, `MAIN`, `SAVE WHY`, `EDIT WHY`, `CONTINUE BUILDING`, `SEE HOW IT GROWS ↓`, FAQ 6종(`CAN I CHANGE MY PATH LATER?` 등), `JOIN`, `CLOSE`, `CANCEL`
- 구현된 동작: 후보 3개(funny·interview·live) 중 선택, `MAIN`/`BRANCH` 경로 선택, 이유 작성/수정, 트리 성장 렌더, **sessionStorage 4키 저장·복원**(`lt66:first`, `lt66:why`, `lt66:route`, `lt66:candidate`), FAQ 아코디언, 스크롤 진행 동기화
- 예시·미구현: 실제 기록 저장이 아니라 **세션 데모**다. 샘플 경로/샘플 트리는 시연용.
- 데이터 위치: **sessionStorage 4키** + 코드 상수의 문구·후보 배열. localStorage 없음
- 외부 의존성: `youtube.com/watch?v=demo`(플레이스홀더), 인라인 base64 이미지 13개, `<img>` 12개
- 모바일/키보드: `@media` 900 + reduced motion. **키보드 없음**
- 4.0 재사용: 첫 기록 UX(#10)의 흐름·문구·빈 상태 근거. "처음 좋아했던 날이 아니어도 된다"는 4.0 원칙과 같은 방향의 안내 문구가 이미 있다.
- 연결해야 할 부분: sessionStorage는 4.0 저장 규칙(localStorage + JSON 백업)과 다르다. 데모 결과를 실제 기록으로 만들 때는 `createTree`/`addMoment`로 저장한다.

### 55. LUPT Memory Patchbay (자유 연결 편집)

- 경로: `reference/source-track-55-lupt/★_최종선택_55_LUPT_자유연결_V1.2_바로보기.html`
- HTML title: `LoveTree · LUPT Memory Patchbay V1.2`
- 크기: 55,327 bytes · SHA-256 `768a49f64da8621fc357a90401baa8f870351a6d27e58dc4d43dab89e80094bd`
- 동일 사본(총 5부): `01_버전별_결과물/03_V1.2_직접조작_QA_최신/02_실행HTML/01_V1.2_메인HTML.html`, `.../02_V1.2_단독실행HTML.html`, `reference/source-tracks-snapshot/55_자유연결_경로편집/★_최종선택_55_LUPT_자유연결_V1.2_바로보기.html`, `reference/source-track-69-fullviewport-portfolio/선택-D_V3_EXACT_SOURCE_MULTI_TEMPLATE_PORTAL/works/05_free_connection.html`
- 화면 용도: 순간 카드 사이를 케이블로 직접 꽂아 연결하는 패치베이. 연결을 다시 배선하거나 곡선 절점을 조정하고, 연결 이유를 검사기에 보여준다.
- 주요 버튼: `+ MOMENT`, `+ BEND`, `− BEND`, `REWIRE TARGET`, `WALK CONNECTION`, `AUTO TIDY`, `DELETE CONNECTION`, `UNDO`, `RESET`, `+`, `−`, 시드 순간(`처음 본 무대`, `이 표정 뭐지?`, `웃는 모습`, `다른 직캠`, `댓글 추천` 등)
- 구현된 동작: 순간 추가, 포트→포트 케이블 연결/검증, 재배선, 수동 절점 추가·삭제, 곡선 경로 재계산, 자동 정리, 되돌리기·초기화, 연결 삭제, 연결 따라 걷기 애니메이션, 검사기에서 연결 이유 표시, 확대/이동
- 예시·미구현: 저장 없음. 순간 추가는 이름·감정 수준의 최소 입력이고, 본문·날짜·링크 입력은 없다.
- 데이터 위치: 코드 상수의 시드 순간(7개)과 연결, 상태 메모리 + 되돌리기 스냅샷. **저장 없음**
- 외부 의존성: 없음(외부 0, base64 0). **SVG**
- 모바일/키보드: `@media` 820 + reduced motion. **키보드·보조기술 근거가 가장 구체적**: 연결선과 핸들에 `tabindex`, Enter·Space로 선택, Delete/Backspace로 삭제, `aria-label` 10곳
- 4.0 재사용: "다음 순간 연결"의 직접 조작. 연결 이유(`relation`)를 연결 자체에 붙이는 개념이 4.0과 같다.
- 연결해야 할 부분: 4.0은 `addMoment(tree, input, parentId)`로 **부모 1개**만 허용한다. 55의 다중 연결·자유 재배선은 스키마 확장 없이는 그대로 못 옮긴다. 지금 스키마에서 바로 쓸 수 있는 것은 간선 시각·호버/포커스 규칙·키보드 삭제 규칙이다.

---

## 4. 추가 후보 4종 (요청: 내 트리 목록/책장, 순간 상세, 첫 기록 작성)

### 32. 사람별 기억 책장 (실제 페이지 모션 v2.1)

- 경로: `reference/source-tracks-snapshot/32_사람별기억책장_실제페이지모션/01_사람별기억책장_실제페이지모션_v2-1.html`
- HTML title: `LoveTree · 3D 사람별 책장`
- 크기: 74,978 bytes · SHA-256 `cb64d80376d59ced65273784ce9723c22723827d25e800474e192d070833ca67`
- 동일 사본: 없음(1부). 같은 폴더 `SHA256SUMS.txt`와 해시 일치
- 화면 용도: 대상(사람)별 책장 → 책 열기 → 챕터 페이지 넘김 → 페이지 안 영상/이미지. **내 트리 목록을 "책장"으로 표현**하는 근거.
- 주요 버튼: `OPEN BOOK`, `CLOSE BOOK`, `← 책장으로 돌아가기`, `‹` `›`, `새 책 만들기 +`, `작품·캐릭터 전체 책 만들기 →`, `취소`
- 구현된 동작: 책장 캐러셀(드래그·선택), 책 열기 애니메이션, 리더에서 페이지 넘김, 챕터 목록, 페이지 내 영상 마운트/해제, 표지·분위기 설정, 모달, 키보드 ←→
- 예시·미구현: 책 8권·챕터 데이터는 코드 상수(제목 34개). **새 책 추가·편집 내용은 저장되지 않는다.**
- 데이터 위치: 코드 상수 + **localStorage 1키**(`lovetree-people-book-shelf-v2-1-true-page-motion`)에 선택 위치만 저장
- 외부 의존성: 없음(외부 URL 0). base64 이미지 2개
- 모바일/키보드: `@media` 2개. 키보드 ←→(책장 이동), tabindex 1
- 4.0 재사용: 내 트리 목록(#10 이후)의 대상별 책장 레이아웃. `state.trees`의 `subject`/`title`/순간 수와 거의 1:1로 매핑된다.
- 연결해야 할 부분: old의 localStorage 키를 쓰지 않고 `storage.js`로 통합. 책 등록/삭제는 `createTree`/트리 삭제 흐름으로 대체.

### 57. Living Moments V1.2 (리빙글라스 모먼트 카드)

- 경로: `reference/source-track-57-living-glass/★_최종_버전1.2_리빙글라스_모먼트카드.html`
- HTML title: `LoveTree · Living Moments V1.2`
- 크기: 671,480 bytes · SHA-256 `18f2f79c5390f0fa31a7893d25a464cd93f35438874f7855bdba74faa7dae834`
- 동일 사본(총 4부): `03_버전1.2_최종후보_자료/02_화면원본/…_YOUTUBE_LIVE_THUMBNAIL.html`, `…_STANDALONE.html`, `reference/source-tracks-snapshot/57_리빙글라스_모먼트카드/★_최종_버전1.2_리빙글라스_모먼트카드.html`
- 같은 계열의 다른 해시(참고): `모바일_확인본_버전1.2_유튜브_실시간썸네일.html`(676,439, `98ee5906…`), `04_버전1.3_모바일반응형수정_자료/후보_버전1.3_…html`(676,320, `ca30cdb4…`), V1.1 REAL_MEDIA(666,876, `1849572b…`, 2부)
- 화면 용도: 유리 카드로 순간들을 보여주고, 카드를 선택하면 상세 모달에서 미디어·감정·이유를 읽고 다음 순간으로 넘어간다. **순간 상세**의 직접 근거.
- 주요 버튼: `Moment 열기`, `다음 순간 보기 →`, `닫기 · ESC`, `미디어 링크 연결`, `이 Moment에 연결`, `처음 상태`, `사용법`, `취소`
- 구현된 동작: 카드 선택/해제/스와이프, 상세 모달 열기·닫기, 편집 모달(실시간 미리보기), 다음 순간 이동, 연결 이동 애니메이션, YouTube ID 파싱·썸네일·재생/정지, 안전 URL 검사, Enter/Space 카드 선택, ESC 모달 닫기
- 예시·미구현: 순간 3개(코드 상수). 편집·미디어 연결은 세션 메모리에만 남는다.
- 데이터 위치: 코드 상수 `moments`, 상태 메모리. **저장 없음**
- 외부 의존성: `img.youtube.com` 썸네일, `youtube-nocookie.com` 임베드, `youtube.com` 링크, base64 이미지 4개 + `<video>` 1개
- 모바일/키보드: `@media` 4개. 키보드 Enter·Space·ESC, tabindex 1
- 4.0 재사용: 순간 카드 그리드 + 상세 모달 + "다음 순간 보기". 4.0 `emotion`/`note`/`url`/`relation`으로 그대로 구성 가능하다.
- 연결해야 할 부분: 4.0 `safeUrl`은 http/https만 허용하므로 YouTube 썸네일 추출은 별도 함수가 필요하다. 다음 순간 이동은 `moments`의 자식/형제 순서로 계산. base64 미디어를 제품 번들에 넣지 않는다(4.0은 현재 이미지 업로드 미지원).

### 44. Memory Window Composer v2

- 경로: `reference/source-track-44-handopen-memory-composer/01_손으로여는기억창_컴포저_v2.html`
- HTML title: `LoveTree Memory Window Composer v2`
- 크기: 427,043 bytes · SHA-256 `8fd6a4f14c2bb4dfa1f4ccb30dd95409f81e4159936bc70a3a62d7fddc5d705a`
- 동일 사본(총 3부): `reference/source-tracks-snapshot/44_손으로여는기억창_컴포저/01_손으로여는기억창_컴포저_v2.html`, `reference/source-track-69-fullviewport-portfolio/선택-D_V3_EXACT_SOURCE_MULTI_TEMPLATE_PORTAL/works/11_moment_composer.html`
- 화면 용도: 기억 "창"의 커버/프레임을 조정해 저장하는 컴포저. 배경 업로드, 틸트·미러·센터·프런트 배치, 스타일·프리셋, 16:9 잠금, 미리보기.
- 주요 버튼: `Moments`, `Backgrounds`, `Preview`, `Save`, `Save as cover`, `Save to Season`, `Use in Course`, `Copy share link`, `RESET`, `16:9 LOCK`, `CENTER`, `FRONT`, `MIRROR`, `TILT L`, `TILT R`, `▶`, `＋`, `−`
- 구현된 동작: 상태 저장·복원(`lovetree-memory-window-composer-v1`), 배경 파일 업로드, 스타일 6종(CLEAN·CINEMA·ARCHIVE·GLOW·COLLAGE·LIVE MOMENT), 포즈 프리셋 6종, 미리보기, YouTube 임베드
- 예시·미구현: 서버 저장·실제 공유 없음(로컬 동작). 순간 3개(videoId).
- 데이터 위치: 코드 상수 `ASSETS`(base64 webp) + **localStorage 1키**(실패 시 메모리 Map fallback)
- 외부 의존성: `youtube.com/embed`, base64 이미지 3개
- 모바일/키보드: `@media` 3개. 키보드 처리는 1곳(제한적)
- 4.0 재사용: **"쓰기"가 아니라 "보여주기"** 도구다. 첫 기록 작성(#10)의 폼 근거로는 약하고, 순간을 카드/커버로 보여줄 때의 배치·프리셋 참고로 적합하다.
- 연결해야 할 부분: 단일 키 저장 + 메모리 fallback은 4.0 `storage.js`보다 느슨하다(충돌·손상·백업 없음). 저장 방식은 재사용하지 않는다.

### 61. 추천형 Connection Builder V1.9 (연결 검토실)

- 경로: `reference/source-tracks-snapshot/61_감정경로_연결검토실/현재후보.html`
- HTML title: `LoveTree · 추천형 Connection Builder V1.9`
- 크기: 509,063 bytes · SHA-256 `834fb634de5e039f95522a427f2ca20f0ed34d3c773bafbb51ced1ae14a43abe`
- 동일 사본: `reference/source-track-69-fullviewport-portfolio/선택-D_V3_EXACT_SOURCE_MULTI_TEMPLATE_PORTAL/works/04_connection_review.html` (바이트 동일)
- 화면 용도: 순간 후보를 추천하고 연결 이유를 검토하는 화면. 다른 갈래로 바꾸거나 방금 한 연결을 취소한다.
- 주요 버튼: `다음 추천 받기`, `다른 갈래로 연결`, `← 다시 고르기`, `← 이유 다시 보기`, `↶ 방금 연결 취소`, `고급 연결편집`, `나중에 정리`, `모든 갈래 보기`, `먼저 영상 보기`, `이 링크로 Moment 만들기`, `이 문장으로 계속`
- 구현된 동작: 카드 선택·경로 미리보기, 모달 열기/닫기, 영상 열기, 키보드 선택, **다른 트랙으로 이동 시도**(`TRACK_TARGETS`)와 `lovetree:view-handoff` 기록
- 예시·미구현: 추천은 고정 `ROUTES` 인접 그래프(순간 21개, 참조 81개). **상호 이동 경로 3개가 모두 존재하지 않는다**(6절).
- 데이터 위치: 코드 상수 `MOMENTS`·`ROUTES`·`TRACK_META` + localStorage 1키(핸드오프)
- 외부 의존성: `youtube.com` 링크/임베드, `img.youtube.com` 썸네일, base64 이미지 21개
- 모바일/키보드: `@media` 10개(9종 중 가장 많음). 키보드 Enter·Space·ESC, tabindex 2
- 4.0 재사용: "이유를 다시 읽게 하는" 검토 문구·위계. 연결 검토 UX 자체는 4.0에 추천 로직·서버가 없으므로 **보류**.
- 연결해야 할 부분: 추천 규칙을 도입하려면 #9에서 제품 규칙을 먼저 정한다. 지금은 `relation` 편집 UI 근거로만 참고.

---

## 5. 중복 사본 · SHA-256 대조표

`reference` 아래 HTML 180개의 해시를 계산했다. **고유 내용 135개**, 45개가 중복이다. 아래 9종은 각 트랙 폴더의 `SHA256SUMS`(또는 `.txt`)에 기록된 값과 **로컬 계산값이 일치**했다. 즉 이 파일들은 사본끼리 바이트 단위로 같고, 원본 기록과도 어긋나지 않는다.

| 자산 | SHA-256 | 크기 | 동일 사본 수 |
| --- | --- | --- | --- |
| 58 | `9fd5b6e7b69bc14347cf3eb1905e7a118ad9bd7b62faa9d81f47b4389a7d3cb5` | 532,697 | 2 |
| 59 | `85fecda2339f2e8287daf09bbd8572d8ca568bb2ff536a6e6599e30078c45916` | 120,614 | 1 |
| 56 | `1828ef47acefd25f1f2b7cff0a3f58c74aa35e28bf127f41975491dcc156d909` | 45,761 | 2 |
| 66 | `b50e16984774f3284be38b2b8609fd0a6d7ca9f3d51e3ce5bcd910995911ffc6` | 166,996 | 2 |
| 55 | `768a49f64da8621fc357a90401baa8f870351a6d27e58dc4d43dab89e80094bd` | 55,327 | 5 |
| 32 | `cb64d80376d59ced65273784ce9723c22723827d25e800474e192d070833ca67` | 74,978 | 1 |
| 57 | `18f2f79c5390f0fa31a7893d25a464cd93f35438874f7855bdba74faa7dae834` | 671,480 | 4 |
| 44 | `8fd6a4f14c2bb4dfa1f4ccb30dd95409f81e4159936bc70a3a62d7fddc5d705a` | 427,043 | 3 |
| 61 | `834fb634de5e039f95522a427f2ca20f0ed34d3c773bafbb51ced1ae14a43abe` | 509,063 | 2 |

55·57처럼 버전이 여러 개인 자산은 **버전마다 해시가 다르다**. 파일명의 `최종`만 보고 고르면 안 되고, 위 해시로 동일본을 구분해야 한다. 예: 57은 V1.1(666,876) / V1.2(671,480) / 모바일 확인본(676,439) / V1.3(676,320)이 모두 다른 파일이다.

---

## 6. 61(연결 검토실)의 끊어진 상호 경로

`TRACK_TARGETS`가 가리키는 세 경로는 현재 디렉터리 구조에서 **모두 존재하지 않는다**.

```text
../../56_세로형_모먼트관계망_전체조망/후보_버전1.2_세로형_모먼트관계망_전체조망.html   → 없음
../../55_자유연결_경로편집/★_최종선택_55_LUPT_자유연결_V1.2_바로보기.html            → 없음
../../59_메모리스케치북_페이지여정/버전5_스토리자동재생·인라인편집·시네마틱배경_최신후보/현재후보.html → 없음
```

두 가지 이유가 겹친다.
1. 상대 경로 깊이가 어긋난다. 파일은 `reference/source-tracks-snapshot/61_감정경로_연결검토실/`에 있어 `../../`가 `reference/`를 가리키지만, 실제 대상은 `reference/source-tracks-snapshot/` 안에 있다(`../`가 맞다).
2. 59는 폴더에 `버전4_캐릭터실자산_최신후보`와 `SHA256SUMS.txt`만 있다. 참조하는 **버전5는 이 사본에 없다.**

4.0에서 이 화면을 살릴 때는 파일 간 상대 이동을 쓰지 말고 4.0 라우트(`#tree/<id>`)로 바꿔야 한다.

---

## 7. 검토했으나 이번 후보에서 제외

| 자산 | 경로 (`reference/`부터, `lovetree-limone/old` 기준) · 해시 앞 8자리 | 제외 이유 |
| --- | --- | --- |
| 31 사람별기억책장 인터랙션 | `reference/source-tracks-snapshot/31_사람별기억책장_인터랙션/01_사람별기억책장_상호작용_v2.html` `460a0c60…` | 32와 목적 중복. 다만 키보드(←→·Enter·Space)·`@media` 4개로 접근성 근거는 31이 더 낫다. 32를 고를 경우 31의 키보드 규칙만 참고 |
| 29·30·33·34 책장 계열 | `reference/source-tracks-snapshot/29_사람별기억책장_기본/01_사람별기억책장_기본_v1.html` `75091e9c…`, `reference/source-tracks-snapshot/30_사람별기억책장_3D/01_사람별기억책장_3D_v2.html` `c5439af2…`, `reference/source-tracks-snapshot/33_사람별기억책장_폴딩/01_사람별기억책장_접이식아카이브.html` `762d1bd3…`, `reference/source-tracks-snapshot/34_사람별기억책장_3D아코디언앨범/01_사람별기억책장_3D아코디언앨범.html` `5c02aa02…` | 32의 이전/변형 버전. 33·34는 CSS 중심(34는 리스너 1개)이라 동작 근거가 약함 |
| 45 Moment Polish Lab | `reference/source-track-45-moment-precision/01_모먼트상호작용_정밀보정도구.html` `6f066360…` | 순간 카드 모션 파라미터 실험실(수치·replay). 제품 화면이 아니라 **모션 값 참고용**. 저장은 단일 키 localStorage |
| 46 팝업시즌 기억책 | `reference/source-track-46-popup-season/01_팝업시즌_기억책.html` `8537502c…` | 챕터·공유·커버까지 구현되어 있으나 59(책 넘김)와 목적 중복 |
| 43 기억장면 레시피 / 41 메모리포켓 / 37 기억달력 | `reference/source-track-43-memory-scene-recipe/01_기억장면_레시피도구.html` `e36c7b13…`, `reference/source-track-41-memory-pocket/01_메모리포켓_상호작용.html` `ba0a31f9…`, `reference/source-tracks-snapshot/37_기억달력_메모리패드/01_기억달력_뜯어쓰는메모리패드.html` `63ab4938…` | 도구·갤러리 성격. 4.0의 첫 기록/순간 상세/목록과 직접 대응이 없음 |
| 40·48·49·50·51·52·64·67·71·72·73·74 등 대형 시네마틱 | 각 트랙 폴더(`source-track-*`, `source-tracks-snapshot/*` 아래) | 랜딩·프로모션 성격(1.5~10MB). 64는 이미 4.0 첫 화면(SRC064)으로 선택된 상태이며, 이번 조사는 **대체 랜딩을 선정하지 않는다** |
| 60 3D 모먼트 클러스터(55·56·59 연결) | `reference/source-tracks-snapshot/60_3D모먼트클러스터_심층탐색_55,56,59연결버전/버전1.2_실제트랙네비게이션_후보/★_현재후보_Track60_V1.2_REAL_NAVIGATION.html` `c35b66fb…` | 55·56·59를 연결한 상위 실험. 세 후보를 각각 검토한 뒤 판단하는 편이 낫다 |

---

## 8. 조사하지 못한 범위 (한계)

- **브라우저 실행·렌더링·모바일 실기기 확인 없음.** 9종 모두 소스만 읽었다. 버튼이 화면에서 실제로 보이는지, 애니메이션이 의도대로 동작하는지는 확인하지 않았다.
- 135개 고유 HTML 전체를 정독하지 않았다. 전수 **해시·중복 분류(180개)** → 파일명·구조 훑기(약 30개) → **상세 정독(9개 + 제외 판단 7개)** 순으로 범위를 좁혔다.
- base64 미디어 내부, mp4·zip 등 대형 바이너리 내부, `node_modules`·`.git`·`workspace-archive`는 열지 않았다.
- 58·57·59·61이 참조하는 YouTube 썸네일·임베드는 네트워크가 필요한데 이 환경에서 확인하지 않았다. 58 원본의 `검증결과.json`도 로컬 Chromium 아웃바운드 차단으로 실재생은 미확인이라고 적고 있다.
- `reference/design-lab`, `reference/design-intake`, `lineage-*`, `v3/sibling-prototypes`는 이름·중복 여부만 확인했고 내용은 검토하지 않았다.
- old 원본은 **읽기만** 했다. 수정·복사·삭제하지 않았고, 4.0 쪽에는 이 문서만 추가했다.

---

## 9. 재현 방법

```sh
cd /g/Ddrive/BatangD/task/workdiary/lovetree-limone/old/reference
# 전수 해시·중복 분류
find . -type f -iname '*.html' -print0 | while IFS= read -r -d '' f; do
  h=$(sha256sum "$f" | cut -d' ' -f1); s=$(stat -c%s "$f"); printf '%s|%s|%s\n' "$h" "$s" "$f"
done | sort
# 개별 후보 확인 (예: 58)
sha256sum "./source-track-58-living-memory-pinboard/★_최종_58_리빙메모리_핀보드.html"
```

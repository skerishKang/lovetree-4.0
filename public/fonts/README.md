# 자체 호스팅 글꼴 (#55)

공통 UI는 Pretendard, 기억책의 감상 제목만 MaruBuri. 두 글꼴 모두 **공식 배포본의 파일을 수정 없이** 담았다(교체 전: Google Fonts의 DM Sans/Noto Sans KR/Gowun Batang @import).

## Pretendard — 공통 UI

- 출처: 공식 저장소 <https://github.com/orioncactus/pretendard>, 배포물 npm `pretendard@1.3.9`
  (tarball `pretendard-1.3.9.tgz` SHA-256 `0ffc240cee83be02520fb4ac1b2a0a51052b9d13506ade0ba90c591dbbb3bd53`)
- 파일: `pretendard/pretendardvariable-dynamic-subset.css`(SHA-256 `2973bcae80262dcb630cfb793fbf6af29bd986c769ee54953fb3e5b3e32323ca`)와 `pretendard/woff2-dynamic-subset/*.woff2` 92개, 합계 2,957,724바이트. 예시 파일 `PretendardVariable.subset.0.woff2` SHA-256 `8713e83342c3f5ed316bf22bf50a3d991a5b5dd16c0c45c54a6ad81f62be7df3`
- CSS는 패키지 원본 그대로이며 상대 경로(`./woff2-dynamic-subset/…`)를 그대로 둔다. `index.html`이 이 파일을 링크하고, `font-display: swap` + `unicode-range` 분할은 공식 배포물의 동작이다.
- 이유: 단일 변수 파일(`woff2/PretendardVariable.woff2`, 2,057,688바이트)도 공식 배포물이지만 실측 전송량이 커서, 실제 화면에서 필요한 범위만 내려받는 공식 dynamic-subset을 택했다(아래 실측).
- 라이선스: SIL OFL 1.1 — 전문 `LICENSE-Pretendard.txt`(패키지 동봉 원본).

## MaruBuri — 기억책 감상 제목

- 파일: `MaruBuri-Regular.woff2`, 429,572바이트, SHA-256 `74bd817d96466e5d071e19234faddc8099f9d5913757880a52a59516859a72ff`
- 출처: 네이버 공식 CSS <https://hangeul.naver.com/css/fonts.css> 의 `@font-face`가 가리키는 `https://hangeul.pstatic.net/0/hangeul/2023/fonts/MaruBuri-Regular.woff2` 그 파일. 설치용 공식 ZIP <https://hangeul.pstatic.net/0/hangeul/2022/zip_v2/maruburi.zip>(SHA-256 `39e3bb6a00b4543563a745195a6a89282c5a1f0f8b71923ff15c1bc7c135fa0c`)으로도 대조했다. GitHub 미러 파일은 쓰지 않았다.
- 굵기는 Regular 한 종만 싣는다(감상 제목은 400). 로딩은 `font-display: swap`, 대체 스택은 `'MaruBuri','Noto Serif CJK KR',Batang,Georgia,serif`.
- 라이선스: 저작권 안내와 SIL OFL 1.1 전문을 `LICENSE-MaruBuri.txt`에 동봉(네이버 안내문은 마루 부리가 나눔 글꼴과 같은 오픈 라이선스이며 법적 효력은 영문 원본에 있다고 명시).

## 실측(Chromium 156, 로컬 프로덕션 빌드, 화면 순회 누적)

| 상태 | Pretendard | MaruBuri | 합계 |
| --- | --- | --- | --- |
| 교체 전(Google Fonts 서브셋) | — | — | 82,360바이트 |
| 단일 변수 파일 | 2,057,688 | 429,572 | 2,487,260 |
| **적용(dynamic-subset)** | 411,332(16개 파일) | 429,572 | **840,904** |

- 첫 화면만: 259,128바이트(10개 파일). 기억책을 열지 않으면 MaruBuri는 내려받지 않는다.
- 렌더 확인: 그 외 화면·요소는 모두 `Pretendard Variable`, 기억책 `.memory-title`만 `MaruBuriOTF`(공식 파일의 내부 이름)로 CDP 실측. 그림자 DOM(첫 화면·책장·기억책) 포함.

확인일 2026-10-28.

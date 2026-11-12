# 러브트리 4.1 낱말 표 (#459)

화면에 보이는 글자(단추·제목·안내·알림·화면 읽기용 이름)에서 같은 것을 다르게 부르지 않기 위한 기준표.
2026-11-13 조사(#459 1단계). **메뉴·단추·안내·알림·aria-label에 이 표의 말을 쓴다.**

## 낱말 표

| 뜻 | 통일할 말 | 지금 쓰이는 변형과 위치(조사 당시) | 바꾸면 안 되는 예외 |
|---|---|---|---|
| 책 보기 | **책** | 맨 위 메뉴 "책"(기준) · 보드·지도 모바일 줄 "기억책 열기"(track58·track56 openLabel) · 지도 상세 "기억책에서 보기"(track56 #openMoment) · 책장 "기억책 열기"(track32 #openBookButton, shelf.js aria-label, view-navigation shelfJump, v41/home.js 대화상자) · 책 읽기 화면 제목 "기억책"(shelf-reader readerLabel·Eyebrow, track59 topbar #bookTitleText) · 알림 "기억책에 추가했어요"(book.js 링크 순간) · 안내 "기억책에서 다시 볼 수 있어요"(first-journey·journey-page) | 없음 |
| 내 트리 목록 화면 | **내 트리** | 메뉴 "내 트리 전체 보기"(접기 메뉴·트리 ▾) · 화면 작은 제목 "내 책장"(shelf-reader #crumbLabel) · 개수 "N권"(track32 #resultCount) · 화면 읽기용 "내 책장"(#shelfViewport aria-label) · "책장 목차"(#shelfSpines aria-label) · home 가운데 단추 "내 책장"(home-center) | 뒤로 단추 "← 내 트리"(이미 통일) |
| 순간 넣기 | **순간 추가** | 버튼 "＋ 순간 추가"(기준) · 창 작은 제목 "순간 남기기"(panels.mjs write-eyebrow ×2, header-state writeMenuLabel) · 첫 화면 "＋ 첫 순간 남기기"(home-center) · 빈 카드 "첫 순간 남기기"(home-cards) · 책 오른쪽 페이지 "다음 순간 남기기"(book-usability NEXT_PAGE_ACTION) | **보드 "＋ 순간 꽂기"·"순간 꽂기"·"새 순간을 기억판에 꽂기"**(track58) — 보드만의 동작(핀 꽂기)을 가리키며 셸 순간 추가 창과 다른 보드 자체 모달이다(#459 본문 기준 예외) |
| 책의 페이지 넘김 | **책장 넘기기**(유지) | 책 안내 "책장 넘기기"(book.js #turnWhy) | 다른 뜻 — 책의 한 장(페이지)을 넘기는 동작. 내 트리 목록 화면과 무관 |

## 범위 밖 (화면 안 소개 문구·제목의 긴 이름 — 이슈 본문 기준 유지)
- 브라우저 제목 "러브트리 4.1 · 기억책"(track59 `<title>`)
- 화면 안 큰 제목 "기억 보드"·"관계 지도"(각 화면 topbar 트리 제목 단추의 기본값 — 트리 제목이 없을 때만 보인다)
- 여정 단계 이름 "마음 남기기", 댓글 "댓글 남기기"(다른 대상을 남기는 말)

## 금지 낱말(화면 글자에 다시 나타나면 실패)
`기억책 열기` · `기억책에서 보기` · `내 책장` · `순간 남기기` — 단, 위 예외(보드 꽂기·책장 넘기기·범위 밖 제목)와 `<title>`·주석은 제외한다.

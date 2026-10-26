# 4.0 참고 자료

2026-10-27 확인. 과거 지시를 4.0의 확정 요구사항으로 취급하지 않는다.

## 참고한 제품 자료

- [LoveBud PRODUCT_IDENTITY](https://github.com/skerishKang/LoveBud/blob/main/docs/product/PRODUCT_IDENTITY.md): 팬의 첫 순간, 감정 메모, 연결된 경로.
- [LoveBud BRAND_EXPERIENCE](https://github.com/skerishKang/LoveBud/blob/main/docs/product/BRAND_EXPERIENCE.md): 따뜻한 스크랩북과 감상 중심 표현.
- [리모네 V4 매니페스트](https://github.com/skerishKang/lovetree-limone/blob/main/app/components/v4/v4-source-manifest.ts): 확인 당시 29개. 30개라는 과거 정리의 수치는 수정한다.

## 보존한 HTML 참고본

GitHub에서 읽은 UTF-8 파일의 Git blob SHA를 대조해 원본과 동일한 바이트임을 확인했다. 참고본은 `public` 밖에 있으므로 제품 빌드에는 들어가지 않는다. 원본 내부의 외부 이미지·폰트·스크립트는 과거 참고본의 의존성이며 4.0 기능으로 채택한 것이 아니다.

| 보존 파일 | 출처 경로 (`skerishKang/lovetree-limone`) | Git blob SHA |
| --- | --- | --- |
| `originals/first-journey.html` | `[샘플]/lovetree-first-journey-unified-v1.html` | `be25af8874fdae60bae8d3a0edb8124f297d6428` |
| `originals/community-discovery.html` | `reference/source-tracks-snapshot/01_0730작업물/lovetree-community-discovery-v2.html` | `d621352fc3884c54ea6b3eb3d3a83ed3b720f3da` |

SHA-256:

```text
3b61fe4bfbbacb9d4bcff1c6da86d54ba28af60f29c12df44e0ebcc3bdf17468  originals/first-journey.html
661d21d4e85711603f7e8fe3966d3fd5ccc29c920fd6479850c2f99040e39f59  originals/community-discovery.html
```

## 4.0에 반영한 것

- 종이 같은 배경, 세이지 그린·로즈 계열, 순간 카드와 유기적인 가지 표현.
- 첫 순간 → 마음 기록 → 다음 순간 연결의 핵심 경험.
- 커뮤니티 리스트의 숫자보다 순간의 메모와 감정을 먼저 읽는 위계.

## 새로 정한 것

- 첫 기록은 최초 입덕일이 아니라 지금 간직하고 싶은 순간으로 시작한다.
- 페이지별 대형 HTML 스크립트를 복제하지 않고 데이터 규칙과 저장 어댑터를 분리한다.
- 현재 예시는 가상 자료이며 자체 제작 SVG를 사용한다. 외부 인물 사진이나 실제 사용자 기록을 복제하지 않았다.
- 현재 브라우저 저장 단계에서는 로그인·공개 공유를 지원하는 것처럼 표시하지 않는다.
- 원본과의 픽셀 일치 계약은 없다. UI 확정은 실제 사용 확인 이후다.

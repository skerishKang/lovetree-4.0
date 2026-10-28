# Pages API 프록시 (`/api/*`·`/auth/*` → COM2)

프런트는 Pages에서, 저장·로그인 서버는 COM2 Node에서 돈다. 프런트는 `/api/workspace`·`/auth/*`를 **상대 경로 + `credentials:'same-origin'`** 으로 부르고, 세션 쿠키는 **host-only + `Path=/` + `SameSite=Lax`** 다. 그래서 두 서비스가 같은 오리진이어야 하고, 이 프록시가 그 경계를 만든다.

| 파일 | 역할 |
| --- | --- |
| `functions/api/[[path]].js` | `/api/*` 전체를 소유(허용 목록 밖은 404 JSON, 정적 폴백 없음) |
| `functions/auth/[[path]].js` | `/auth/*` 전체를 소유(로그인·콜백·로그아웃만 통과) |
| `functions/_lib/proxy.js` | 실제 프록시(설정·허용 목록·헤더·오류 계약) |
| `tests/pages-proxy.test.mjs` | 계약 회귀 시험(10건) |

## 기존 PADIEM 프록시에서 재사용한 것 / 옮기지 않은 것

재사용한 것은 **형태**다.

- 업스트림은 설정 하나(`env.LOVETREE_API_ORIGIN`)에서만 온다. 요청 헤더·쿼리·본문으로 목적지를 바꿀 수 없다(`padiem-ai-engine-ingress`가 `ENGINE_EXECUTE_URL`을 고정하는 것과 같은 원칙).
- 비밀·주소는 서버(엣지) 측에만 둔다. 브라우저가 보내는 것은 쿠키와 본문뿐이다.
- 실패는 닫힌 방향으로 낸다. 계약 밖 응답은 그대로 흘리지 않고 JSON 오류로 끊는다.

`padiem-ai-engine-ingress` 자체를 이식하지 않은 이유:

- 그 Worker는 **단일 경로**(`/internal/v1/execute`)와 **서비스 바인딩**(`ENGINE`)·**호출 자격 증명 주입**(`x-padiem-engine-credential`) 전용이다. 브라우저가 쿠키·302·`Set-Cookie`를 주고받는 범용 리버스 프록시가 아니고, 인증을 자기가 발급하는 구조라 그대로 쓰면 러브트리의 쿠키 경계와 충돌한다.
- `chat.padiem.net`·`local-agent.padiem.net`처럼 **도메인-워커**로 호스팅하는 패턴도 이번엔 쓰지 않았다. 프런트가 Pages에 있어 같은 오리진이 필요한데, Pages 커스텀 도메인 위에서는 Functions가 그 자리를 가장 적은 이동으로 채운다. COM2를 엣지에 붙이는 방식은 그 outbound 브로커 패턴을 배포 단계에서 재사용한다.

## 계약

- 통과 경로: `/api/workspace`, `/auth/login`, `/auth/callback`, `/auth/logout`. 그 밖의 `/api/*`·`/auth/*`는 **404 JSON**(`not_proxied`).
- 요청: method·query·body 그대로. 전달 헤더는 `cookie`·`content-type`·`accept`·`accept-language`·`authorization`·`origin` 뿐이고 `x-forwarded-*`·`host`·목적지 지정 헤더는 넘기지 않는다.
- 응답: status·`location`·`set-cookie`(복수)·`content-type`·`cache-control`·`x-content-type-options`·`www-authenticate`를 그대로. `Domain`을 덧붙이지 않는다.
- 오류: 설정 없음/형식 오류 → 503 `storage_unavailable`(업스트림 호출 없음), 연결 실패 → 502 `upstream_unreachable`, 시간 초과(15초) → 504 `upstream_timeout`, HTML 또는 `/api/workspace`의 비 JSON → 502 `upstream_invalid_response`.
- `LOVETREE_API_ORIGIN`은 origin만 받는다(경로·쿼리·자격 증명 포함 시 503). https만, 예외적으로 loopback http는 격리 검증용.

## 수용 기준

정적 호스트 폴백이 그대로 새지 않는지 **content-type으로** 판정한다.

```bash
curl -is https://<front>/api/workspace   # → 401 또는 200, content-type: application/json
curl -is https://<front>/auth/login      # → 302, location 은 PADIEM handoff
curl -is https://<front>/api/nope        # → 404 application/json (HTML 아님)
```

브라우저에서는 동기화 띠가 `checking`에 머물지 않고, 콘솔에 `지원하지 않는 러브트리 파일이에요`가 없어야 한다.

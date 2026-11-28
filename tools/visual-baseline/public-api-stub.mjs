// #1585: 겉모습 비교용 공개 API 고정 응답. 실제 서비스·저장소에는 쓰지 않는다.
// 기준 배포와 PR 미리보기의 브라우저 읽기 요청에만 같은 값을 돌려준다.
const SAMPLE_SHARES = [
  {
    shareId: 'c0000000000000000000000a',
    title: '화면 점검 공개 트리',
    subject: '화면 점검',
    summary: '기준 사진에 사용하는 시험용 기록',
    momentCount: 3,
    createdAt: '2025-11-05T09:00:00.000Z',
    publicDisplayName: '시험 공개자',
    cover: { type: 'memo', title: '첫 시험 순간', emotion: '설렘', url: '' },
    emotions: ['설렘'],
    stats: { hearts: 2, favorites: 1, hearted: false, favored: false, reactions: { heart: 2 }, mine: [] }
  }
];

const RESPONSES = new Map([
  ['/api/community/stats', { trees: 17, moments: 42 }],
  ['/api/community/shares', {
    ok: true, items: SAMPLE_SHARES, totalVisible: SAMPLE_SHARES.length,
    nextCursor: '', groups: [], groupsAll: []
  }],
  ['/api/public/moments', { ok: true, items: [], nextCursor: '' }],
  ['/api/public/tag-moments', { ok: true, items: [] }],
  ['/api/community/stages/popular', { ok: true, items: [], nextCursor: '' }]
]);

export const STUB_PATHS = Object.freeze([...RESPONSES.keys()]);

// 쿼리(정렬·limit·tag 등)는 결과에 영향을 주지 않는다. 미리보기와 기준은 같은 값으로 비교한다.
export function visualPublicApiResponse(url, method = 'GET', baseOrigin = null) {
  if (String(method).toUpperCase() !== 'GET') return null;
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (baseOrigin && parsed.origin !== new URL(baseOrigin).origin) return null;
  const value = RESPONSES.get(parsed.pathname);
  return value ? structuredClone(value) : null;
}

// Context 단위로 설치해야 첫 탐색·하위 프레임이 부르는 요청을 모두 가로챈다.
// 미리보기 URL에서 다른 도메인으로 나가는 요청이나 쓰기 요청은 건드리지 않는다.
export async function installVisualPublicApiStubs(context, baseUrl, hit = () => {}) {
  const origin = new URL(baseUrl).origin;
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const reply = visualPublicApiResponse(request.url(), request.method(), origin);
    if (reply === null) return route.continue();
    hit(new URL(request.url()).pathname);
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify(reply)
    });
  });
}

/**
 * YouTube 임베드의 실제 화면 판정: iframe 위에 다른 요소가 그려지면 해당 지점을 기록합니다.
 * #1379의 10/50/90% 9지점 계산을 공용화합니다.
 * Playwright Locator 기반이므로 상위 페이지/하위 화면 Frame에서 동일하게 쓸 수 있습니다.
 */
export async function inspectYoutubeIframe(iframe) {
  return iframe.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const points = [];
    for (const y of [0.1, 0.5, 0.9]) for (const x of [0.1, 0.5, 0.9]) {
      const px = box.left + box.width * x;
      const py = box.top + box.height * y;
      // Shadow DOM 안 플레이어는 문서가 아닌 해당 ShadowRoot에서 적중 요소를 판정합니다.
      const root = element.getRootNode();
      const top = typeof root.elementFromPoint === 'function'
        ? root.elementFromPoint(px, py) : document.elementFromPoint(px, py);
      const withinViewport = px >= 0 && py >= 0 && px < innerWidth && py < innerHeight;
      const name = top
        ? top.tagName.toLowerCase()
          + (top.id ? '#' + top.id : '')
          + (typeof top.className === 'string' && top.className.trim()
            ? '.' + top.className.trim().replace(/\s+/g, '.')
            : '')
        : '없음';
      points.push({ x, y, withinViewport, blocked: top !== element, top: name });
    }
    return {
      width: box.width,
      height: box.height,
      minimum200: box.width >= 200 && box.height >= 200,
      blocked: points.filter((point) => point.blocked).length,
      blockers: [...new Set(points.filter((point) => point.blocked).map((point) => point.top))],
      points,
      autoplay: new URL(element.src).searchParams.get('autoplay') === '1',
    };
  });
}

/** 스코프 안 유튜브 iframe 중 자동 재생 지정 개수. 숨은 미리 불러오기 iframe도 셉니다. */
export async function countYoutubeAutoplay(scope) {
  return scope.locator('iframe[src*="/embed/"]').evaluateAll((frames) =>
    frames.filter((frame) => {
      try {
        return /youtube(?:-nocookie)?\.com$/.test(new URL(frame.src).hostname)
          && new URL(frame.src).searchParams.get('autoplay') === '1';
      } catch {
        return false;
      }
    }).length
  );
}

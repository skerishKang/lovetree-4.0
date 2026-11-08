// 관계 지도의 순수 계산 한 벌. 화면(network.js)이 실제로 이 함수들을 부른다.
// 일반 스크립트로 불러오고(node 시험은 import), window.LT56Model 하나로 노출한다.
window.LT56Model = (() => {
  // 갈래 점: 중심 c에서 각도·진행률로 뻗은 점. 홀수/짝수 갈래는 좌우로 다르게 휜다.
  function branchPoint(c, angle, step, len, branchIndex) {
    const t = step / (len - 1);
    const curve = Math.sin(t * Math.PI) * (0.10 + branchIndex * 0.012);
    const radius = c.spread * (0.16 + 0.78 * t);
    const ax = angle + curve * (branchIndex % 2 ? 1 : -1);
    return {
      x: c.x + Math.cos(ax) * radius + Math.sin(t * 5 + branchIndex) * 12,
      y: c.y + Math.sin(ax) * radius * 0.80 + Math.cos(t * 4 + branchIndex) * 10
    };
  }

  // 묶음 나누기: 순간을 6묶음으로 나눈다(최소 1개, 올림).
  function groupSizeFor(total) {
    return Math.max(1, Math.ceil(total / 6));
  }

  // 묶음 하나의 이름·개수: "순간 01–06" 처럼 앞뒤 순번을 붙인다.
  function clusterSpan(index, groupSize, total) {
    return {
      name: `순간 ${String(index * groupSize + 1).padStart(2, '0')}–${String(Math.min((index + 1) * groupSize, total)).padStart(2, '0')}`,
      sub: '순간의 연결',
      count: Math.max(0, Math.min(groupSize, total - index * groupSize))
    };
  }

  // 작은 트리 보정: 순간이 36개 이하면 묶음을 세로로 촘촘히(220px 간격) 놓고 무대 높이를 1600으로 줄인다.
  function smallTreeLayout(count) {
    return count <= 36 ? { spacing: 220, baseY: 250, worldHeight: 1600 } : null;
  }

  // 연결선 베지에: 화면 좌표 두 점과 연결 종류로 조절점을 만든다.
  function bezierGeometry(A, B, kind) {
    const dx = B.x - A.x, dy = B.y - A.y;
    let bend = 12;
    if (['bridge', 'bridgeSecondary', 'origin'].includes(kind)) bend = Math.min(64, Math.abs(dx) * 0.10 + 18);
    const sign = dx >= 0 ? 1 : -1;
    return {
      A,
      B,
      cp1: { x: A.x + dx * 0.34 + sign * bend, y: A.y + dy * 0.28 },
      cp2: { x: B.x - dx * 0.30 - sign * bend * 0.55, y: B.y - dy * 0.26 }
    };
  }

  // 손가락 화면의 묶음 맞춤 배율: 0.40~0.62 사이로 묶는다.
  function mobileFit(vw, vh, spread) {
    const raw = Math.min((vw - 26) / (spread * 1.75), (vh - 190) / (spread * 1.25));
    return Math.max(0.40, Math.min(0.62, raw));
  }

  // 경로에 실제로 놓인 연결: 이웃한 두 순간을 잇는 연결을 순서대로 고른다.
  function routeEdges(pid, pathById, edges) {
    const p = pathById[pid];
    if (!p) return [];
    const out = [];
    for (let i = 0; i < p.nodes.length - 1; i++) {
      const e = edges.find((x) => x.a === p.nodes[i] && x.b === p.nodes[i + 1] && x.pathId === pid);
      if (e) out.push(e);
    }
    return out;
  }

  return { branchPoint, groupSizeFor, clusterSpan, smallTreeLayout, bezierGeometry, mobileFit, routeEdges };
})();

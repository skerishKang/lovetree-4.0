// 접근성 검사용 시험 자료(README의 "트리 3권") — 빈 계정이면 검사 전에 넣고 끝나면 되돌린다.
// 셸은 트리가 없으면 안쪽 화면(책장·기억책·보드·지도)을 빈 패널로 대체하므로(screens.mjs의 hasTree 분기),
// 로그인 상태 검사가 조용히 빠지지 않으려면 이 자료가 먼저 있어야 한다. 새 저장 규칙을 만들지 않고
// public/v41/domain.mjs와 같은 모양의 상태를 만든다.
export function needsFixture(trees) {
  return Array.isArray(trees) && trees.length === 0;
}

export function buildFixtureState(clock = new Date().toISOString()) {
  const moment = (treeId, key, parentId, index) => ({
    id: `${treeId}-m${key}`,
    parentId,
    relation: parentId ? '이어짐' : '',
    links: [],
    title: `시험 순간 ${key.toUpperCase()}`,
    note: '',
    emotion: ['설렘', '위로', '벅참'][index % 3],
    date: '2026-11-10',
    url: '',
    createdAt: clock
  });
  const tree = (n, subject) => {
    const treeId = `a11y-t${n}`;
    return {
      id: treeId,
      subject,
      title: subject,
      coverMomentId: `${treeId}-ma`,
      coverDesign: '',
      inbox: false,
      createdAt: clock,
      updatedAt: clock,
      moments: [
        moment(treeId, 'a', null, 0),
        moment(treeId, 'b', `${treeId}-ma`, 1),
        moment(treeId, 'c', `${treeId}-ma`, 2)
      ]
    };
  };
  return { version: 1, trees: [tree(1, '접근성 시험 책 1'), tree(2, '접근성 시험 책 2'), tree(3, '접근성 시험 책 3')] };
}

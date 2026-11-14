// 지도 모양 시험용 나무 세 벌(순수 데이터, 화면·셸 없이 만든다).
// - flat26: 대표 트리 '모아둔 순간'과 같은 평평한 모양 — 첫 순간 하나에 25개가 이어짐.
// - chain10: 깊은 사슬 — 10단으로 이어진 트리.
// - mixed3x4: 섞인 모양 — 첫 순간에서 가지 3개, 각 가지가 깊이 4.
// demoData 모양(runtime.js의 예시 판본)과 실제 기록 모양(tree.moments·tree.edges)을 함께 준다.
const TITLES = [
  '처음 눈에 들어온 무대', '연습실 짧은 영상', '밤새 다시 본 직캠', '처음 저장한 인터뷰',
  '표정이 남은 엔딩 장면', '이 장면 때문에 다음 영상을 찾음', '무대 뒤 한마디', '팬이 올린 짧은 클립',
  '공식 사진 속 손짓', '그날의 플레이리스트', '링크를 따라 발견한 라이브', '다른 멤버와의 장면',
  '댓글에서 찾은 정보', '무대 의상 기록', '다시 본 첫 영상', '친구에게 보낸 링크',
  '콘서트 전날 메모', '처음 간 팝업 스토어', '사진 한 장의 기억', '우연히 들은 라디오',
  '예전 저장을 다시 열다', '그날의 감정 메모', '다음 컴백 티저', '오래 남은 한 문장',
  '새 계절의 첫 저장', '공연 끝나고 밤길 걷기'
];
const EMOTIONS = ['설렘', '몰입', '호기심', '애정', '그리움', '기대'];
const REASONS = [
  '이 장면의 표정이 계속 생각나서 다음 영상을 찾았어요.',
  '짧은 한마디가 궁금증을 남겨 관련 인터뷰로 이어졌어요.',
  '같은 날의 다른 시점을 보고 싶어서 다음 순간을 열었어요.',
  '이 감정이 끝나지 않아 비슷한 무대를 계속 찾아봤어요.',
  '친구에게 보여주고 싶어 다음 링크까지 저장했어요.'
];
const dateOf = i => `2026.${String(1 + (i % 12)).padStart(2, '0')}.${String(1 + (i % 27)).padStart(2, '0')}`;

// moments: [{id, title, date, emotion, memo, first}] — first는 parentId 대신 first 플래그(예시 판본 모양).
// parents: [[부모 id, 자식 id]] — parent 연결(related는 시험에서 다루지 않는다).
function build(names, parents) {
  const demo = names.map((title, i) => ({
    id: `m${String(i + 1).padStart(2, '0')}`,
    title,
    date: dateOf(i),
    emotion: EMOTIONS[i % EMOTIONS.length],
    memo: i % 3 === 0 ? '그때의 소리까지 같이 기억난다.' : '',
    first: i === 0
  }));
  const idOf = i => `m${String(i + 1).padStart(2, '0')}`;
  const edges = parents.map(([from, to], i) => ({ kind: 'parent', from: idOf(from), to: idOf(to), reason: REASONS[i % REASONS.length] }));
  // 실제 기록 모양: parentId·note·url까지 넣어 runtime.js의 두 판본 다 허용한다.
  const moments = demo.map((m, i) => {
    const parent = parents.find(([, to]) => to === i);
    return { id: m.id, title: m.title, date: m.date, emotion: m.emotion, note: m.memo, url: '', parentId: parent ? idOf(parent[0]) : (i === 0 ? null : null) };
  });
  return { demo, moments, edges };
}

// 평평한 26순간: 첫 순간에 25개가 바로 이어진다(대표 트리와 같은 모양).
export function flat26() {
  const names = TITLES.slice(0, 26);
  const parents = [];
  for (let i = 1; i < 26; i++) parents.push([0, i]);
  return { name: 'flat26', ...build(names, parents) };
}

// 깊은 사슬: 10단으로 한 줄로 이어진 트리.
export function chain10() {
  const names = TITLES.slice(0, 10);
  const parents = [];
  for (let i = 1; i < 10; i++) parents.push([i - 1, i]);
  return { name: 'chain10', ...build(names, parents) };
}

// 섞인 모양: 첫 순간에서 가지 3개, 각 가지가 깊이 4(1 + 3×4 = 13순간).
export function mixed3x4() {
  const names = TITLES.slice(0, 13);
  const parents = [];
  for (let b = 0; b < 3; b++) {
    parents.push([0, 1 + b * 4]);
    for (let d = 1; d < 4; d++) parents.push([1 + b * 4 + d - 1, 1 + b * 4 + d]);
  }
  return { name: 'mixed3x4', ...build(names, parents) };
}

// 지도 프레임에 넣을 셸 문맥(LT41) 스텁. demoData·moments를 둘 다 넣는다(runtime.js가 둘을 읽는다).
export function lt41Stub(shape, momentId) {
  return {
    tree: { id: 'shape-test', title: '모양 시험', demoData: { moments: shape.demo }, moments: shape.moments, edges: shape.edges },
    source: 'example',
    momentId
  };
}

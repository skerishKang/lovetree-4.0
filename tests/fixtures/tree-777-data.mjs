// #777 트리 보기 시안 — 시험 데이터 세 벌.
// 앱의 순간 모양 그대로 쓴다: { id, parentId, title, date, thumb, emotion }.
// 배열 순서 = 만든 순서(앱의 moments 배열과 같다). 한 순간에 이어진 순간이 여럿이면 그 순서가 갈림 순서다.
// 썸네일은 저장소 안의 예시 그림만 쓴다(바깥 주소 없음). 일부는 썸네일이 없는 글 카드다.

// domain.mjs 의 EMOTIONS 와 같은 값.
export const EMOTIONS = ['설렘', '위로', '벅참', '그리움', '고마움', '즐거움'];

const TITLES = [
  '첫 무대', '앵콜 직캠', '팬미팅 인사', '콘서트 오프닝', '연습 영상', '라이브 방송', '인터뷰 한 장면',
  '무대 뒤 이야기', '응원법 떼창', '엔딩 요정', '리허설', '커버 무대', '수상 소감', '생일 라이브',
  '첫 1위 하던 날', '안무 영상', '쇼케이스', '거리 공연', '여름 페스티벌', '컴백 첫 방송',
  '교차 편집', '자체 예능 3화', '눈 오던 날의 퇴근길', '라디오 라이브', '팬이 찍은 영상',
  '연말 무대', '첫 단독 콘서트', '마지막 인사', '다시 보는 데뷔 무대', '한여름 밤의 앵콜'
];
const THUMBS = 33;
const DAY = 86400000;

// 씨앗이 같으면 늘 같은 값을 내는 작은 난수(mulberry32). 날짜 간격에만 쓴다.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const two = (n) => String(n).padStart(2, '0');

function maker(prefix, seed) {
  const moments = [];
  const rnd = seeded(seed);
  let day = Date.UTC(2025, 2, 2);
  function add(parentId) {
    const n = moments.length + 1;
    day += (1 + Math.floor(rnd() * 9)) * DAY;
    const d = new Date(day);
    moments.push({
      id: prefix + String(n).padStart(3, '0'),
      parentId,
      title: TITLES[(n * 7 + seed) % TITLES.length],
      date: `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`,
      // 일곱에 하나는 썸네일이 없는 순간(글 카드) — 카드 크기가 제각각인 경우를 시험한다.
      thumb: n > 1 && n % 7 === 4 ? null : `/v41/example-media/ex${two(1 + (n * 5 + seed) % THUMBS)}.webp`,
      emotion: EMOTIONS[(n * 5 + seed) % EMOTIONS.length]
    });
    return moments[moments.length - 1].id;
  }
  // from 뒤로 count개를 한 줄로 잇고 끝 순간의 id를 돌려준다.
  function chain(from, count) {
    let at = from;
    for (let i = 0; i < count; i++) at = add(at);
    return at;
  }
  // from 에서 갈라진 순간 count개(서로는 이어지지 않는다). id 목록을 돌려준다.
  function fan(from, count) {
    const ids = [];
    for (let i = 0; i < count; i++) ids.push(add(from));
    return ids;
  }
  return { moments, add, chain, fan };
}

// 순간 10개: 한 줄기(7개) + 갈림 2(2개짜리, 1개짜리).
function ten() {
  const b = maker('a', 3);
  const r = b.add(null);
  const a3 = b.chain(r, 2);       // 줄기 3번째 = 첫 갈림 지점
  const a4 = b.add(a3);           // 줄기 계속(먼저 생김)
  b.chain(a3, 2);                 // 갈림 1: 나중에 생긴 두 순간
  const a5 = b.add(a4);           // 줄기 5번째 = 둘째 갈림 지점
  b.add(a5);                      // 갈림 2: 먼저 생긴 한 순간
  b.chain(a5, 2);                 // 줄기 끝까지
  return b.moments;
}

// 순간 40개: 한 순간(셋째)에 갈림 27개. 여러 순간을 한꺼번에 옮겨 새 트리를 만들면 실제로 이런 모양이 된다.
function forty() {
  const b = maker('b', 11);
  const r = b.add(null);
  const hub = b.chain(r, 2);
  const kids = b.fan(hub, 27);
  b.chain(kids[0], 4);            // 첫 갈림은 네 순간 더 이어진다
  b.fan(kids[2], 2);              // 셋째 갈림은 다시 둘로 갈린다
  b.chain(kids[8], 2);
  b.chain(kids[19], 2);
  return b.moments;
}

// 순간 120개: 긴 줄기(18개)에 크고 작은 가지, 9갈림(접힘) 한 곳, 5갈림(펼친 채) 한 곳.
function hundredTwenty() {
  const b = maker('c', 29);
  const T = [b.add(null)];
  const grow = () => { T.push(b.add(T[T.length - 1])); };
  const upTo = (n) => { while (T.length < n) grow(); };
  // early = 줄기가 이어지기 전에 생긴 가지(왼쪽), late = 줄기가 이어진 뒤에 생긴 가지(오른쪽).
  upTo(4);
  { // T4 early: 5개 줄 + 둘째에서 2개 곁가지
    const first = b.add(T[3]);
    const second = b.add(first);
    b.chain(second, 3);
    b.chain(second, 2);
  }
  upTo(8);
  b.chain(T[1], 3);               // T2 late: 3개 줄
  { // T8 early: 4개 줄 + 끝에서 3갈림
    const end = b.chain(T[7], 4);
    b.fan(end, 3);
  }
  upTo(11);
  { // T6 late: 6개 줄 + 셋째에서 5갈림(접지 않는 크기)
    const first = b.add(T[5]);
    const third = b.chain(first, 2);
    b.chain(third, 3);
    b.fan(third, 5);
  }
  { // T11 early: 8개 줄 + 셋째에서 3개, 다섯째에서 2개
    const first = b.add(T[10]);
    const third = b.chain(first, 2);
    const fifth = b.chain(third, 2);
    b.chain(fifth, 3);
    b.chain(third, 3);
    b.chain(fifth, 2);
  }
  upTo(15);
  { // T10 late: 9갈림(접힘 3 + 묶음 6). 첫째는 2개, 다섯째는 1개 더 이어진다.
    const kids = b.fan(T[9], 9);
    b.chain(kids[0], 2);
    b.chain(kids[4], 1);
  }
  { // T13 late: 7개 줄 + 둘째에서 4개, 넷째에서 2개
    const first = b.add(T[12]);
    const second = b.add(first);
    const fourth = b.chain(second, 2);
    b.chain(fourth, 3);
    b.chain(second, 4);
    b.chain(fourth, 2);
  }
  { // T15 early: 5개 줄 + 끝에서 2개씩 두 갈래
    const end = b.chain(T[14], 5);
    b.chain(end, 2);
    b.chain(end, 2);
  }
  upTo(17);
  { // T17 early: 3개 줄 + 끝에서 2갈림
    const end = b.chain(T[16], 3);
    b.fan(end, 2);
  }
  upTo(18);
  { // T16 late: 4개 줄 + 둘째에서 2갈림
    const first = b.add(T[15]);
    const second = b.add(first);
    b.chain(second, 2);
    b.fan(second, 2);
  }
  { // 꼭대기(T18): 네 갈래 수관 — 4·3·5·4개
    const top = T[17];
    b.chain(top, 4);
    b.chain(top, 3);
    b.chain(top, 5);
    b.chain(top, 4);
  }
  return b.moments;
}

export const DATASETS = {
  10: { label: '10개', note: '한 줄기 + 갈림 2', build: ten },
  40: { label: '40개', note: '한 순간에 갈림 27개', build: forty },
  120: { label: '120개', note: '긴 줄기 + 가지 여럿', build: hundredTwenty }
};

export function dataset(count) {
  const entry = DATASETS[count];
  if (!entry) throw new Error('시험 데이터는 10·40·120개뿐입니다.');
  const moments = entry.build();
  if (moments.length !== Number(count)) throw new Error(`시험 데이터 개수가 다릅니다: ${moments.length} ≠ ${count}`);
  return moments;
}

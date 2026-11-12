// #467 보드 카드 글자 대비를 "실제 그려진 색"으로 잰다.
// 변수 값끼리 계산하지 않는다: 브라우저가 계산한 글자색(getComputedStyle color)과
// 카드 바탕(배경색 + 그라데이션 색 멈춤, 반투명이면 판 바탕 위에 겹친 색)을 읽어 가장 나쁜 조합을 낸다.
// tests/v41-board-card-contrast.test.mjs와 화면 캡처 스크립트가 같은 함수를 쓴다.

/** 페이지 안에서 실행된다(page.evaluate). 직렬화되므로 바깥 변수를 쓰지 않는다. */
export function measureBoardCardsInPage() {
  const parseColors = (text) => {
    const out = [];
    const re = /rgba?\(([^)]+)\)/g;
    let m;
    while ((m = re.exec(text || ''))) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      if (p.length < 3 || p.some((n) => Number.isNaN(n))) continue;
      out.push({ r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 });
    }
    return out;
  };
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const layerStops = (el) => {
    const cs = getComputedStyle(el);
    return { image: parseColors(cs.backgroundImage), color: parseColors(cs.backgroundColor).filter((c) => c.a > 0) };
  };
  const compose = (stops, unders) => {
    if (!stops.length) return unders;
    const out = [];
    for (const s of stops) for (const u of unders) out.push(over(s, u));
    return out;
  };
  // 판 바탕: .surface의 색 멈춤들(불투명하지 않으면 앱 바탕 위에 겹친다).
  const appEl = document.querySelector('.app') || document.body;
  const appLayers = layerStops(appEl);
  const bodyLayers = layerStops(document.body);
  const black = [{ r: 0, g: 0, b: 0, a: 1 }];
  const appBase = compose(appLayers.image, compose(appLayers.color, compose(bodyLayers.color, black)));
  const surfaceEl = document.querySelector('.surface');
  const surfaceLayers = surfaceEl ? layerStops(surfaceEl) : { image: [], color: [] };
  const surface = compose(surfaceLayers.image, compose(surfaceLayers.color, appBase));
  const cardBackgrounds = (card) => {
    const l = layerStops(card);
    return compose(l.image, compose(l.color, surface));
  };
  const ROLES = [
    ['title', 'h3'],
    ['memo', '.memo'],
    ['date', '.meta > span:first-child'],
    ['mark', '.eyebrow'],
    ['mark', '.firstTag'],
    ['note', '.noteText'],
    ['sub', '.videoTitle'],
    ['sub', '.domain'],
    ['sub', '.keywordOnCard span']
  ];
  const measureCard = (card) => {
    const bgs = cardBackgrounds(card);
    const rows = [];
    for (const [role, sel] of ROLES) {
      for (const el of card.querySelectorAll(sel)) {
        if (!el.textContent.trim() || !el.getClientRects().length) continue;
        const tc = parseColors(getComputedStyle(el).color)[0];
        if (!tc) continue;
        const own = layerStops(el); // 칩처럼 글자 자기 바탕이 있으면 그것도 겹친다.
        let worst = null;
        for (const bg of bgs) {
          const under = compose(own.image, compose(own.color, [bg]))[0];
          const fg = over(tc, under);
          const r = ratio(fg, under);
          if (!worst || r < worst.ratio) worst = { ratio: r, fg: hex(fg), bg: hex(under) };
        }
        rows.push({ role, sel, fg: worst.fg, bg: worst.bg, ratio: Math.round(worst.ratio * 100) / 100 });
      }
    }
    return rows;
  };
  const layer = document.getElementById('cardLayer');
  const cards = [...(layer?.querySelectorAll('.card') || [])];
  const variantOf = (card) => [...card.classList].filter((c) => c === 'first' || c === 'noteCard' || c.startsWith('cardStyle-')).sort().join(' ') || 'base';
  // 실제로 그려진 카드 전부
  const real = cards.map((card) => ({ id: card.dataset.id, variant: variantOf(card), rows: measureCard(card) }));
  // 카드 색 변형 전부: 글이 다 있는 카드 한 장을 복제해 변형 클래스를 붙여 같은 판 위(화면 밖)에서 잰다.
  const sample = cards.find((c) => !c.classList.contains('noteCard') && c.querySelector('h3') && c.querySelector('.memo') && c.querySelector('.meta'))
    || cards.find((c) => !c.classList.contains('noteCard') && c.querySelector('h3') && c.querySelector('.meta'));
  const noteSample = cards.find((c) => c.classList.contains('noteCard'));
  const STYLES = ['photo', 'postit', 'memo', 'rounded', 'film', 'ticket'];
  const synthetic = [];
  const probe = (src, extra) => {
    if (!src) return;
    const clone = src.cloneNode(true);
    clone.className = 'card ' + extra;
    clone.removeAttribute('data-id');
    clone.style.left = '-4000px';
    clone.style.top = '0px';
    clone.querySelector('.firstTag')?.remove();
    if (/\bfirst\b/.test(extra)) {
      const tag = document.createElement('div');
      tag.className = 'firstTag';
      tag.textContent = '첫 순간';
      clone.prepend(tag);
    }
    if (!clone.querySelector('.memo') && !/noteCard/.test(extra)) {
      const memo = document.createElement('div');
      memo.className = 'memo';
      memo.textContent = '메모 시험 글';
      clone.querySelector('.cardBody')?.append(memo);
    }
    layer.appendChild(clone);
    synthetic.push({ variant: extra, rows: measureCard(clone) });
    clone.remove();
  };
  for (const s of STYLES) {
    probe(sample, `cardStyle-${s}`);
    probe(sample, `first cardStyle-${s}`);
    probe(noteSample, `noteCard cardStyle-${s}`);
  }
  const title = [...document.querySelectorAll('.boardTitle h1, .boardTitle p')].map((el) => {
    const fg = parseColors(getComputedStyle(el).color)[0];
    let worst = null;
    for (const bg of surface) { const f = over(fg, bg); const r = ratio(f, bg); if (!worst || r < worst.ratio) worst = { ratio: Math.round(r * 100) / 100, fg: hex(f), bg: hex(bg) }; }
    return { sel: el.tagName.toLowerCase(), ...worst };
  });
  return {
    boardTheme: document.documentElement.getAttribute('data-lt-board-theme') || 'paper',
    appTheme: document.documentElement.getAttribute('data-lt-theme') || 'night',
    bodyTheme: document.body.dataset.theme || '',
    surface: [...new Set(surface.map(hex))],
    zoom: document.getElementById('zoomLabel')?.textContent || '',
    cardCount: cards.length,
    real,
    synthetic,
    title
  };
}

/** 측정 결과를 변형×역할 표(가장 나쁜 값)로 줄인다. */
export function worstByVariant(result) {
  const table = new Map();
  for (const group of [...result.real, ...result.synthetic]) {
    for (const row of group.rows) {
      const key = `${group.variant}|${row.role}`;
      const prev = table.get(key);
      if (!prev || row.ratio < prev.ratio) table.set(key, { variant: group.variant, role: row.role, ratio: row.ratio, fg: row.fg, bg: row.bg, sel: row.sel });
    }
  }
  return [...table.values()].sort((a, b) => a.variant.localeCompare(b.variant) || a.role.localeCompare(b.role));
}

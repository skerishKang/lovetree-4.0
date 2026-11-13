// 책의 순수 계산 한 벌. 화면(book.js·book-extra.js)이 실제로 이 함수들을 부른다.
// 일반 스크립트로 불러오고(node 시험은 import), window.LT59Model 하나로 노출한다.
// 표시 규칙(제목·연결 문구·넘침 판정·tapIntent)은 이미 book-usability.mjs가 한 벌로 갖고 있다.
window.LT59Model = (() => {
  // 펼침면 만들기: 순간을 두 장씩 묶고, 갈래가 있는 면에 갈래 정보를 붙인다.
  // 오른쪽 장이 없으면 "다음 순간을 기다리며" 동반 페이지(합성)를 만든다.
  function buildSpreads(moments) {
const spreads =Array.from({length:Math.ceil(moments.length/2)},(_,i)=>{const toPage=m=>({kind:m.type==='memo'?'note':m.type==='link'?'link':m.type==='video'?'video':'photo',id:m.id,title:m.title,date:m.date,emotion:m.emotion,keywords:[m.emotion||'기록'],source:m.source||'예시 기록',mediaMetadata:m.mediaMetadata||null,first:!!m.first,note:m.memo||m.whyNext||'기억해 두고 싶은 순간',image:m.image,url:m.externalUrl||'',domain:m.source||''});const a=moments[i*2],b=moments[i*2+1];const branchSource=[a,b].find(m=>m?.branch&&m.next&&moments.some(x=>x.id===m.branch)&&moments.some(x=>x.id===m.next));return {eyebrow:`${String(i+1).padStart(2,'0')} · ${a.date}`,why:a.whyNext||'다음 순간으로 이어집니다.',left:toPage(a),right:b?toPage(b):{kind:'companion',synthetic:true,id:a.id+'-end',title:'다음 순간을 기다리며',note:'상단에서 이 순간을 이어 쓸 수 있어요.',date:'',emotion:'',keywords:[],source:''},branch:branchSource?{label:branchSource.title+'에서 갈라지는 길',source:branchSource.id,main:branchSource.next,moment:branchSource.branch,to:Math.floor(moments.findIndex(m=>m.id===branchSource.branch)/2)}:null}});
    return spreads;
  }

  /* #537: 한 장 보기는 펼침면이 아니라 순간 하나를 한 쪽으로 넘긴다(순간 26개면 1/26 … 26/26).
     두 장 보기는 지금처럼 펼침면 하나(1/13 … 13/13)다. 화면의 '위치'는 한 장이면 순간 순번,
     두 장이면 펼침면 순번이므로, 두 뜻을 오가는 변환을 여기 한 벌로 둔다.
     pageSteps: 실제 순간만 순서대로 편 것(합성 동반 쪽은 빠진다) — 한 장의 쪽 순서와 같다. */
  function pageSteps(spreads) {
    const list = [];
    (spreads || []).forEach((spread, index) => {
      for (const side of ['left', 'right']) {
        const moment = spread && spread[side];
        if (moment && !moment.synthetic) list.push({ id: moment.id, spread: index, side });
      }
    });
    return list;
  }

  // 위치 → 펼침면 번호. 두 장에서는 위치가 곧 펼침면 번호다.
  function spreadOfPos(spreads, pos, single) {
    if (!single) return pos;
    const step = pageSteps(spreads)[pos];
    return step ? step.spread : 0;
  }

  // 순간 id → 위치. 한 장에서는 순간 순번, 두 장에서는 그 순간이 든 펼침면 번호(보기 전환에서 쓰는 한 벌).
  function posOfMoment(spreads, id, single) {
    const steps = pageSteps(spreads);
    const at = steps.findIndex((step) => step.id === id);
    if (at < 0) return 0;
    return single ? at : steps[at].spread;
  }

  // 쪽번호: 펼침 번호 × 2 + (왼쪽 1 / 오른쪽 2), 두 자리.
  function folioLabel(spreadIndex, side) {
    return String(spreadIndex * 2 + (side === 'left' ? 1 : 2)).padStart(2, '0');
  }

  // 넘김 각도: next는 -180°, prev는 +180°, 종이 휨은 sin 곡선으로 2.2°.
  function turnAngle(p, dir) {
    return { deg: dir === 'next' ? -180 * p : 180 * p, bend: Math.sin(Math.PI * p) * 2.2 };
  }

  // 연결 요약: 이 순간에서 이어지는 다음 순간 제목들을 한 줄로.
  function connectionSummary(id, moments, edges) {
    const source = moments.find((m) => m.id === id);
    if (!source) return '선택한 순간의 연결 정보가 없습니다.';
    const targets = edges.filter((e) => e.kind === 'parent' && e.from === source.id).map((e) => e.to).map((target) => moments.find((m) => m.id === target)?.title).filter(Boolean);
    return targets.length
      ? `${source.title} → ${targets.join(' / ')} · ${source.whyNext || '연결된 순간'}`
      : `${source.title} · 연결된 다음 순간이 없습니다.`;
  }

  // 다음 순간: 부모 연결로 이어진 다음 순간과 그 이유.
  function nextMomentOf(id, moments, edges, displayTitle) {
    const m = moments.find((x) => x.id === id);
    const next = m && moments.find((x) => x.id === m.next);
    if (!next) return null;
    const edge = edges.find((e) => e.kind === 'parent' && e.from === id && e.to === next.id);
    const title = displayTitle ? displayTitle(next.title, next) : next.title;
    return { id: next.id, title: title || String(next.memo || '').trim(), reason: edge?.reason || '' };
  }

  /* ── #345: '여기까지 온 길' 계산 한 벌 ─────────────────────────────────────
     타임라인 항목·단계·일수·감정 색은 화면이 아니라 여기서 정한다. 화면(book-extra.js)은 그리기만 한다. */

  // 감정 색: 기존 --lt-group-1..6 토큰 번호. 아는 감정은 고정, 모르는 감정은 글자 해시로 안정적으로 고른다.
  const EMOTION_TONES = { 설렘: 1, 그리움: 2, 위로: 3, 벅참: 4, 고마움: 5, 즐거움: 6 };
  function emotionTone(emotion) {
    const value = String(emotion ?? '').trim();
    // #481 L11: 빈 감정은 썸네일 한 벌(thumb-fallback.mjs emotionToneOf)과 같이 1로 둔다.
    // 0은 CSS 규칙이 없어 점이 무색으로 그려졌다(같은 값이 화면마다 다르게 보임).
    if (!value) return 1;
    if (EMOTION_TONES[value]) return EMOTION_TONES[value];
    let hash = 0;
    for (const ch of value) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    return (hash % 6) + 1;
  }

  // 'YYYY-MM-DD'·'YYYY.MM.DD'(뒤에 시각이 붙어도 된다)만 날짜로 읽는다. 없는 날짜·엉뚱한 값은 null.
  function journeyDay(value) {
    const match = String(value ?? '').trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?=$|[ T])/);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const time = Date.UTC(year, month - 1, day);
    const date = new Date(time);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return time;
  }
  // 첫 순간~지금 날짜 차(일). 둘 중 하나라도 날짜가 아니면 null(화면은 'N단계'만 보여 준다).
  function journeyDays(from, to) {
    const start = journeyDay(from), end = journeyDay(to);
    if (start === null || end === null) return null;
    return Math.max(0, Math.round((end - start) / 86400000));
  }

  function youtubeVideoId(url) {
    let parsed;
    try { parsed = new URL(String(url ?? '')); } catch { return ''; }
    const host = parsed.hostname.replace(/^www\./, '');
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) return '';
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0] || '';
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
    }
    const v = parsed.searchParams.get('v') || '';
    if (parsed.pathname === '/watch' && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const shaped = parsed.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})/);
    return shaped ? shaped[1] : '';
  }
  // 칸 썸네일: 사진·내 보관 파일은 그 주소, YouTube는 썸네일, 없으면 ''(화면은 감정 색 사각형).
  function journeyThumb(m) {
    const image = typeof m?.image === 'string' ? m.image : '';
    if (image) return image;
    const url = String(m?.externalUrl || m?.url || '');
    if (/^\/api\/media\//.test(url)) return url;
    const id = youtubeVideoId(url);
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
  }

  /**
   * 처음 순간부터 지금 보는 순간까지의 길. 책의 읽기 순서(배열 순서) 앞부분을 쓴다.
   * 연결 이유는 두 칸 사이에 실제 연결(parent edge)이 있을 때만 쓰고, 없으면 그 순간의 whyNext가
   * 바로 다음 칸을 가리킬 때만 쓴다(예시 기록). 둘 다 없으면 빈 값 — 화면은 그 줄을 생략한다.
   */
  function journeyTimeline(moments, edges, currentId, titleOf) {
    const list = Array.isArray(moments) ? moments : [];
    const safeEdges = Array.isArray(edges) ? edges : [];
    if (!list.length) return { items: [], steps: 0, days: null };
    let end = list.findIndex((m) => m && m.id === currentId);
    if (end < 0) end = list.length - 1;
    const slice = list.slice(0, end + 1);
    const items = slice.map((m, i) => {
      const next = slice[i + 1] || null;
      const edge = next ? safeEdges.find((e) => e && e.kind === 'parent' && e.from === m.id && e.to === next.id) : null;
      const edgeReason = String(edge?.reason ?? '').trim();
      const whyNext = String(m.whyNext ?? '').trim();
      const reason = edgeReason || (next && m.next === next.id ? whyNext : '');
      const title = (titleOf ? titleOf(m.title, m) : String(m.title ?? '').trim())
        || String(m.mediaMetadata?.title ?? '').trim()
        || String(m.memo ?? '').trim()
        || '순간';
      return {
        id: m.id, index: i, title, date: String(m.date ?? ''), emotion: String(m.emotion ?? ''),
        thumb: journeyThumb(m), tone: emotionTone(m.emotion), reason,
        first: i === 0, current: i === slice.length - 1
      };
    });
    return { items, steps: items.length, days: journeyDays(slice[0]?.date, slice[slice.length - 1]?.date) };
  }

  // 책 → 내 트리: 셸 안에서 보고 있고 공유 감상이 아니면 내 트리로 돌아간다.
  function shelfReturn({ source = 'example', embedded = true } = {}) {
    if (!embedded) return 'none';
    if (source === 'share') return 'none';
    return 'shelf';
  }

  return { buildSpreads, folioLabel, turnAngle, connectionSummary, nextMomentOf, emotionTone, journeyDays, journeyTimeline, shelfReturn, pageSteps, spreadOfPos, posOfMoment };
})();

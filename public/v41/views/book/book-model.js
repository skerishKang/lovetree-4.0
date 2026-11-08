// 기억책의 순수 계산 한 벌. 화면(book.js·book-extra.js)이 실제로 이 함수들을 부른다.
// 일반 스크립트로 불러오고(node 시험은 import), window.LT59Model 하나로 노출한다.
// 표시 규칙(제목·연결 문구·넘침 판정·tapIntent)은 이미 book-usability.mjs가 한 벌로 갖고 있다.
window.LT59Model = (() => {
  // 펼침면 만들기: 순간을 두 장씩 묶고, 갈래가 있는 면에 갈래 정보를 붙인다.
  // 오른쪽 장이 없으면 "다음 순간을 기다리며" 동반 페이지(합성)를 만든다.
  function buildSpreads(moments) {
const spreads =Array.from({length:Math.ceil(moments.length/2)},(_,i)=>{const toPage=m=>({kind:m.type==='memo'?'note':m.type==='link'?'link':m.type==='video'?'video':'photo',id:m.id,title:m.title,date:m.date,emotion:m.emotion,keywords:[m.emotion||'기록'],source:m.source||'예시 기록',mediaMetadata:m.mediaMetadata||null,first:!!m.first,note:m.memo||m.whyNext||'기억해 두고 싶은 순간',image:m.image,url:m.externalUrl||'',domain:m.source||''});const a=moments[i*2],b=moments[i*2+1];const branchSource=[a,b].find(m=>m?.branch&&m.next&&moments.some(x=>x.id===m.branch)&&moments.some(x=>x.id===m.next));return {eyebrow:`${String(i+1).padStart(2,'0')} · ${a.date}`,why:a.whyNext||'다음 순간으로 이어집니다.',left:toPage(a),right:b?toPage(b):{kind:'companion',synthetic:true,id:a.id+'-end',title:'다음 순간을 기다리며',note:'상단에서 이 순간을 이어 쓸 수 있어요.',date:'',emotion:'',keywords:[],source:''},branch:branchSource?{label:branchSource.title+'에서 갈라지는 길',source:branchSource.id,main:branchSource.next,moment:branchSource.branch,to:Math.floor(moments.findIndex(m=>m.id===branchSource.branch)/2)}:null}});
    return spreads;
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
    const title = displayTitle ? displayTitle(next.title) : next.title;
    return { id: next.id, title: title || String(next.memo || '').trim(), reason: edge?.reason || '' };
  }

  return { buildSpreads, folioLabel, turnAngle, connectionSummary, nextMomentOf };
})();

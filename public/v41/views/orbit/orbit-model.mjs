// 첫 화면 궤도의 순수 함수. 화면(DOM) 없이 node에서 시험할 수 있다.
// 조건·문구·계산은 원본 그대로 옮겼다.
const escapeRecord=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}
[c]));

// 배치값(ring·baseAngle)을 스스로 가진 순간인지 — 예시 기록은 모두 갖고 실제 기록은 갖지 않는다.
const hasLayout=m=>typeof m.ring==='string'&&'baseAngle' in m;

// 순번 모양 id(m01)는 id의 숫자를, 그 밖의 id는 목록 자리를 쓴다.
function momentSeq(c){const n=/^m(\d+)$/.exec(String(c.id));return n?c.id.slice(1):CARDS.indexOf(c)+1}

export { escapeRecord, hasLayout, momentSeq };

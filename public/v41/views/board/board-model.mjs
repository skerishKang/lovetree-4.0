// 기억 보드의 순수 계산. 화면(DOM) 없이 node에서 시험한다.
export function escapeHTML(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
// 카드 자리: 8장씩 줄을 바꾸고, 세로는 400px 간격, 회전은 -2·0·2도.
export function cardPosition(i){return {x:150+(i%8)*280,y:150+Math.floor(i/8)*400,rot:(i%3-1)*2}}
// 실(연결선) 베지에: 두 핀 사이를 아래로 늘어뜨린다. dx가 클수록 처짐이 커지되 140px까지.
export function threadPath(a,b){const dx=b.x-a.x,sag=Math.min(140,55+Math.abs(dx)*.08),cy=Math.max(a.y,b.y)+sag;
  return {sag,cy,d:`M${a.x},${a.y} C${a.x},${cy} ${b.x},${cy} ${b.x},${b.y}`}}
// 전체 맞춤 배율: 무대 여백 40px, 최대 0.92배.
export function fitZoom(vw,vh){return Math.min((vw-40)/2400,(vh-40)/2200,.92)}
// 확대 범위: 손가락(모바일)은 0.20~1.55, 그 밖은 0.24~1.55.
export function clampZoom(z,mobile){const lo=mobile?.20:.24;return Math.min(1.55,Math.max(lo,z))}
// 연결 지우기: 목록에서 id 하나만 뺀 새 배열을 준다(원본은 건드리지 않는다).
export function removeConnection(list,id){return list.filter(c=>c.id!==id)}
// 지우기 허용 판단: 실제 기록(읽기 전용)이면 안내 문구를 함께 준다.
export function editGuard(canEdit){return canEdit?{blocked:false,message:''}:{blocked:true,message:'읽기 전용에서는 연결을 변경할 수 없어요.'}}
// 목록 필터: 종류(전체·사진·영상·메모)와 키워드로 순간을 고른다.
export function filterMoments(list,kind='all',keyword='all'){return list.filter(m=>(kind==='all'||m.originalType===kind||m.type===kind)&&(keyword==='all'||(m.keywords||[]).includes(keyword)))}

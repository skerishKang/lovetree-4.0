// 단순(기본) / 고급 보기: 셸이 화면을 그릴 때마다 postMessage {type:'lt41-advanced', value:true|false}로 알려 준다.
// 메시지가 없으면 단순으로 시작한다. 숨김은 CSS(.lt-advanced)만 담당하고 기능 코드는 그대로 둔다.
export function applyAdvancedMode(doc, on) {
  doc.body.classList.toggle('lt-advanced', on === true);
  return doc.body.classList.contains('lt-advanced');
}

export function installAdvancedMode(win, doc) {
  win.addEventListener('message', (event) => {
    if (event.origin !== win.location.origin) return;
    const data = event.data;
    if (!data || data.type !== 'lt41-advanced') return;
    applyAdvancedMode(doc, data.value === true);
  });
}

if (typeof window !== 'undefined' && window.document) installAdvancedMode(window, document);

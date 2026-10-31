// Small-screen access to existing board/map selection and reader actions.
window.LTMobileMoments=({moments,selected,onSelect,onOpen,openLabel,tone='light'})=>{
 const root=document.createElement('nav');root.className='lt-moment-picker';root.dataset.tone=tone;root.setAttribute('aria-label','순간 탐색');
 const label=document.createElement('label'),caption=document.createElement('span'),select=document.createElement('select'),open=document.createElement('button');
 caption.textContent='선택한 순간';select.setAttribute('aria-label','순간 선택');
 moments.forEach((m,i)=>{const option=document.createElement('option');option.value=m.id;option.textContent=`${i+1}. ${m.title}`;select.append(option);});
 select.value=selected||moments[0]?.id||'';select.onchange=()=>onSelect(select.value);
 open.type='button';open.textContent=openLabel;open.onclick=()=>onOpen(select.value);
 label.append(caption,select);root.append(label,open);document.querySelector('.app')?.append(root);
 const style=document.createElement('style');style.textContent=`
 .lt-moment-picker{display:none}
 @media(max-width:699px){.lt-moment-picker{position:absolute;display:flex;align-items:flex-end;gap:8px;left:8px;right:8px;top:64px;z-index:43;padding:8px;border:1px solid #ded7e0;border-radius:14px;background:rgba(255,255,255,.96);color:#302a35;box-shadow:0 6px 24px #21142412}.lt-moment-picker label{display:block;flex:1;min-width:0}.lt-moment-picker label>span{display:block;font-size:11px;margin-bottom:4px}.lt-moment-picker select{width:100%;min-width:0;height:44px;font:inherit;font-size:14px;border:1px solid #d7cbdc;border-radius:9px;background:#fff;color:#302a35;padding:0 7px}.lt-moment-picker button{min-height:44px;min-width:88px;border:0;border-radius:9px;background:#65446f;color:#fff;font:inherit;font-size:13px;padding:0 10px}.lt-moment-picker[data-tone=dark]{background:rgba(33,22,41,.96);border-color:#6a526c;color:#f6eaf5}.lt-moment-picker select:focus-visible,.lt-moment-picker button:focus-visible{outline:3px solid #ae79c7;outline-offset:2px}}`;
 document.head.append(style);
 return {select:id=>{if(moments.some(m=>m.id===id))select.value=id;}};
};

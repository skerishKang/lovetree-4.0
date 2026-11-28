/* === V1.2 ACTUAL YOUTUBE MEDIA / SOURCE-SWITCH PATCH === */
(function(){
  // #480 L12: 썸네일은 공용 한 벌(thumb-fallback.mjs)만 쓴다. 예전에는 이 파일이 자체 SVG(youtubePreviewAsset)를
  // 돌려줬는데, board-extras.js에서 그 함수를 없애며 여기 남은 참조가 페이지 오류를 냈다. 이제 공용 후보를 쓴다.
  const V12_FALLBACK = (url) => {
    const api = window.LTThumbFallback;
    if (!api) return '';
    const list = api.thumbnailCandidates({ url: String(url || '') }, { autoLoad: true });
    return list[0] || '';
  };
  // #1060: ytimg 단계 주소 글자는 정본(youtube-id.mjs) 한 벌에서만 만든다.
  // 보드 상세의 크기 순서(maxres → hq → mq)와 onerror 대체는 그대로 두고 크기 옵션만 넘긴다.
  const stageThumb = (id, stage) => {
    const api = globalThis.LTYouTubeId || globalThis.LTThumbFallback;
    return api && typeof api.youtubeStageThumbUrl === 'function' ? api.youtubeStageThumbUrl(id, stage) : '';
  };
  const REAL_YT_TEST = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  function ytId(url=''){ return youtubeId(url); }
  function ytMax(url=''){ let id=ytId(url); return id?stageThumb(id,'maxresdefault'):''; }
  function ytHQ(url=''){ let id=ytId(url); return id?stageThumb(id,'hqdefault'):''; }
  function ytEmbed(url=''){ let id=ytId(url); return id?`https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1&autoplay=1`:''; }
  function isYtMoment(m){ return !!m && (m.type==='youtube' || (m.type==='video' && m.videoSource==='youtube')); }
  function originalUrl(m){ return m?.sourceUrl || m?.url || ''; }
  window.__ytThumbFail = function(img){
    let stage=img.dataset.stage||'hq', wrap=img.closest('.ytThumbWrap'), st=wrap?.querySelector('.ytLoadState');
    if(stage==='hq' && img.dataset.mq){ img.dataset.stage='mq'; img.src=img.dataset.mq; if(st)st.textContent='YouTube 미리보기를 불러오는 중'; return; }
    if(stage==='max' && img.dataset.hq){ img.dataset.stage='hq'; img.src=img.dataset.hq; if(st)st.textContent='YouTube 미리보기를 불러오는 중'; return; }
    if(stage==='hq' || stage==='mq'){ img.dataset.stage='fallback'; if(wrap&&window.LTThumbFallback){wrap.outerHTML=window.LTThumbFallback.fallbackCardMarkup({url:img.dataset.url||'',title:'',emotion:'설렘'},{writable:!LTDEMO.readOnly,videoUnavailable:true,variant:'board'});return;} img.src=img.dataset.fallback; if(st){st.textContent='미리보기를 불러오지 못했어요 · 오프라인 미리보기';st.className='ytLoadState fail'}; return; }
    if(st){st.textContent='미리보기를 불러오지 못했어요';st.className='ytLoadState fail'}
  };
  window.__ytThumbLoad = function(img){
    if(img.naturalWidth===120&&img.naturalHeight===90&&img.dataset.stage!=='fallback'){window.__ytThumbFail(img);return;}
    let wrap=img.closest('.ytThumbWrap'), st=wrap?.querySelector('.ytLoadState'); if(!st)return; if(img.dataset.stage!=='fallback'){st.textContent='실제 YouTube 썸네일';st.className='ytLoadState ok'}
  };
  function ytMediaHTML(url, extra=''){
    let id=ytId(url), fallback=V12_FALLBACK(url||'VIDEO');
    if(!id) return `<div class="ytThumbWrap"><img src="${fallback}" alt="YouTube preview"><span class="ytLoadState fail">유효한 YouTube URL을 입력하세요</span>${extra}</div>`;
    let mq=stageThumb(id,'mqdefault');
    return `<div class="ytThumbWrap"><img src="${ytHQ(url)}" data-hq="${ytHQ(url)}" data-mq="${mq}" data-url="${esc(url||'')}" data-fallback="${fallback}" data-stage="hq" onload="__ytThumbLoad(this)" onerror="__ytThumbFail(this)" alt="YouTube thumbnail" referrerpolicy="no-referrer"><span class="ytLoadState">YouTube 미리보기를 불러오는 중</span><span class="ytSourceBadge">YOUTUBE</span>${extra}</div>`;
  }
  function armYTThumbs(root=document){root.querySelectorAll('.ytThumbWrap img[data-stage]').forEach(img=>{if(img.dataset.timeoutArmed)return;img.dataset.timeoutArmed='1';setTimeout(()=>{if((!img.complete||!img.naturalWidth)&&img.dataset.stage==='max')window.__ytThumbFail(img)},1800);setTimeout(()=>{if((!img.complete||!img.naturalWidth)&&img.dataset.stage==='hq')window.__ytThumbFail(img)},3600)})}
  const ytObserver=new MutationObserver(()=>armYTThumbs());ytObserver.observe(document.body,{childList:true,subtree:true});setTimeout(()=>armYTThumbs(),50);
  window.__LT58YT={id:ytId,max:ytMax,hq:ytHQ,embed:ytEmbed,mediaHTML:ytMediaHTML,isYtMoment,originalUrl,armYTThumbs};
  const board=(window.LT58Board=window.LT58Board||{});
  const cards=(board.cards=board.cards||{});
  cards.media={ytId,originalUrl};
  // #480 L12: 보드가 다시 정의하지 않고 board-extras.js의 한 벌(공용 후보의 첫 주소)을 그대로 쓴다.
  // (이 두 줄이 있으면 썸네일 주소가 화면마다 달라진다 — board-extras.js에서 온 공용 값을 덮어쓰지 않는다.)

  /* Existing sample YouTube moment now uses a real source URL. */
  moments.forEach(m=>{
    if(m.type==='youtube'){
      if(!ytId(m.url||'')) m.url=REAL_YT_TEST;
      m.sourceUrl=m.url;
      m.thumbnailUrl=ytMax(m.url);
      m.videoId=ytId(m.url);
      m.source=m.source&&m.source.includes('sample')?'YouTube · sample':m.source||'YouTube';
    }
    if(m.type==='video' && !m.videoSource) m.videoSource='local';
  });

  /* Composer: VIDEO supports local or YouTube source; VIDEO LINK remains a direct YouTube 순간. */
  formFor=function(type){
    let area=$('#formArea');
    if(type==='photo') area.innerHTML='<input class="field" id="mediaFile" type="file" accept="image/*" aria-label="그림 파일 고르기"><div class="netNote">로컬 이미지는 브라우저 안에서 미리 보고 카드에 꽂습니다.</div>';
    else if(type==='video') area.innerHTML=`<div class="label">영상 소스</div><div class="videoSourceChoice"><label><input type="radio" name="addVideoSource" value="local" checked> 로컬 영상</label><label><input type="radio" name="addVideoSource" value="youtube"> YouTube 링크</label></div><div class="videoSourcePanel" id="addVideoLocal"><input class="field" id="mediaFile" type="file" accept="video/*" aria-label="영상 파일 고르기"><div class="netNote">선택/hover 시 muted preview.</div></div><div class="videoSourcePanel" id="addVideoYoutube" hidden><input class="field" id="videoUrlField" placeholder="https://youtube.com/watch?v=..." value="${REAL_YT_TEST}" aria-label="YouTube 링크 주소"><div class="netNote">실제 YouTube 썸네일을 먼저 불러오고 실패할 때만 오프라인 미리보기로 전환합니다.</div></div>`;
    else if(type==='link') area.innerHTML='<input class="field" id="urlField" placeholder="https://..." value="https://lovetree.example/memory" aria-label="링크 주소"><div class="netNote">Prototype metadata parser · 실제 crawler 아님.</div>';
    else if(type==='youtube') area.innerHTML=`<input class="field" id="urlField" placeholder="https://youtube.com/watch?v=..." value="${REAL_YT_TEST}" aria-label="YouTube 링크 주소"><div class="netNote">watch?v= / youtu.be / shorts URL을 지원합니다. 실제 thumbnail → HQ → offline fallback 순서입니다.</div>`;
    else area.innerHTML='<textarea class="field" id="noteField" rows="3" placeholder="남기고 싶은 문장" aria-label="마음 한마디">좋아하게 된 이유를 잊고 싶지 않았어요.</textarea>';
    area.insertAdjacentHTML('beforeend',styleFieldsHTML('add',{emotion:$('#momentEmotion').value||'설렘',source:type==='photo'?'Local image':type==='video'?'Video source':type==='note'?'마음 한마디':type==='youtube'?'YouTube':'Prototype link metadata',pinStyle:defaultPinStyle,cardStyle:defaultCardStyle,keywords:[]}));
    bindKeywordPicker('add',updateComposerPreview);
    area.querySelectorAll('input,select,textarea').forEach(x=>x.addEventListener('input',updateComposerPreview));
    $('#mediaFile')?.addEventListener('change',updateComposerPreview);$('#urlField')?.addEventListener('input',updateComposerPreview);$('#videoUrlField')?.addEventListener('input',updateComposerPreview);
    area.querySelectorAll('input[name="addVideoSource"]').forEach(r=>r.addEventListener('change',()=>{let yt=r.value==='youtube'&&r.checked;$('#addVideoLocal').hidden=yt;$('#addVideoYoutube').hidden=!yt;updateComposerPreview()}));
    setTimeout(updateComposerPreview,0);
  };
  function addVideoSource(){return document.querySelector('input[name="addVideoSource"]:checked')?.value||'local'}
  updateComposerPreview=function(){
    let type=addType,title=$('#momentTitle').value||'새로운 순간',memo=$('#momentMemo').value||'',emotion=$('#addEmotion')?.value||'설렘',media='';
    if(type==='note') media=`<div class="previewMedia previewNote">“${esc($('#noteField')?.value||memo)}”</div>`;
    else if(type==='youtube') media=`<div class="previewMedia">${ytMediaHTML($('#urlField')?.value||'')}</div>`;
    else if(type==='video'&&addVideoSource()==='youtube') media=`<div class="previewMedia">${ytMediaHTML($('#videoUrlField')?.value||'')}</div>`;
    else if(type==='video'&&$('#mediaFile')?.files?.[0]){let u=URL.createObjectURL($('#mediaFile').files[0]);media=`<div class="previewMedia"><video src="${u}" muted playsinline controls></video></div>`}
    else {let file=$('#mediaFile')?.files?.[0],asset=file?URL.createObjectURL(file):(type==='link'?ASSET.link:type==='video'?ASSET.first:ASSET.glance);media=`<div class="previewMedia"><img src="${asset}" alt="새 순간 그림 미리보기" data-fallback="${ASSET.link}" onerror="this.onerror=null;this.src=this.dataset.fallback"></div>`}
    $('#composerPreview').innerHTML=`<div class="previewCard"><span class="previewPin"></span>${media}<div class="previewTypeRow">${esc(type.toUpperCase())} · ${esc(emotion)}${type==='video'?' · '+(addVideoSource()==='youtube'?'YOUTUBE':'LOCAL'):''}</div><h3 class="previewTitle">${esc(title)}</h3><div class="previewMemo">${esc(memo)}</div></div>`;
  };
  confirmAdd=function(){
    let id=newBoardId(),type=addType,title=$('#momentTitle').value||'새로운 순간',emotion=$('#addEmotion')?.value||'설렘',memo=$('#momentMemo').value||'',source=$('#addSource')?.value||'내 보관함',asset=ASSET.note,video=null,url=null,sourceUrl=null,videoSource=null,videoId='';let file=$('#mediaFile')?.files?.[0];
    if(type==='photo'&&file) asset=URL.createObjectURL(file); else if(type==='photo')asset=ASSET.glance;
    if(type==='video'){
      videoSource=addVideoSource();
      if(videoSource==='youtube'){url=$('#videoUrlField')?.value||'';sourceUrl=url;videoId=ytId(url);asset=ytMax(url)||V12_FALLBACK(url);video=null;source=source||'YouTube'}
      else {if(file){video=URL.createObjectURL(file);asset=ASSET.first}else{video=ASSET.video;asset=ASSET.first}sourceUrl='';}
    }
    if(type==='link'){url=$('#urlField')?.value||'https://lovetree.example';asset=ASSET.link}
    if(type==='youtube'){url=$('#urlField')?.value||'';sourceUrl=url;videoId=ytId(url);asset=ytMax(url)||V12_FALLBACK(url);source=source||'YouTube'}
    if(type==='note')memo=$('#noteField')?.value||memo;
    let n={id,type,title,emotion,date:LTLocalDate.localDateOnly(),source,memo,x:620+(moments.length%3)*120,y:360+(moments.length%2)*100,rot:[-4,3,-2,4,2][moments.length%5],color:['rose','violet','cyan','amber'][moments.length%4],asset,video,url,sourceUrl,videoId,videoSource,duration:'00:03',keywords:selectedKeywords('add'),pinStyle:$('#addPinStyle')?.value||defaultPinStyle,cardStyle:$('#addCardStyle')?.value||defaultCardStyle,privacy:'PRIVATE',thumbnailUrl:isYtMoment({type,videoSource})?ytMax(url||sourceUrl||''):'',createdOrder:Math.max(...moments.map(m=>m.createdOrder||0))+1};
    $('#addModal').classList.remove('open');addMomentV11(n,lastParentId);
  };

  openEdit=function(){
    const m=moments.find(x=>x.id===selected);if(!m||LTDEMO.readOnly)return;
    parent.postMessage({type:globalThis.LT41_MSG.write,mode:'edit',treeId:LTDEMO.treeId,momentId:m.id},location.origin);
  };
  openViewer=function(id){
    const m=moments.find(x=>x.id===id);if(!m)return;
    const url=originalUrl(m)||m.url||'';
    LTMedia.openLightbox(url,titleMain(m)||'순간',LTMedia.verticalVideo(url,m.mediaMetadata),{head:`${LTLabels.type(m.originalType||m.type)} · ${m.date} · ${m.emotion}`,source:m.source||'',url:originalUrl(m)||'',keywords:m.keywords||[],memo:m.memo||''});
  };

  /* Wire overwritten handlers and render actual YouTube source. */
  $('#editMomentBtn').onclick=openEdit;$('#deleteMomentBtn').onclick=()=>{const m=moments.find(x=>x.id===selected);if(!m||LTDEMO.readOnly)return;parent.postMessage({type:globalThis.LT41_MSG.deleteMoment,treeId:LTDEMO.treeId,momentId:m.id},location.origin);};$('#confirmAdd').onclick=()=>confirmAdd();
  renderCards();renderThreads();updateKeywordFilter();formFor(addType);boardStartView();applyPathHighlight();addEventListener('DOMContentLoaded',bootDetailPanel,{once:true});
  // #627: 꼬리표 줄 모듈(tag-line.mjs)이 늦게 붙는다 — 카드 칩은 규칙이 도착하면 한 번 다시 그린다.
  addEventListener('lt41-tagline-ready',()=>{if(moments.some(m=>(m.keywords||[]).length))renderCards()});
  // #627: 꼬리표 저장은 iframe을 다시 그리지 않는 길(boardSync)이라 답으로 카드 사본의 keywords만 바꾼다.
  addEventListener('lt41-tags-changed',e=>{const d=e.detail||{};const m=moments.find(x=>x.id===d.momentId);if(m&&Array.isArray(d.keywords)&&m.keywords.join('\u0000')!==d.keywords.join('\u0000')){m.keywords=[...d.keywords];renderCards()}});
  // #1378: 공용 썸네일·대체 그림은 유지하며 재생 클릭은 크게 보기로 이동합니다.
  const labelBoardYoutube=()=>$('#cardLayer').querySelectorAll('.card .lt-media [data-lt-play]').forEach(b=>b.setAttribute('aria-label','영상 크게 보기'));
  labelBoardYoutube();
  new MutationObserver(labelBoardYoutube).observe($('#cardLayer'),{childList:true,subtree:true});
  let boardYoutubePointer=null;
  const cardLayerYoutube=$('#cardLayer');
  cardLayerYoutube.addEventListener('pointerdown',e=>{
    const card=e.target.closest('.card[data-id]');
    if(card&&ytId(originalUrl(moments.find(m=>m.id===card.dataset.id)))){
      boardYoutubePointer={id:card.dataset.id,x:e.clientX,y:e.clientY,moved:false};
    }else boardYoutubePointer=null;
  },true);
  cardLayerYoutube.addEventListener('pointermove',e=>{
    if(boardYoutubePointer&&Math.hypot(e.clientX-boardYoutubePointer.x,e.clientY-boardYoutubePointer.y)>6){
      boardYoutubePointer.moved=true;
    }
  },true);
  cardLayerYoutube.addEventListener('pointercancel',()=>{boardYoutubePointer=null},true);
  window.addEventListener('click',e=>{
    const card=e.target.closest('.card[data-id]');
    if(!card||!ytId(originalUrl(moments.find(m=>m.id===card.dataset.id))))return;
    // 본문 선택·끌기는 그대로 두고 영상의 재생 표시만 크게 보기로 연결합니다.
    if(!e.target.closest('[data-lt-play]'))return;
    if(e.detail!==0&&boardYoutubePointer?.id===card.dataset.id&&boardYoutubePointer.moved)return;
    e.preventDefault();e.stopImmediatePropagation();
    openViewer(card.dataset.id);
    boardYoutubePointer=null;
  },true);
  document.addEventListener('lt-media-lightbox-open',()=>pushBoardPanel('viewer'));
  window.__LT58V12={...window.__LT58V11,ytId,ytMax,ytHQ,ytEmbed,isYtMoment,openViewer,openEdit,get cinema(){return typeof cinemaV11!=='undefined'?{...cinemaV11}:null},get state(){return{moments:moments.length,connections:connections.length,selected,theme:document.body.dataset.theme,ytMoments:moments.filter(isYtMoment).map(m=>({id:m.id,url:originalUrl(m),videoId:ytId(originalUrl(m)),thumb:ytMax(originalUrl(m)),source:m.videoSource||m.type}))}}};
})();

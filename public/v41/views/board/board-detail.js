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
  const REAL_YT_TEST = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  function ytId(url=''){ return youtubeId(url); }
  function ytMax(url=''){ let id=ytId(url); return id?`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`:''; }
  function ytHQ(url=''){ let id=ytId(url); return id?`https://i.ytimg.com/vi/${id}/hqdefault.jpg`:''; }
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
    let mq=`https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
    return `<div class="ytThumbWrap"><img src="${ytHQ(url)}" data-hq="${ytHQ(url)}" data-mq="${mq}" data-url="${esc(url||'')}" data-fallback="${fallback}" data-stage="hq" onload="__ytThumbLoad(this)" onerror="__ytThumbFail(this)" alt="YouTube thumbnail" referrerpolicy="no-referrer"><span class="ytLoadState">YouTube 미리보기를 불러오는 중</span><span class="ytSourceBadge">YOUTUBE</span>${extra}</div>`;
  }
  function armYTThumbs(root=document){root.querySelectorAll('.ytThumbWrap img[data-stage]').forEach(img=>{if(img.dataset.timeoutArmed)return;img.dataset.timeoutArmed='1';setTimeout(()=>{if((!img.complete||!img.naturalWidth)&&img.dataset.stage==='max')window.__ytThumbFail(img)},1800);setTimeout(()=>{if((!img.complete||!img.naturalWidth)&&img.dataset.stage==='hq')window.__ytThumbFail(img)},3600)})}
  const ytObserver=new MutationObserver(()=>armYTThumbs());ytObserver.observe(document.body,{childList:true,subtree:true});setTimeout(()=>armYTThumbs(),50);
  window.__LT58YT={id:ytId,max:ytMax,hq:ytHQ,embed:ytEmbed,mediaHTML:ytMediaHTML,isYtMoment,originalUrl,armYTThumbs};
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

  const v11CardHTML=cardHTML;
  cardHTML=function(m){
    let media='';
    if(m.url)media=LTMedia.markup(m.url,m.title,m.mediaMetadata,m.id,null,{emotion:m.emotion,date:m.date,note:m.memo},{compact:true});
    else if(m.type==='note') media=`<div class="noteText">“${esc(m.memo)}”</div>`;
    else if(isYtMoment(m)) media=`<div class="media linkMedia">${ytMediaHTML(originalUrl(m),'<span class="playBadge">▶</span>')}</div>`;
    else if(m.type==='video') media=`<div class="media"><video muted playsinline loop poster="${m.asset}" src="${m.video||''}"></video><span class="playBadge">▶</span><span class="duration">${m.duration||'00:03'}</span></div>`;
    else media=`<div class="media ${m.type==='link'?'linkMedia':''}"><img src="${m.asset}" data-fallback="${ASSET.link}" onerror="this.onerror=null;this.src=this.dataset.fallback" alt=""></div>`;
    // #601: 카드는 훑기용 — 큰 썸네일 + 제목 2줄 + 감정·날짜 한 줄만. 마음·출처·키워드·크게 보기는 상세가 맡는다.
    let heading=titleMain(m);
    return `<article class="card ${m.first?'first':''} ${m.type==='note'?'noteCard':''} ${pinClass(m)} ${cardClass(m)}" data-id="${m.id}" style="left:${m.x}px;top:${m.y}px;--rot:${m.rot}deg;--pin:${colors[m.color]};--halo:${colors[m.color]}55">${m.first?'<div class="firstTag">첫 순간</div>':''}<button class="pin" data-pin="${m.id}" aria-hidden="true" tabindex="-1"></button>${media}<div class="cardBody"><h3 class="cardTitle">${esc(heading)}</h3><div class="cardMeta"><span class="emotionDot"></span>${esc(m.emotion)} · ${esc(dateText(m.date))}</div></div></article>`;
  };

  /* Composer: VIDEO supports local or YouTube source; VIDEO LINK remains a direct YouTube 순간. */
  formFor=function(type){
    let area=$('#formArea');
    if(type==='photo') area.innerHTML='<input class="field" id="mediaFile" type="file" accept="image/*"><div class="netNote">로컬 이미지는 브라우저 안에서 미리 보고 카드에 꽂습니다.</div>';
    else if(type==='video') area.innerHTML=`<div class="label">영상 소스</div><div class="videoSourceChoice"><label><input type="radio" name="addVideoSource" value="local" checked> 로컬 영상</label><label><input type="radio" name="addVideoSource" value="youtube"> YouTube 링크</label></div><div class="videoSourcePanel" id="addVideoLocal"><input class="field" id="mediaFile" type="file" accept="video/*"><div class="netNote">선택/hover 시 muted preview.</div></div><div class="videoSourcePanel" id="addVideoYoutube" hidden><input class="field" id="videoUrlField" placeholder="https://youtube.com/watch?v=..." value="${REAL_YT_TEST}"><div class="netNote">실제 YouTube 썸네일을 먼저 불러오고 실패할 때만 오프라인 미리보기로 전환합니다.</div></div>`;
    else if(type==='link') area.innerHTML='<input class="field" id="urlField" placeholder="https://..." value="https://lovetree.example/memory"><div class="netNote">Prototype metadata parser · 실제 crawler 아님.</div>';
    else if(type==='youtube') area.innerHTML=`<input class="field" id="urlField" placeholder="https://youtube.com/watch?v=..." value="${REAL_YT_TEST}"><div class="netNote">watch?v= / youtu.be / shorts URL을 지원합니다. 실제 thumbnail → HQ → offline fallback 순서입니다.</div>`;
    else area.innerHTML='<textarea class="field" id="noteField" rows="3" placeholder="남기고 싶은 문장">좋아하게 된 이유를 잊고 싶지 않았어요.</textarea>';
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
    if(type==='note') media=`<div class="previewMedia" style="background:#fff6dd;color:#4d3d50;padding:20px;font-size:16px">“${esc($('#noteField')?.value||memo)}”</div>`;
    else if(type==='youtube') media=`<div class="previewMedia">${ytMediaHTML($('#urlField')?.value||'')}</div>`;
    else if(type==='video'&&addVideoSource()==='youtube') media=`<div class="previewMedia">${ytMediaHTML($('#videoUrlField')?.value||'')}</div>`;
    else if(type==='video'&&$('#mediaFile')?.files?.[0]){let u=URL.createObjectURL($('#mediaFile').files[0]);media=`<div class="previewMedia"><video src="${u}" muted playsinline controls></video></div>`}
    else {let file=$('#mediaFile')?.files?.[0],asset=file?URL.createObjectURL(file):(type==='link'?ASSET.link:type==='video'?ASSET.first:ASSET.glance);media=`<div class="previewMedia"><img src="${asset}" data-fallback="${ASSET.link}" onerror="this.onerror=null;this.src=this.dataset.fallback"></div>`}
    $('#composerPreview').innerHTML=`<div class="previewCard"><span class="previewPin"></span>${media}<div style="margin-top:12px;font-size:9px;color:#64566f">${esc(type.toUpperCase())} · ${esc(emotion)}${type==='video'?' · '+(addVideoSource()==='youtube'?'YOUTUBE':'LOCAL'):''}</div><h3 style="margin:5px 0;color:#34283d">${esc(title)}</h3><div style="font-size:10px;color:#5d4f66">${esc(memo)}</div></div>`;
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

  function videoEditBlock(m){let src=m.videoSource||'local',yt=src==='youtube';return `<div class="label">VIDEO SOURCE</div><div class="videoSourceChoice"><label><input type="radio" name="editVideoSource" value="local" ${!yt?'checked':''}> 로컬 영상</label><label><input type="radio" name="editVideoSource" value="youtube" ${yt?'checked':''}> YouTube 링크</label></div><div class="videoSourcePanel" id="editVideoLocal" ${yt?'hidden':''}><input class="field" id="editMediaFile" type="file" accept="video/*"><div class="netNote">순간 ID·날짜·Connection은 유지하고 미디어만 교체합니다.</div></div><div class="videoSourcePanel" id="editVideoYoutube" ${!yt?'hidden':''}><input class="field" id="editVideoUrl" value="${esc(originalUrl(m)||REAL_YT_TEST)}"><div class="netNote">YouTube URL로 바꿔도 순간 provenance와 board position은 유지합니다.</div></div>`}
  editMediaFields=function(m){
    if(m.type==='photo')return `<div class="label">PHOTO</div><div class="netNote">기존 이미지 미리보기 · 교체하거나 기본 상태로 복귀할 수 있어요.</div><input class="field" id="editMediaFile" type="file" accept="image/*"><button type="button" class="miniBtn" id="removePhoto" style="margin-top:7px">이미지 제거</button>`;
    if(m.type==='video')return videoEditBlock(m);
    if(m.type==='link')return `<div class="label">LINK</div><input class="field" id="editUrl" value="${esc(m.url||'')}">`;
    if(m.type==='youtube')return `<div class="label">VIDEO LINK / YOUTUBE</div><input class="field" id="editUrl" value="${esc(originalUrl(m)||REAL_YT_TEST)}"><div class="netNote">실제 thumbnail은 maxres → HQ → offline fallback 순서로 표시됩니다.</div>`;
    return `<div class="label">NOTE BODY</div><textarea class="field" id="editNoteBody" rows="4">${esc(m.memo)}</textarea>`;
  };
  function editVideoSource(){return document.querySelector('input[name="editVideoSource"]:checked')?.value||'local'}
  openEdit=function(){
    let m=moments.find(x=>x.id===selected);if(!m)return;editBase=JSON.parse(JSON.stringify(m));removePhotoFlag=false;editTempAsset=null;
    let f=$('#editFields');f.innerHTML=`${editMediaFields(m)}<input class="field" id="editTitle" value="${esc(m.title)}"><textarea class="field" id="editMemo" rows="3">${esc(m.memo)}</textarea>${styleFieldsHTML('edit',m)}<div class="netNote">DATE · ${esc(m.date)} &nbsp; PRIVACY · ${esc(m.privacy||'PRIVATE')} · 순간 ID ${esc(m.id)}</div>`;
    bindKeywordPicker('edit',updateEditPreview);f.querySelectorAll('input,textarea,select').forEach(x=>x.addEventListener('input',updateEditPreview));$('#editMediaFile')?.addEventListener('change',updateEditPreview);$('#editUrl')?.addEventListener('input',updateEditPreview);$('#editVideoUrl')?.addEventListener('input',updateEditPreview);$('#removePhoto')?.addEventListener('click',()=>{removePhotoFlag=true;updateEditPreview()});
    f.querySelectorAll('input[name="editVideoSource"]').forEach(r=>r.addEventListener('change',()=>{let yt=r.value==='youtube'&&r.checked;$('#editVideoLocal').hidden=yt;$('#editVideoYoutube').hidden=!yt;updateEditPreview()}));
    $('#editModal').classList.add('open');updateEditPreview();
  };
  editPreviewState=function(){
    let m=moments.find(x=>x.id===selected),type=m.type,asset=m.asset,video=m.video,url=$('#editUrl')?.value??m.url,sourceUrl=m.sourceUrl||m.url||'',videoSource=m.videoSource||'local',videoId=m.videoId||'';let file=$('#editMediaFile')?.files?.[0];
    if(type==='video'){
      videoSource=editVideoSource();
      if(videoSource==='youtube'){url=$('#editVideoUrl')?.value||sourceUrl||REAL_YT_TEST;sourceUrl=url;videoId=ytId(url);asset=ytMax(url)||V12_FALLBACK(url);video=null}
      else {sourceUrl='';url=null;videoId='';if(file){editTempAsset=URL.createObjectURL(file);video=editTempAsset;asset=ASSET.first}}
    }else if(file){editTempAsset=URL.createObjectURL(file);asset=editTempAsset}
    if(removePhotoFlag&&type==='photo')asset=ASSET.note;if(type==='youtube'){sourceUrl=url;videoId=ytId(url||'');asset=ytMax(url||'')||V12_FALLBACK(url||'')}
    return{...m,title:$('#editTitle')?.value||m.title,memo:$('#editNoteBody')?.value||$('#editMemo')?.value||m.memo,emotion:$('#editEmotion')?.value||m.emotion,source:$('#editSource')?.value||m.source,pinStyle:$('#editPinStyle')?.value||m.pinStyle,cardStyle:$('#editCardStyle')?.value||m.cardStyle,keywords:selectedKeywords('edit'),asset,video,url,sourceUrl,videoSource,videoId,thumbnailUrl:(type==='youtube'||(type==='video'&&videoSource==='youtube'))?ytMax(sourceUrl||url||''):m.thumbnailUrl||''};
  };
  updateEditPreview=function(){
    let m=editPreviewState(),media='';
    if(m.type==='note')media=`<div class="previewMedia" style="background:#fff6dd;color:#4d3d50;padding:20px">“${esc(m.memo)}”</div>`;
    else if(isYtMoment(m))media=`<div class="previewMedia">${ytMediaHTML(originalUrl(m))}</div>`;
    else if(m.type==='video')media=`<div class="previewMedia"><video src="${m.video||''}" poster="${m.asset}" muted playsinline controls></video></div>`;
    else media=`<div class="previewMedia"><img src="${m.asset}" data-fallback="${ASSET.link}" onerror="this.onerror=null;this.src=this.dataset.fallback"></div>`;
    $('#editPreview').innerHTML=`<div class="label">LIVE PREVIEW</div><div class="previewCard" style="margin-top:12px"><span class="previewPin"></span>${media}<div style="margin-top:10px;font-size:9px;color:#64566f">${esc(LTLabels.type(m.originalType||m.type))} · ${esc(m.emotion)}${m.type==='video'?' · '+(m.videoSource==='youtube'?'YOUTUBE':'LOCAL'):''}</div><h3 style="color:#34283d">${esc(m.title)}</h3><div style="font-size:10px;color:#5d4f66">${esc(m.memo)}</div></div>`;
  };
  saveEdit=function(){let m=moments.find(x=>x.id===selected),n=editPreviewState();snapshot();let invariant={id:m.id,date:m.date,privacy:m.privacy,x:m.x,y:m.y,rot:m.rot,first:m.first,createdOrder:m.createdOrder};Object.assign(m,n,invariant);$('#editModal').classList.remove('open');renderCards();renderThreads();updateKeywordFilter();selectMoment(m.id,true);persistBoard();toast('미디어를 교체해도 순간 ID·날짜·Connection은 그대로 유지됩니다.');};

  openViewer=function(id){
    let m=moments.find(x=>x.id===id);if(!m)return;$('#vTitle').textContent=titleMain(m)||'순간';let box=$('#viewerMedia');
    if(m.url)box.innerHTML=LTMedia.markup(m.url,m.title,m.mediaMetadata,m.id,null,{emotion:m.emotion,date:m.date,note:m.memo});
    else if(isYtMoment(m)){
      let url=originalUrl(m),embed=ytEmbed(url),vid=ytId(url);box.innerHTML=vid?`<div class="viewerYouTube"><iframe id="youtubeEmbed" src="${embed}" title="${esc(m.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><div class="viewerFallback"><span>영상 소유자 설정이나 네트워크 정책에 따라 여기서 바로 재생되지 않을 수 있어요.</span><button class="miniBtn accent" id="openYoutubeExternal">YouTube에서 재생</button></div></div>`:`<div class="viewerYouTube">${ytMediaHTML(url)}<div class="viewerFallback"><span>유효한 YouTube videoId를 찾지 못했어요.</span></div></div>`;
      setTimeout(()=>{let b=$('#openYoutubeExternal');if(b)b.onclick=()=>window.open(url,'_blank','noopener,noreferrer')},0);
    }else if(m.url)box.innerHTML=LTMedia.markup(m.url,m.title,m.mediaMetadata,m.id);else if(m.type==='video')box.innerHTML=`<video src="${m.video}" poster="${m.asset}" controls autoplay muted playsinline style="width:100%;max-height:420px;object-fit:contain"></video>`;
    else if(m.type==='note')box.innerHTML=`<div style="padding:40px;color:#f7edf8;font-size:22px;line-height:1.6">“${esc(m.memo)}”</div>`;
    else box.innerHTML=`<img src="${m.asset}" data-fallback="${ASSET.link}" onerror="this.onerror=null;this.src=this.dataset.fallback" style="width:100%;max-height:420px;object-fit:cover">`;
    $('#vMeta').innerHTML=`${esc(LTLabels.type(m.originalType||m.type))}${m.type==='video'?` · ${esc(m.videoSource||'local').toUpperCase()}`:''} · ${esc(m.date)} · ${esc(m.emotion)}<br>출처: ${esc(m.source)}${originalUrl(m)?`<br>URL: ${esc(originalUrl(m))}`:''}<br>Keywords: ${(m.keywords||[]).map(k=>'#'+esc(k)).join(' ')}<br>마음 한마디: ${esc(m.memo)}`;$('#viewerModal').classList.add('open');
  };

  /* Wire overwritten handlers and render actual YouTube source. */
  $('#editMomentBtn').onclick=openEdit;$('#editSave').onclick=saveEdit;$('#confirmAdd').onclick=()=>confirmAdd();
  renderCards();renderThreads();updateKeywordFilter();formFor(addType);boardStartView();applyPathHighlight();setTimeout(()=>{if(innerWidth<700){focusBoardMoment(LTDEMO.get(),false);$('#detail').classList.remove('open');}else selectMoment(LTDEMO.get(),true)},100);
  window.__LT58V12={...window.__LT58V11,ytId,ytMax,ytHQ,ytEmbed,isYtMoment,openViewer,openEdit,saveEdit,get cinema(){return typeof cinemaV11!=='undefined'?{...cinemaV11}:null},get state(){return{moments:moments.length,connections:connections.length,selected,theme:document.body.dataset.theme,ytMoments:moments.filter(isYtMoment).map(m=>({id:m.id,url:originalUrl(m),videoId:ytId(originalUrl(m)),thumb:ytMax(originalUrl(m)),source:m.videoSource||m.type}))}}};
})();

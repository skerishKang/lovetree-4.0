import {createWorkspaceApi} from './api.mjs';
// #480 L13: 보관 파일의 날짜도 책·보드·지도와 같은 한 벌로 적는다.
import {formatDisplayDate} from './book-usability.mjs';
import {mediaAssetUrl} from './youtube-id.mjs'; // A-11: 올린 사진 주소도 정본 한 벌에서 만든다.
const TYPES=new Set(['image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm']);
const SIZE_PROBLEM='PNG·JPEG·GIF·WebP(약 4.2MB), MP4·WebM(약 8.4MB)만 올릴 수 있어요.';
// 2026-11-08 순간 추가·수정 패널: 링크와 사진을 한 묶음으로 두고, 파일은 선택하면 바로 올린다.
// 보관 파일 목록·다시 첨부·삭제는 패널이 아니라 계정 메뉴의 다이얼로그가 맡는다.
// #256-3 2단계: onUploaded를 주면 업로드 성공 뒤 그 주소를 넘겨 후속(표지 만들기)을 맡긴다 —
// 옵션이 없으면 기존 순간 폼 동작이 그대로다(시험으로 고정). imagesOnly는 사진만 받는 인스턴스용이다.
// fileLabel: imagesOnly 인스턴스의 파일 라벨(기본 '표지 사진' — 기존 호출은 그대로다).
export function mountPrivateUpload({form,assets,getSubject,getState,onChange,onUseAsset,onUploaded,imagesOnly=false,fileLabel='표지 사진'}){
 const api=createWorkspaceApi(),slot=form.querySelector('[data-media-slot]');
 const slotMarkup=imagesOnly
  ?`<span class="file-pick"><button type="button" class="file-pick-button" data-file-open>파일 고르기</button><span class="file-pick-name" data-file-name>${fileLabel} · 고른 파일 없음</span><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-media-file hidden></span><p role="status" data-upload-status></p><button type="button" data-stop class="stop-upload" hidden>전송 취소</button><p class="panel-note">내 계정에만 보관합니다. 사진 약 4.2MB, 계정당 약 105MB·200개까지.</p>`
  :`<span class="file-pick"><button type="button" class="file-pick-button" data-file-open>파일 고르기</button><span class="file-pick-name" data-file-name>사진·영상</span><input type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm" data-media-file hidden></span><p role="status" data-upload-status></p><button type="button" data-stop class="stop-upload" hidden>전송 취소</button><p class="panel-note media-limit-note">사진 4MB, 영상 8MB까지 · 사진은 나만 볼 수 있어요</p>`;
 slot.innerHTML=slotMarkup;
 const $=s=>slot.querySelector(s),A=s=>assets.querySelector(s),fileInput=$('[data-media-file]'),fileName=$('[data-file-name]'),status=$('[data-upload-status]'),stop=$('[data-stop]'),submit=form.querySelector('[type=submit]');
 // #453 B-2: 브라우저 기본 파일 칸('파일 선택 / 선택된 파일 없음') 대신 디자인 단추를 쓰고, 고른 파일 이름을 단추 옆에 보여 준다.
 const fileEmptyName=fileName?fileName.textContent:'';
 function setName(text){if(fileName)fileName.textContent=text||fileEmptyName;}
 $('[data-file-open]')?.addEventListener('click',()=>{if(!busy)fileInput.click();});
 let file=null,id=null,busy=false,controller=null,version=0,listRequest=0;
 function setBusy(value){busy=value;fileInput.disabled=value;stop.hidden=!value;if(submit)submit.disabled=value;}
 function fileProblem(chosen){
  if(!chosen)return '먼저 파일을 선택해 주세요.';
  if(!TYPES.has(chosen.type)||!chosen.size||chosen.size>(chosen.type.startsWith('image/')?4:8)*1024*1024)return SIZE_PROBLEM;
  // #256-3 2단계: 표지 올리기는 사진만 받는다. 영상은 이번 범위 밖이라 기존 형식 안내 문구로 막는다.
  if(imagesOnly&&chosen.type.startsWith('video/'))return SIZE_PROBLEM;
  return '';
 }
 async function upload(){
  if(busy)return;const subject=getSubject();
  if(!subject){status.textContent='로그인한 뒤 내 기록을 불러와 주세요.';return;}
  const problem=fileProblem(file);
  if(problem){status.textContent=problem;return;}
  const generation=version;controller=new AbortController();setBusy(true);status.textContent=onUploaded?'사진을 전송하고 있어요…':'파일을 전송하고 있어요… 완료 후 순간을 저장해 주세요.';
  try{
   const result=await api.uploadMedia(file,subject,id,controller.signal,file.name);
   if(generation!==version||getSubject()!==subject)return;
   if(!result.ok){status.textContent=result.message||(result.code==='cancelled'?'전송을 멈췄어요. 서버에 보관됐을 수 있으니 내가 올린 사진·영상을 확인해 주세요.':result.code==='timeout'?'응답이 늦어요. 같은 파일로 다시 시도하거나 내가 올린 사진·영상을 확인해 주세요.':'파일을 올리지 못했어요. 로그인과 연결을 확인한 뒤 다시 시도해 주세요.');return;}
   if(typeof result.media?.url!=='string'||!result.media.url.startsWith(mediaAssetUrl('',location.origin))){status.textContent='파일 보관 응답을 확인하지 못했어요. 내가 올린 사진·영상을 확인해 주세요.';return;}
   if(onUploaded){
    // #256-3 2단계: 주소만 넘겨 후속을 맡긴다. 순간 폼의 링크 칸은 건드리지 않는다.
    const url=result.media.url;fileInput.value='';file=null;id=null;setName('');onChange();
    try{await onUploaded(url);}catch(error){status.textContent=error?.message||'표지 만들기를 마치지 못했어요. 내가 올린 사진·영상에서 다시 고를 수 있어요.';}
    return;
   }
   form.elements.url.value=result.media.url;onChange();status.textContent='첨부 파일을 보관했어요. 아래 저장하기를 눌러 순간에 연결해 주세요.';fileInput.value='';file=null;id=null;setName('');
  }finally{controller=null;setBusy(false);}
 }
 // 파일을 고르는 즉시 검증하고 올린다. 따로 '파일 올리기'를 누르지 않는다.
 fileInput.addEventListener('change',()=>{
  file=fileInput.files[0]||null;id=crypto.randomUUID();
  if(!file){setName('');return;}
  setName(file.name);
  const problem=fileProblem(file);
  if(problem){status.textContent=problem;fileInput.value='';file=null;id=null;setName('');return;}
  status.textContent=file.name+' · '+Math.ceil(file.size/1000)+' KB';
  void upload();
 });
 stop.onclick=()=>controller?.abort();
 function assetName(url){return window.LTMedia?.privateAssetName(url)||null;}
 // 표시 이름: 내부 번호 대신 올릴 때 원래 파일 이름, 없으면 종류·날짜.
 function assetLabel(asset){
  if(asset?.label)return String(asset.label);
  const kind=asset?.mime?.startsWith('image/')?'사진':'영상';
  const date=asset?.createdAt?new Date(asset.createdAt):null;
  if(date&&!Number.isNaN(date.getTime()))return kind+' · '+(date.getMonth()+1)+'월 '+date.getDate()+'일';
  return kind;
 }
 function usingMoments(asset){return (getState()?.trees||[]).flatMap(t=>t.moments).filter(m=>assetName(m.url)===asset.name);}
 // #1097: 목록은 4열 격자(파일 이름 · 쓰는 순간 수)다. 파일을 누르면 아래에 쓰는 순간과 지우기·첨부가 보인다.
 let assetTab='all',lastMedia=null;
 function assetFiltered(asset){if(assetTab==='all')return true;if(assetTab==='photo')return asset.mime.startsWith('image/');if(assetTab==='video')return asset.mime.startsWith('video/');if(assetTab==='unused')return usingMoments(asset).length===0;return true;}
 function showAssetDetail(asset,subject){
  const host=A('[data-assets-detail]');if(!host)return;
  const using=usingMoments(asset),prefs=getState()?.prefs;
  host.replaceChildren();
  const head=document.createElement('p');head.className='assets-detail-head';head.textContent=assetLabel(asset);host.append(head);
  if(using.length){
   const list=document.createElement('ul');list.className='assets-detail-list';
   for(const moment of using){const item=document.createElement('li');const when=formatDisplayDate(moment.date,prefs?.dateStyle);item.textContent=moment.title+(when?' · '+when:'');list.append(item);}
   host.append(list);
  }else{const none=document.createElement('p');none.className='assets-detail-none';none.textContent='이 파일을 쓰는 순간은 없어요.';host.append(none);}
  const row=document.createElement('div');row.className='button-row';
  const use=document.createElement('button');use.type='button';use.textContent='이 파일 첨부';use.onclick=()=>{if(busy||getSubject()!==subject)return;const url=mediaAssetUrl(asset.name,location.origin);assets.close();const accepted=onUseAsset?onUseAsset(url):true;if(accepted===false)return;form.elements.url.value=url;onChange();form.elements.url.focus?.();status.textContent='첨부할 파일을 골랐어요. 순간을 저장해 주세요.';};
  const remove=document.createElement('button');remove.type='button';remove.textContent='파일 삭제';remove.className='danger';
  remove.onclick=async()=>{if(busy||getSubject()!==subject||!confirm('이 파일을 지우면 이 파일을 쓴 순간에서도 볼 수 없게 돼요. 지울까요?'))return;remove.disabled=true;const result=await api.removeMedia(asset.name,subject);if(getSubject()!==subject)return;if(result.ok){if(assetName(form.elements.url.value)===asset.name){form.elements.url.value='';onChange();}host.replaceChildren();await refresh();}else{status.textContent=result.message||'삭제하지 못했어요. 다시 시도해 주세요.';remove.disabled=false;}};
  row.append(use,remove);host.append(row);
 }
 function renderAssets(data,subject){
  const host=A('[data-assets]');if(!host)return;
  // 용량은 한 단위로 맞춘다(한도가 100MiB면 MiB 기준).
  A('[data-usage]').textContent=Math.round((data.usedBytes||0)/1048576)+' / '+Math.round((data.quotaBytes||0)/1048576)+' MiB · '+data.items.length+' / '+data.maxItems+'개';
  const fill=A('[data-usage-fill]');if(fill?.style?.setProperty)fill.style.setProperty('--fill',(data.quotaBytes>0?Math.min(100,Math.round(data.usedBytes/data.quotaBytes*100)):0)+'%');
  const items=(data.items||[]).filter(assetFiltered);
  if(!items.length){host.textContent=(data.items||[]).length?'이 보기에서는 파일이 없어요.':'보관한 파일이 없어요.';return;}
  for(const asset of items){
   const references=usingMoments(asset).length;
   const card=document.createElement('div');card.className='asset-card';
   const open=document.createElement('button');open.type='button';open.className='asset-card-open';open.setAttribute('aria-label',assetLabel(asset)+' 보기');
   const thumb=document.createElement('span');thumb.className='asset-thumb';
   if(asset.mime.startsWith('image/')){const img=document.createElement('img');img.src=mediaAssetUrl(asset.name,location.origin);img.alt='';img.loading='lazy';thumb.append(img);}
   else{const mark=document.createElement('span');mark.className='asset-thumb-video';mark.textContent='▶';thumb.append(mark);}
   const name=document.createElement('span');name.className='asset-name';name.textContent=assetLabel(asset);
   const count=document.createElement('span');count.className='asset-count';count.textContent=references?references+'개 순간에서 사용':'연결된 순간 없음';
   open.append(thumb,name,count);open.onclick=()=>showAssetDetail(asset,subject);
   card.append(open);host.append(card);
  }
 }
 // #1097: 보관 파일 창의 '+ 올리기' — 고르면 바로 올려 목록을 다시 그린다.
 async function uploadFromAssets(chosen){
  if(busy)return;const subject=getSubject();if(!subject){A('[data-usage]').textContent='내 기록을 먼저 불러와 주세요.';return;}
  const problem=fileProblem(chosen);if(problem){A('[data-usage]').textContent=problem;return;}
  const generation=version;controller=new AbortController();setBusy(true);A('[data-usage]').textContent='파일을 전송하고 있어요…';
  try{
   const result=await api.uploadMedia(chosen,subject,crypto.randomUUID(),controller.signal,chosen.name);
   if(generation!==version||getSubject()!==subject)return;
   if(!result.ok){A('[data-usage]').textContent=result.message||'파일을 올리지 못했어요. 로그인과 연결을 확인한 뒤 다시 시도해 주세요.';return;}
   if(typeof result.media?.url!=='string'||!result.media.url.startsWith(mediaAssetUrl('',location.origin))){A('[data-usage]').textContent='파일 보관 응답을 확인하지 못했어요.';return;}
   await refresh();
  }finally{controller=null;setBusy(false);}
 }
 async function refresh(){
  const subject=getSubject(),generation=version,request=++listRequest;const host=A('[data-assets]');host.replaceChildren();
  A('[data-assets-detail]')?.replaceChildren();
  if(!subject){A('[data-usage]').textContent='내 기록을 먼저 불러와 주세요.';return;}
  A('[data-usage]').textContent='목록을 불러오고 있어요…';
  const result=await api.listMedia();if(generation!==version||request!==listRequest||subject!==getSubject())return;
  if(!result.ok||result.media?.subject!==subject){A('[data-usage]').textContent=result.message||'파일 목록을 불러오지 못했어요. 다시 시도해 주세요.';return;}
  lastMedia=result.media;renderAssets(lastMedia,subject);
 }
 if(assets){
  A('[data-refresh]').onclick=refresh;
  const uploadButton=A('[data-assets-upload]'),filePicker=A('[data-assets-file]');
  if(uploadButton&&filePicker)uploadButton.onclick=()=>{if(!busy)filePicker.click();};
  if(filePicker)filePicker.addEventListener('change',()=>{const chosen=filePicker.files[0]||null;filePicker.value='';if(chosen)void uploadFromAssets(chosen);});
  if(typeof assets.querySelectorAll==='function')for(const tab of assets.querySelectorAll('[data-assets-tab]'))tab.onclick=()=>{assetTab=tab.dataset.assetsTab||'all';for(const other of assets.querySelectorAll('[data-assets-tab]'))other.setAttribute('aria-selected',String(other===tab));if(lastMedia)renderAssets(lastMedia,getSubject());};
 }
 if(assets)A('[data-refresh]').onclick=refresh;
 return {
  openAssets(){if(!assets)return;A('[data-assets]').replaceChildren();A('[data-usage]').textContent='';A('[data-assets-detail]')?.replaceChildren();lastMedia=null;void refresh();},
  reset(){++version;++listRequest;controller?.abort();file=null;id=null;fileInput.value='';setName('');status.textContent='';if(assets){A('[data-assets]').replaceChildren();A('[data-usage]').textContent='';A('[data-assets-detail]')?.replaceChildren();lastMedia=null;}},
  get busy(){return busy;}
 };
}

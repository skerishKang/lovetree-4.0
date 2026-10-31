import {createWorkspaceApi} from './api.mjs';
const TYPES=new Set(['image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm']);
export function mountPrivateUpload({form,getSubject,getState,onChange}){
 const api=createWorkspaceApi(),section=document.createElement('section');
 section.className='private-upload';
 section.innerHTML='<h3>사진·영상 첨부</h3><p>내 계정에만 보관합니다. 사진 4MiB · 영상 8MiB, 계정당 100MiB·200개까지.</p><label class="file-label">파일 선택<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm" data-media-file></label><div class="button-row"><button type="button" data-upload>파일 올리기</button><button type="button" data-stop hidden>전송 취소</button></div><p role="status" data-upload-status></p><details><summary>내 보관 파일 · 다시 첨부·삭제</summary><p>기록이나 트리를 지워도 첨부 파일은 남습니다. 파일을 삭제하면 그 파일을 쓰던 기록에서도 더 이상 볼 수 없어요. JSON 백업에는 링크만 포함됩니다.</p><button type="button" data-refresh>목록 새로고침</button><p data-usage></p><div data-assets></div></details>';
 form.querySelector('[name=url]').closest('label').before(section);
 const $=s=>section.querySelector(s),fileInput=$('[data-media-file]'),status=$('[data-upload-status]');
 let file=null,id=null,busy=false,controller=null,version=0;
 function setBusy(value){busy=value;$('[data-upload]').disabled=value;fileInput.disabled=value;$('[data-stop]').hidden=!value;form.querySelector('[type=submit]').disabled=value;}
 fileInput.addEventListener('change',()=>{file=fileInput.files[0]||null;id=crypto.randomUUID();status.textContent=file?file.name+' · '+Math.ceil(file.size/1024)+' KiB':'';});
 $('[data-stop]').onclick=()=>controller?.abort();
 $('[data-upload]').onclick=async()=>{
  if(busy)return;const subject=getSubject();
  if(!subject){status.textContent='로그인한 뒤 내 기록을 불러와 주세요.';return;}
  if(!file){status.textContent='먼저 파일을 선택해 주세요.';return;}
  if(!TYPES.has(file.type)||!file.size||file.size>(file.type.startsWith('image/')?4:8)*1024*1024){status.textContent='PNG·JPEG·GIF·WebP(4MiB), MP4·WebM(8MiB)만 올릴 수 있어요.';return;}
  const generation=version;controller=new AbortController();setBusy(true);status.textContent='파일을 전송하고 있어요… 완료 후 순간을 저장해 주세요.';
  try{
   const result=await api.uploadMedia(file,subject,id,controller.signal);
   if(generation!==version||getSubject()!==subject)return;
   if(!result.ok){status.textContent=result.message||(result.code==='cancelled'?'전송을 멈췄어요. 서버에 보관됐을 수 있으니 내 보관 파일을 확인해 주세요.':result.code==='timeout'?'응답이 늦어요. 같은 파일로 다시 시도하거나 내 보관 파일을 확인해 주세요.':'파일을 올리지 못했어요. 로그인과 연결을 확인한 뒤 다시 시도해 주세요.');return;}
   if(typeof result.media?.url!=='string'||!result.media.url.startsWith(location.origin+'/api/media/')){status.textContent='파일 보관 응답을 확인하지 못했어요. 내 보관 파일을 확인해 주세요.';return;}
   form.elements.url.value=result.media.url;onChange();status.textContent='첨부 파일을 보관했어요. 아래 저장하기를 눌러 순간에 연결해 주세요.';fileInput.value='';file=null;id=null;
  }finally{controller=null;setBusy(false);}
 };
 function assetName(url){try{const u=new URL(url,location.origin);return u.origin===location.origin&&u.pathname.startsWith('/api/media/')?u.pathname.slice(11):null;}catch{return null;}}
 async function refresh(){
  const subject=getSubject(),generation=version;const host=$('[data-assets]');host.replaceChildren();
  if(!subject){$('[data-usage]').textContent='내 기록을 먼저 불러와 주세요.';return;}
  $('[data-usage]').textContent='목록을 불러오고 있어요…';
  const result=await api.listMedia();if(generation!==version||subject!==getSubject())return;
  if(!result.ok||result.media?.subject!==subject){$('[data-usage]').textContent=result.message||'파일 목록을 불러오지 못했어요. 다시 시도해 주세요.';return;}
  const data=result.media;$('[data-usage]').textContent=(data.usedBytes/1048576).toFixed(1)+' / '+(data.quotaBytes/1048576)+' MiB · '+data.items.length+' / '+data.maxItems+'개';
  if(!data.items.length){host.textContent='보관한 파일이 없어요.';return;}
  for(const asset of data.items){
   const row=document.createElement('div');row.className='upload-asset';
   const label=document.createElement('p');const references=(getState()?.trees||[]).flatMap(t=>t.moments).filter(m=>assetName(m.url)===asset.name).length;
   label.textContent=(asset.mime.startsWith('image/')?'사진':'영상')+' · '+Math.ceil(asset.size/1024)+' KiB · '+new Date(asset.createdAt).toLocaleString('ko-KR')+' · '+(references?references+'개 순간에서 사용':'연결된 순간 없음');row.append(label);
   const use=document.createElement('button');use.type='button';use.textContent='이 파일 첨부';use.onclick=()=>{if(busy||getSubject()!==subject)return;form.elements.url.value=location.origin+'/api/media/'+asset.name;onChange();status.textContent='첨부할 파일을 골랐어요. 순간을 저장해 주세요.';};
   const remove=document.createElement('button');remove.type='button';remove.textContent='파일 삭제';remove.className='danger';
   remove.onclick=async()=>{if(busy||getSubject()!==subject||!confirm((references?references+'개 순간에서 사용 중입니다. 삭제하면 해당 사진·영상이 사라집니다. ':'')+'이 파일을 영구 삭제할까요? 순간의 글과 연결은 유지됩니다.'))return;remove.disabled=true;const result=await api.removeMedia(asset.name,subject);if(getSubject()!==subject)return;if(result.ok){if(assetName(form.elements.url.value)===asset.name){form.elements.url.value='';onChange();}await refresh();}else{status.textContent=result.message||'삭제하지 못했어요. 다시 시도해 주세요.';remove.disabled=false;}};
   row.append(use,remove);host.append(row);
  }
 }
 $('[data-refresh]').onclick=refresh;$('details').addEventListener('toggle',()=>{if($('details').open)refresh();});
 return {reset(){++version;controller?.abort();file=null;id=null;fileInput.value='';status.textContent='';$('[data-assets]').replaceChildren();$('[data-usage]').textContent='';$('details').open=false;},get busy(){return busy;}};
}

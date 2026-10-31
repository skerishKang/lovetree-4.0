// Private product media: canonical identity from the existing PADIEM authenticator.
// Local single-process store; no public URLs, external fetching, or filename paths.
import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readdir, open, readFile, writeFile, link, unlink} from 'node:fs/promises';
import {join, isAbsolute} from 'node:path';
import {ApiError} from './errors.js';
import {parsePrincipal} from './principal.js';

export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
export const IMAGE_LIMIT_BYTES = 4 * 1024 * 1024;
export const MEDIA_ITEM = /^\/api\/media\/([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\.(png|jpg|gif|webp|mp4|webm)$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const types = {'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'};
const failure=(s,c,m)=>new ApiError(s,c,m);
const digest=b=>createHash('sha256').update(b).digest('hex');
const missing=()=>failure(404,'media_not_found','?뚯씪???녾굅????怨꾩젙?먯꽌 蹂????놁뼱??');
function checkFile(bytes,mime) {
 const b=Buffer.from(bytes),ext=types[mime];
 if(!ext)throw failure(415,'media_type','PNG쨌JPEG쨌GIF쨌WebP ?ъ쭊怨?MP4쨌WebM ?곸긽留??щ┫ ???덉뼱??');
 if(!b.length||b.length>(mime.startsWith('image/')?IMAGE_LIMIT_BYTES:MAX_MEDIA_BYTES))throw failure(413,'media_size','?ъ쭊? 4MiB, ?곸긽? 8MiB ?댄븯留??щ┫ ???덉뼱??');
 const ok=ext==='png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
 ext==='jpg'?b[0]===255&&b[1]===216&&b[2]===255:
 ext==='gif'?['GIF87a','GIF89a'].includes(b.subarray(0,6).toString()):
 ext==='webp'?b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP':
 ext==='mp4'?b.subarray(4,8).toString()==='ftyp':
 b.subarray(0,4).equals(Buffer.from([26,69,223,163]));
 if(!ok)throw failure(415,'media_signature','?뚯씪 ?댁슜怨??뺤떇??留욎? ?딆븘?? ?먮낯 ?뚯씪???뺤씤??二쇱꽭??');
 return ext;
}
export function createPrivateMediaStore({directory,quotaBytes=100*1024*1024,maxItems=200}={}) {
 if(!directory||!isAbsolute(directory))throw Error('Private media requires an absolute directory');
 const queues=new Map();
 const folder=p=>join(directory,digest(p.productId+'\0'+p.subjectId));
 async function serial(p,fn){const key=folder(p),before=queues.get(key)||Promise.resolve();let release;const gate=new Promise(r=>release=r);const tail=before.catch(()=>{}).then(()=>gate);queues.set(key,tail);await before.catch(()=>{});try{return await fn(key);}finally{release();if(queues.get(key)===tail)queues.delete(key);}}
 async function metadata(path){const f=await open(path,'r');try{const b=Buffer.alloc(1024);const {bytesRead}=await f.read(b,0,b.length,0),end=b.subarray(0,bytesRead).indexOf(10);if(end<0)throw Error('invalid asset');const m=JSON.parse(b.subarray(0,end).toString());const stat=await f.stat();if(!UUID.test(m.id)||types[m.mime]!==m.ext||!Number.isSafeInteger(m.size)||m.size<=0||m.size>MAX_MEDIA_BYTES||stat.size!==end+1+m.size)throw Error('invalid asset');return {...m,offset:end+1};}finally{await f.close();}}
 async function items(dir){let names;try{names=await readdir(dir);}catch(e){if(e.code==='ENOENT')return [];throw e;}return Promise.all(names.filter(n=>UUID.test(n.replace(/\.asset$/,''))&&n.endsWith('.asset')).map(async n=>metadata(join(dir,n))));}
 const exposed=m=>({id:m.id,name:m.id+'.'+m.ext,mime:m.mime,size:m.size,createdAt:m.createdAt});
 return {
  async list(p){return serial(p,async dir=>{const rows=await items(dir);return {items:rows.map(exposed).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),usedBytes:rows.reduce((n,m)=>n+m.size,0),quotaBytes,maxItems};});},
  async put(p,{id,mime,bytes}){if(!UUID.test(id||''))throw failure(400,'media_request_id','?뚯씪 ?붿껌 踰덊샇媛 ?щ컮瑜댁? ?딆븘??');const ext=checkFile(bytes,mime),hash=digest(bytes);
   return serial(p,async dir=>{await mkdir(dir,{recursive:true,mode:0o700});const path=join(dir,id+'.asset');let old;try{old=await metadata(path);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(old){if(old.sha256!==hash||old.mime!==mime)throw failure(409,'media_request_conflict','媛숈? ?붿껌 踰덊샇???ㅻⅨ ?뚯씪???덉뼱?? ?뚯씪???ㅼ떆 ?좏깮??二쇱꽭??');return exposed(old);}
    const rows=await items(dir);if(rows.length>=maxItems||rows.reduce((n,m)=>n+m.size,0)+bytes.length>quotaBytes)throw failure(413,'media_quota','?뚯씪 蹂닿? ?쒕룄???꾨떖?덉뼱?? ?ъ슜?섏? ?딅뒗 ?뚯씪???뺣━??二쇱꽭??');
    const m={id,mime,ext,size:bytes.length,sha256:hash,createdAt:new Date().toISOString()},tmp=join(dir,'.'+randomUUID()+'.tmp');
    try{await writeFile(tmp,Buffer.concat([Buffer.from(JSON.stringify(m)+'\n'),Buffer.from(bytes)]),{flag:'wx',mode:0o600});const f=await open(tmp,'r+');try{await f.sync();}finally{await f.close();}await link(tmp,path);}
    finally{await unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
    return exposed(m);
   });
  },
  async get(p,name){const match=MEDIA_ITEM.exec('/api/media/'+name);if(!match)throw missing();return serial(p,async dir=>{const path=join(dir,match[1]+'.asset');let m;try{m=await metadata(path);}catch(e){if(e.code==='ENOENT')throw missing();throw e;}if(m.ext!==match[2])throw missing();const file=await readFile(path),bytes=file.subarray(m.offset);if(digest(bytes)!==m.sha256)throw Error('invalid asset checksum');return {mime:m.mime,bytes};});},
  async remove(p,name){const match=MEDIA_ITEM.exec('/api/media/'+name);if(!match)throw missing();return serial(p,async dir=>{const path=join(dir,match[1]+'.asset');let m;try{m=await metadata(path);}catch(e){if(e.code==='ENOENT')throw missing();throw e;}if(m.ext!==match[2])throw missing();await unlink(path);return {deleted:true};});}
 };
}
export function createMediaHandler({authenticate,productId,store,publicOrigin}) {
 try{const u=new URL(publicOrigin);if(u.origin!==publicOrigin||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))publicOrigin=null;}catch{publicOrigin=null;}
 const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"};
 return async request=>{
  try{
   const principal=parsePrincipal(await authenticate(request),productId),path=request.path,method=request.method;
   const item=MEDIA_ITEM.exec(path),collection=path==='/api/media';
   if(!collection&&!item)throw missing();
   if(!((collection&&['GET','POST'].includes(method))||(item&&['GET','DELETE'].includes(method))))throw failure(405,'method_not_allowed','???붿껌? 吏?먰븯吏 ?딆븘??');
   if(!store||!publicOrigin)throw failure(503,'media_unavailable','?뚯씪 蹂닿????꾩쭅 以鍮꾨릺吏 ?딆븯?댁슂.');
   if(method==='POST'||method==='DELETE'){
    if(request.headers?.origin!==publicOrigin)throw failure(403,'media_origin','???붾㈃?먯꽌 ?ㅼ떆 ?붿껌??二쇱꽭??');
    if(request.headers?.['x-lovetree-subject']!==principal.subjectId)throw failure(401,'account_changed','怨꾩젙??諛붾뚯뿀?댁슂. ??湲곕줉???ㅼ떆 遺덈윭? 二쇱꽭??');
   }
   let body;
   if(collection&&method==='GET')body=await store.list(principal);
   if(collection&&method==='POST'){
    if(request.bodyTooLarge)throw failure(413,'media_size','?곸긽? 8MiB ?댄븯留??щ┫ ???덉뼱??');
    body=await store.put(principal,{id:request.headers?.['x-lovetree-upload-id'],mime:String(request.headers?.['content-type']||'').split(';')[0].toLowerCase(),bytes:request.rawBody||Buffer.alloc(0)});
    body={...body,url:publicOrigin+'/api/media/'+body.name};
   }
   if(item&&method==='GET'){const asset=await store.get(principal,path.slice(11));return {status:200,headers:{...headers,'content-type':asset.mime},binary:asset.bytes};}
   if(item&&method==='DELETE')body=await store.remove(principal,path.slice(11));
   return {status:200,headers,body:{...body,subject:principal.subjectId}};
  }catch(e){return {status:e instanceof ApiError?e.status:503,headers,body:{error:{code:e instanceof ApiError?e.code:'media_unavailable',message:e instanceof ApiError?e.message:'?뚯씪 蹂닿????곌껐?섏? 紐삵뻽?댁슂. ?ㅼ떆 ?쒕룄??二쇱꽭??'}}};}
 };
}


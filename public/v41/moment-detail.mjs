import {parseMomentLink} from '../../src/media.js';
import {thumbnailCandidates} from './thumb-fallback.mjs';
import {coverModeOf,normalizeCoverDesign} from './domain.mjs';
import {displayTreeTitle} from './tree-name.mjs';

const hostLabel=(host)=>{
  if(host==='instagram.com'||host.endsWith('.instagram.com'))return 'Instagram에서 보기';
  if(host==='tiktok.com'||host.endsWith('.tiktok.com'))return 'TikTok에서 보기';
  return '사이트에서 보기';
};

export function momentExternalView(moment){
  const raw=String(moment?.url||'').trim();
  if(!raw)return null;
  try{
    const local=new URL(raw,globalThis.location?.origin||'http://localhost');
    if(globalThis.location?.origin&&local.origin===globalThis.location.origin&&/^\/api\/media\//i.test(local.pathname))return null;
  }catch{}
  const link=parseMomentLink(raw);
  if(!link?.openUrl)return null;
  if(link.kind==='youtube')return {href:link.openUrl,label:'YouTube에서 보기'};
  return {href:link.openUrl,label:hostLabel(new URL(link.openUrl).hostname.toLowerCase())};
}

export function momentConnections(moment,moments=[]){
  const id=String(moment?.id||'');
  const list=Array.isArray(moments)?moments:[];
  const parent=list.find(item=>item.id===moment?.parentId)||null;
  const children=list.filter(item=>item.parentId===id);
  return {parent,children,next:children[0]||null,branchCount:children.length};
}

export function treeChipView(tree,index=0){
  const title=displayTreeTitle(tree?.title||tree?.subject||'트리');
  const initial=Array.from(title)[0]||'트';
  const mode=coverModeOf(tree);
  const design=mode==='design'?normalizeCoverDesign(tree?.coverDesign):'';
  let image='';
  if(!design){
    const moments=Array.isArray(tree?.moments)?[...tree.moments].sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))):[];
    const selected=mode!=='design'?moments.find(moment=>moment.id===tree?.coverMomentId):null;
    const cover=selected||moments[0];
    if(cover)image=thumbnailCandidates(cover,{autoLoad:true})[0]||'';
  }
  return {title,initial,design,image,color:`var(--lt-tree-${(Number(index)||0)%6+1})`};
}

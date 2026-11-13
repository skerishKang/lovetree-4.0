export function createMemoryShareRepo({now=Date.UTC(2026,10,1)}={}) {
  const rows=new Map();let tick=0;const key=(p,id)=>p+'\0'+id,stamp=()=>new Date(now+(++tick)*1000).toISOString();
  return {
    async create(input){const k=key(input.productId,input.shareId);if(rows.has(k))return null;const value={...input,origin:input.origin||'owner',momentCount:Number(input.momentCount??0),status:'active',createdAt:stamp(),revokedAt:null,discoverable:false,discoverableAt:null};rows.set(k,value);return structuredClone(value);},
    async load({productId,shareId}){const value=rows.get(key(productId,shareId));return value?structuredClone(value):null;},
    async list({productId,subjectId}){return [...rows.values()].filter(v=>v.productId===productId&&v.subjectId===subjectId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(value=>structuredClone(value));},
    async setDiscoverable({productId,subjectId,shareId,discoverable}){const value=rows.get(key(productId,shareId));if(!value||value.subjectId!==subjectId||value.status!=='active')return null;value.discoverable=discoverable;value.discoverableAt=discoverable?(value.discoverableAt||stamp()):null;return structuredClone(value);},
    async revoke({productId,subjectId,shareId}){const value=rows.get(key(productId,shareId));if(!value||value.subjectId!==subjectId)return null;if(value.status==='active'){value.status='revoked';value.revokedAt=stamp();}return structuredClone(value);},
    // #538: 저장 성공 뒤 같은 훅에서 순간 수를 갱신한다(주인이 만든 행도 함께).
    async updateMomentCount({productId,subjectId,treeId,momentCount}){let changed=0;for(const value of rows.values())if(value.productId===productId&&value.subjectId===subjectId&&value.treeId===treeId&&value.status==='active'){value.momentCount=momentCount;changed+=1;}return changed;},
    // #538: 자동 공개 행이 없으면 만들고, 취소돼 있으면 되살린다(트리 하나에 자동 행 하나).
    async upsertAutoShare({productId,subjectId,shareId,treeId,entryMomentId,momentCount}){
      const existing=[...rows.values()].find(v=>v.productId===productId&&v.subjectId===subjectId&&v.treeId===treeId&&v.origin==='auto');
      if(existing){existing.status='active';existing.revokedAt=null;existing.entryMomentId=entryMomentId;existing.momentCount=momentCount;return structuredClone(existing);}
      const value={productId,shareId,subjectId,treeId,entryMomentId,view:'book',origin:'auto',momentCount,status:'active',createdAt:stamp(),revokedAt:null,discoverable:false,discoverableAt:null};
      rows.set(key(productId,shareId),value);return structuredClone(value);
    },
    // #538: 문서에서 사라진 트리의 자동 공개 행은 즉시 내린다(주인이 지우면 바로 내려감).
    async revokeAutoSharesNotIn({productId,subjectId,treeIds}){const keep=new Set(treeIds);for(const value of rows.values())if(value.productId===productId&&value.subjectId===subjectId&&value.origin==='auto'&&value.status==='active'&&!keep.has(value.treeId)){value.status='revoked';value.revokedAt=stamp();}}
  };
}

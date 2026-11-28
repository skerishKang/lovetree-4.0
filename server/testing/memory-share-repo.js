export function createMemoryShareRepo({now=Date.UTC(2026,10,1)}={}) {
  const rows=new Map(),previews=new Map();let tick=0;const key=(p,id)=>p+'\0'+id,stamp=()=>new Date(now+(++tick)*1000).toISOString();
  const clone=value=>structuredClone(value);
  function insertShare(input){
    const k=key(input.productId,input.shareId);
    if(rows.has(k))return null;
    const value={...input,origin:input.origin||'owner',momentCount:Number(input.momentCount??0),status:'active',createdAt:stamp(),revokedAt:null,discoverable:false,discoverableAt:null};
    rows.set(k,value);return clone(value);
  }
  return {
    async create(input){return insertShare(input);},
    async createPreview(input){previews.set(input.tokenHash,clone(input));return true;},
    async createShareWithPreview(input){
      const preview=previews.get(input.tokenHash);
      if(!preview||preview.productId!==input.productId)return {status:'missing'};
      if(preview.subjectId!==input.subjectId)return {status:'forbidden'};
      if(Date.parse(preview.expiresAt)<=(input.now??Date.now()))return {status:'expired'};
      if(preview.treeId!==input.treeId||preview.requestHash!==input.requestHash)return {status:'stale'};
      if(preview.consumedAt){
        if(!preview.resultShareId)return {status:'stale'};
        const value=rows.get(key(input.productId,preview.resultShareId));
        return value?{status:'replayed',share:clone(value)}:{status:'missing'};
      }
      const share=insertShare(input);
      if(!share)return {status:'collision'};
      preview.consumedAt=new Date(input.now??Date.now()).toISOString();preview.resultShareId=share.shareId;
      return {status:'created',share};
    },
    async prunePreviews(){
      const cutoff=Date.now()-24*60*60*1000;
      for(const [hash,preview] of previews)if(Date.parse(preview.expiresAt)<cutoff)previews.delete(hash);
    },
    async load({productId,shareId}){const value=rows.get(key(productId,shareId));return value?clone(value):null;},
    // 시험·집계용 읽기(#655 2차). 제품의 공유 행 전체.
    async allForProduct({productId}){return [...rows.values()].filter(v=>v.productId===productId).map(clone);},
    async list({productId,subjectId}){return [...rows.values()].filter(v=>v.productId===productId&&v.subjectId===subjectId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(clone);},
    async setDiscoverable({productId,subjectId,shareId,discoverable}){const value=rows.get(key(productId,shareId));if(!value||value.subjectId!==subjectId||value.status!=='active')return null;value.discoverable=discoverable;value.discoverableAt=discoverable?(value.discoverableAt||stamp()):null;return clone(value);},
    async revoke({productId,subjectId,shareId}){const value=rows.get(key(productId,shareId));if(!value||value.subjectId!==subjectId)return null;if(value.status==='active'){value.status='revoked';value.revokedAt=stamp();}return clone(value);},
    // #538: 저장 성공 뒤 같은 훅으로 순간 수를 갱신한다(주인이 만든 행도 함께).
    async updateMomentCount({productId,subjectId,treeId,momentCount}){let changed=0;for(const value of rows.values())if(value.productId===productId&&value.subjectId===subjectId&&value.treeId===treeId&&value.status==='active'){value.momentCount=momentCount;changed+=1;}return changed;},
    // #538: 자동 공개 행이 없으면 만들고, 취소돼 있으면 되살리지 않는다.
    // #1046: 이미 있는 자동 행은 revoked 그대로 둔다.
    async upsertAutoShare({productId,shareId,subjectId,treeId,entryMomentId,momentCount}){
      const existing=[...rows.values()].find(v=>v.productId===productId&&v.subjectId===subjectId&&v.treeId===treeId&&v.origin==='auto');
      if(existing)return clone(existing);
      return insertShare({productId,shareId,subjectId,treeId,entryMomentId,view:'book',origin:'auto',momentCount});
    },
    // #538: 문서에서 사라진 트리의 공유 행은 즉시 내린다(자동·주인 모두).
    async revokeSharesNotIn({productId,subjectId,treeIds}){const keep=new Set(treeIds);for(const value of rows.values())if(value.productId===productId&&value.subjectId===subjectId&&value.status==='active'&&!keep.has(value.treeId)){value.status='revoked';value.revokedAt=stamp();}}
  };
}

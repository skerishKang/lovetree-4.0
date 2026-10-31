export function createMemoryShareRepo({now=Date.UTC(2026,10,1)}={}) {
  const rows=new Map();let tick=0;const key=(p,id)=>p+'\0'+id,stamp=()=>new Date(now+(++tick)*1000).toISOString();
  return {
    async create(input){const k=key(input.productId,input.shareId);if(rows.has(k))return null;const value={...input,status:'active',createdAt:stamp(),revokedAt:null};rows.set(k,value);return structuredClone(value);},
    async load({productId,shareId}){const value=rows.get(key(productId,shareId));return value?structuredClone(value):null;},
    async list({productId,subjectId}){return [...rows.values()].filter(v=>v.productId===productId&&v.subjectId===subjectId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(value=>structuredClone(value));},
    async revoke({productId,subjectId,shareId}){const value=rows.get(key(productId,shareId));if(!value||value.subjectId!==subjectId)return null;if(value.status==='active'){value.status='revoked';value.revokedAt=stamp();}return structuredClone(value);}
  };
}

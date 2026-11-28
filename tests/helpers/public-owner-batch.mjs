import assert from 'node:assert/strict';
import {createTree,addMoment} from '../../src/domain.js';
import {createCommunityService,createCommunityHandler} from '../../server/community-service.js';
import {createAdminRoleService} from '../../server/admin-roles.js';
import {ApiError} from '../../server/errors.js';

export const clock='2026-11-20T00:00:00.000Z';
export const owner=i=>'sub_'+i.toString(16).padStart(16,'0');
export const shareId=i=>'s'+String(i).padStart(23,'0');
export const label=i=>'검증대상 '+String(i).padStart(4,'0');
export const viewer=owner(12);

export function ownerFixture(n,{mixed=false}={}){
 const shares=[],docs=new Map(),roles=[];
 for(let i=1;i<=n;i++){
  const subjectId=owner(mixed&&i===13?1:i);
  const treeId=mixed&&(i===1||i===2)?'same-tree':'tree-'+i;
  const title=label(i);
  const input=j=>({subject:title,title:title+' 순간 '+j,note:'시험 기록',emotion:'설렘',date:'2026-11-20',url:'https://www.youtube.com/shorts/'+String(i*100+j).padStart(11,'0'),keywords:['가수:검증그룹','노래:검증-'+i],mediaMetadata:{vertical:true}});
  let tree=createTree(input(1),clock);
  for(let j=2;j<=3;j++)tree=addMoment(tree,input(j),tree.moments[0].id,clock);
  tree={...tree,id:treeId,title,moments:tree.moments.map((m,j)=>({...m,id:'m-'+i+'-'+j,parentId:j===0?null:'m-'+i+'-0',keywords:['가수:검증그룹','노래:검증-'+i],mediaMetadata:{vertical:true}}))};
  if(!mixed||i!==9){
   const doc=docs.get(subjectId)||{version:1,trees:[],prefs:{}};
   doc.trees.push(tree);docs.set(subjectId,doc);
  }
  if(mixed&&i===3)roles.push({subjectId,role:'ai_customer'});
  if(mixed&&i===4)roles.push({subjectId,role:'tester'});
  shares.push({subjectId,treeId,shareId:shareId(i),entryMomentId:tree.moments[0].id,view:'book',momentCount:3,
    status:mixed&&i===8?'revoked':'active',createdAt:new Date(Date.parse(clock)+i*1000).toISOString(),
    discover:!mixed||i!==7,private:mixed&&i===5,hidden:mixed&&i===6});
 }
 return {shares,docs,roles};
}

export function makePublicHandler({productId,workspaceRepo,roleStore,communityRepo,shareRepo,visibilityRepo,legacy=false}){
 const admin=createAdminRoleService({store:roleStore,productId});
 const service=createCommunityService({
  productId,workspaceRepo:legacy?{load:workspaceRepo.load.bind(workspaceRepo)}:workspaceRepo,
  admin:legacy?{roleFor:admin.roleFor.bind(admin)}:admin,
  communityRepo,shareRepo,visibilityRepo,now:()=>Date.parse(clock),random:()=>0.25
 });
 const authenticate=async request=>{
  if(!request.headers?.account)throw new ApiError(401,'unauthenticated','로그인이 필요해요.');
  return {productId,subjectId:request.headers.account};
 };
 const handle=createCommunityHandler({authenticate,service,productId});
 return (path,query={},account=null)=>handle({method:'GET',path,query:new URLSearchParams(query),headers:account?{account}:{}});
}

export const paths={
 shares:'/api/community/shares',stats:'/api/community/stats',moments:'/api/public/moments',tags:'/api/public/tag-moments'
};
export const requests=[
 [paths.shares,{limit:'24'}],
 [paths.shares,{limit:'240',sort:'popular'}],
 [paths.shares,{q:label(1),limit:'24'}],
 [paths.shares,{artist:'검증그룹',emotion:'설렘',limit:'24'}],
 [paths.stats,{}],
 [paths.moments,{}],
 [paths.moments,{limit:'30',exclude:'00000000101',tag:'가수:검증그룹'}],
 [paths.tags,{tag:'가수:검증그룹'}],
 [paths.shares,{limit:'24'},viewer],
 [paths.moments,{limit:'30'},viewer],
 [paths.tags,{tag:'가수:검증그룹'},viewer]
];
export const ceiling=path=>path===paths.stats?2:3;
export function assertSameResponse(before,after,context){
 assert.equal(before.status,200,context+' 기존 처리 상태');
 assert.equal(after.status,200,context+' 일괄 처리 상태');
 assert.ok(Buffer.from(JSON.stringify(before)).equals(Buffer.from(JSON.stringify(after))),context+' 응답 바이트 동일');
}
export async function compareRequests(makeHandler,measure,selected=requests){
 for(const [path,query,account] of selected){
  const old=makeHandler(true),next=makeHandler(false);
  const before=await measure(()=>old(path,query,account));
  const after=await measure(()=>next(path,query,account));
  assertSameResponse(before.response,after.response,path+' '+JSON.stringify(query));
  assert.ok(after.queries<=ceiling(path),path+' 질의 '+after.queries+'회');
 }
}

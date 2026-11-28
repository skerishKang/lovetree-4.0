import {createMemberSession} from '../../public/v41/member-session.mjs';
import {removeMoment,createTree,addMoment} from '../../public/v41/domain.mjs';

const RealDate=Date;
let clock=RealDate.UTC(2026,10,28,0,0,0);
class FakeDate extends RealDate{
  constructor(...args){super(...(args.length?args:[clock]));}
  static now(){return clock;}
}
globalThis.Date=FakeDate;
let uuidCounter=0;
globalThis.crypto.randomUUID=()=>`00000000-0000-4000-8000-${String(++uuidCounter).padStart(12,'0')}`;

function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function clone(value){return structuredClone(value);}
function memStorage(){const map=new Map();return{getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i]??null,get length(){return map.size}};}
function emptyState(){return{version:1,trees:[],prefs:{theme:'night',titleDisplay:'both',displayName:'',accentColor:'',dateStyle:'dot',startPlace:'resume',shareView:'book',shareDiscover:false,treeChipOrder:[],bookDisplay:'book',shelfView:'carousel',homeMoment:{mode:'last',treeId:'',momentId:''}}};}
function ids(state){return(state?.trees||[]).flatMap(t=>t.moments.map(m=>m.id));}
function serial(state){return JSON.stringify(state);}
function iso(){return new Date(clock).toISOString();}
function day(){return iso().slice(0,10);}
function fields(subject,title,note='기억할 마음'){return{subject:'별',title,note,date:day(),emotion:'설렘',url:''};}
async function drain(){for(let i=0;i<6;i++)await Promise.resolve();await new Promise(r=>setImmediate(r));}

export async function runTrace(seed,override=null,options={}){
  clock=RealDate.UTC(2026,10,28,0,0,0)+seed*1000;
  uuidCounter=0;
  const random=rng(seed),replay=override!==null;
  const storage=memStorage();
  const accounts={A:{revision:0,state:emptyState(),keys:new Map(),accepted:[]},B:{revision:0,state:emptyState(),keys:new Map(),accepted:[]}};
  const pending=[],timers=[],sessions=[];
  const lastSeen={A:new Set(),B:new Set()},editCount={A:0,B:0},successCovered={A:null,B:null};
  const owner=new Map(),markers={A:new Set(),B:new Set()},violations=[],actions=[];
  let currentSubject='A',current=null,requestSerial=0,sessionSerial=0,titleSerial=0,step=0,lastAction=null;

  const violation=(rule,detail)=>{if(!violations.some(v=>v.rule===rule))violations.push({rule,step,action:lastAction?{...lastAction}:null,detail});};
  const draftRaw=subject=>storage.getItem(`lovetree.v41.pending-write:${subject}`);
  const draftState=subject=>{try{return JSON.parse(draftRaw(subject)||'null')?.state||null;}catch{return null;}};
  const draftLabel=raw=>{
    if(raw===null)return 'absent';
    try{const item=JSON.parse(raw);return `present(revision=${item.expectedRevision},generation=${item.draftGeneration},key=${item.clientKey})`;}
    catch{return `unreadable(length=${raw.length})`;}
  };
  const observeOwners=(subject,state)=>{for(const id of ids(state))if(!owner.has(id))owner.set(id,subject);};
  const checkMix=(subject,state,where)=>{for(const id of ids(state))if(owner.has(id)&&owner.get(id)!==subject)violation('account-mix',`${where}: ${owner.get(id)} 순간 ${id}가 ${subject} 상태에 있음`);};
  const check=()=>{
    for(const subject of ['A','B']){
      const available=new Set([...ids(accounts[subject].state),...ids(draftState(subject)),...(current?.subject===subject?ids(current.session.state()):[])]);
      for(const id of lastSeen[subject])if(!available.has(id))violation('lost-moment',`${subject}의 마지막 화면 순간 ${id}가 서버·보관본·현재 화면에 없음`);
      const acknowledged=successCovered[subject];
      // 종료된 세션의 성공은 보관본을 삭제할 권한이 없다(#1656).
      // 현재 살아 있는 세션이 마지막 편집을 승인받았을 때만 정리를 요구한다.
      if(acknowledged?.sessionId===current?.id && current?.subject===subject &&
        acknowledged.editCount===editCount[subject] && draftRaw(subject))
        violation('stale-draft',`${subject}: 활성 세션 #${current.id} 요청 #${acknowledged.requestId} 성공 후 expected=absent actual=${draftLabel(draftRaw(subject))}`);
      checkMix(subject,accounts[subject].state,'서버');checkMix(subject,draftState(subject),'보관본');
      const raw=draftRaw(subject);if(raw){try{const parsed=JSON.parse(raw);if(parsed.subject!==subject)violation('account-mix',`보관본 키 ${subject}의 subject가 ${parsed.subject}`);}catch{}}
      const serverIds=new Set(ids(accounts[subject].state));for(const id of markers[subject])if(!serverIds.has(id))violation('other-device-overwrite',`다른 기기 순간 ${id}가 서버에서 사라짐`);
    }
    if(current)checkMix(current.subject,current.session.state(),'현재 화면');
  };

  const applyServer=request=>{
    const subject=request.subject,account=accounts[subject];
    const hash=JSON.stringify({state:request.body.state,expectedRevision:request.body.expectedRevision,expectedSubject:subject});
    const known=account.keys.get(request.body.clientKey);
    if(known)return known.hash===hash?clone(known.result):{ok:false,status:409,code:'client_key_conflict'};
    if(account.revision!==request.body.expectedRevision)return{ok:false,status:409,code:'revision_conflict',currentRevision:account.revision};
    const bytes=new TextEncoder().encode(JSON.stringify(request.body)).byteLength;if(bytes>65536)return{ok:false,status:413,code:'payload_too_large',message:'too large'};
    const stateSerial=serial(request.body.state),last=account.accepted.at(-1);
    if(last&&last.stateSerial===stateSerial&&last.clientKey!==request.body.clientKey)violation('duplicate-client-key',`${subject}: 같은 내용을 ${last.clientKey}와 ${request.body.clientKey}로 두 번 저장`);
    account.state=clone(request.body.state);account.revision+=1;observeOwners(subject,account.state);
    const result={ok:true,revision:account.revision};account.keys.set(request.body.clientKey,{hash,result:clone(result)});account.accepted.push({stateSerial,clientKey:request.body.clientKey,revision:account.revision});
    const serverIds=new Set(ids(account.state));for(const id of markers[subject])if(!serverIds.has(id))violation('other-device-overwrite',`${subject}: 로컬 저장이 다른 기기 순간 ${id}를 덮음`);
    return result;
  };

  const makeSession=async(subject,reason)=>{
    const ref={id:++sessionSerial,subject,active:true,session:null,undos:[]};
    const api={
      get:async()=>({ok:true,revision:accounts[subject].revision,state:clone(accounts[subject].state),subject,writeSubjectBound:true}),
      put:(body,options)=>new Promise(resolve=>pending.push({id:++requestSerial,ref,subject,body:clone(body),options:clone(options||{}),editCountAtSend:editCount[subject],resolve,step})),
      logout:async()=>({ok:true})
    };
    ref.session=createMemberSession({api,delay:ms=>new Promise(resolve=>timers.push({due:clock+ms,resolve})),makeClientKey:()=>`k-${seed}-${requestSerial+1}`,draftStorage:storage,cacheStorage:null,onState:state=>{if(ref.active)observeOwners(subject,state);}});
    sessions.push(ref);current=ref;currentSubject=subject;await ref.session.start();await drain();return ref;
  };

  const saveOtherDevice=subject=>{
    const account=accounts[subject];let state=clone(account.state),tree=state.trees[0];if(!tree)tree=createTree(fields(subject,`${subject}-base`),iso());
    const grown=addMoment(tree,fields(subject,`OTHER-${subject}-${++titleSerial}`,'다른 기기'),tree.moments[0].id,iso());
    state={...state,trees:[grown,...state.trees.filter(t=>t.id!==grown.id)]};account.state=state;account.revision+=1;
    const marker=grown.moments.at(-1).id;owner.set(marker,subject);markers[subject].add(marker);observeOwners(subject,state);
  };
  const pickMoment=()=>{const state=current.session.state(),all=state.trees.flatMap(t=>t.moments.map(m=>({tree:t,moment:m})));return all.length?all[Math.floor(random()*all.length)]:null;};
  const leaveWithGuard=async(descriptor,target,reason)=>{
    current.session.flushOnHide();const covered=!!draftState(currentSubject)&&serial(draftState(currentSubject))===serial(current.session.state());
    if(current.session.snapshot().dirty&&!covered){descriptor.blockedByLeaveGuard=true;return;}
    current.active=false;current.session.dispose();await makeSession(target,reason);
  };

  const execute=async descriptor=>{
    lastAction=descriptor;step+=1;if(descriptor.skipped){await drain();check();return descriptor;}const type=descriptor.type;
    if(type==='add'){
      const snap=current.session.snapshot();
      if(snap.owned&&snap.writable&&!['checking','login','conflict'].includes(snap.phase)){
        const state=current.session.state(),title=descriptor.title||`${currentSubject}-${++titleSerial}`;let applied=false;
        try{
          if(!state.trees.length){descriptor.title=title;current.session.apply('new',fields(currentSubject,title));applied=true;}
          else{const tree=replay&&descriptor.treeId?state.trees.find(t=>t.id===descriptor.treeId):state.trees[Math.floor(random()*state.trees.length)];const parent=replay&&descriptor.parentId?tree.moments.find(m=>m.id===descriptor.parentId):tree.moments[Math.floor(random()*tree.moments.length)];if(tree&&parent){descriptor.title=title;descriptor.treeId=tree.id;descriptor.parentId=parent.id;current.session.apply('add',fields(currentSubject,title),{treeId:tree.id,momentId:parent.id});applied=true;}}
          if(applied){editCount[currentSubject]++;observeOwners(currentSubject,current.session.state());lastSeen[currentSubject]=new Set(ids(current.session.state()));}else descriptor.skipped=true;
        }catch{descriptor.skipped=true;}
      }else descriptor.skipped=true;
    }else if(type==='edit'){
      const snap=current.session.snapshot(),state=current.session.state();
      const picked=replay&&descriptor.treeId?(()=>{const tree=state.trees.find(t=>t.id===descriptor.treeId);return tree?{tree,moment:tree.moments.find(m=>m.id===descriptor.momentId)}:null;})():pickMoment();
      if(picked?.moment&&snap.owned&&snap.writable&&!['checking','login','conflict'].includes(snap.phase)){
        try{const title=descriptor.title||`${currentSubject}-edit-${++titleSerial}`,large=descriptor.large??random()<0.01;descriptor.title=title;descriptor.large=large;descriptor.treeId=picked.tree.id;descriptor.momentId=picked.moment.id;current.session.apply('edit',{...fields(currentSubject,title,large?'가'.repeat(70000):'수정된 마음')},{treeId:picked.tree.id,momentId:picked.moment.id});editCount[currentSubject]++;observeOwners(currentSubject,current.session.state());lastSeen[currentSubject]=new Set(ids(current.session.state()));}catch{descriptor.skipped=true;}
      }else descriptor.skipped=true;
    }else if(type==='delete'){
      const snap=current.session.snapshot(),state=current.session.state();
      const picked=replay&&descriptor.treeId?(()=>{const tree=state.trees.find(t=>t.id===descriptor.treeId);return tree?{tree,moment:tree.moments.find(m=>m.id===descriptor.momentId)}:null;})():pickMoment();
      if(picked?.moment&&picked.tree.moments.length>1&&snap.owned&&snap.writable&&!['checking','login','conflict'].includes(snap.phase)){
        try{const record={treeId:picked.tree.id,before:clone(picked.tree),after:removeMoment(picked.tree,picked.moment.id,iso())};descriptor.treeId=picked.tree.id;descriptor.momentId=picked.moment.id;current.session.apply('delete',{}, {treeId:picked.tree.id,momentId:picked.moment.id});current.undos.push(record);if(markers[currentSubject].has(picked.moment.id))markers[currentSubject].delete(picked.moment.id);editCount[currentSubject]++;observeOwners(currentSubject,current.session.state());lastSeen[currentSubject]=new Set(ids(current.session.state()));}catch{descriptor.skipped=true;}
      }else descriptor.skipped=true;
    }else if(type==='undo'){
      const snap=current.session.snapshot();let applied=false;
      while(current.undos.length&&snap.owned&&snap.writable&&!['checking','login','conflict'].includes(snap.phase)){const record=descriptor.record||current.undos.pop();try{current.session.apply('undoDelete',{record,momentId:record.before.moments[0].id});descriptor.record=record;editCount[currentSubject]++;observeOwners(currentSubject,current.session.state());lastSeen[currentSubject]=new Set(ids(current.session.state()));applied=true;break;}catch{}}
      if(!applied)descriptor.skipped=true;
    }else if(type==='retry'){try{void current.session.act('retry');}catch{}}
    else if(type==='respond'){
      if(descriptor.noRequest){await drain();check();return descriptor;}
      const request=descriptor.requestId?pending.find(r=>r.id===descriptor.requestId):pending[replay?0:Math.floor(random()*pending.length)];
      if(request){
        pending.splice(pending.indexOf(request),1);const outcome=descriptor.outcome||['success','success','401','409','network','413','client-key'][Math.floor(random()*7)];descriptor.requestId=request.id;descriptor.outcome=outcome;let answer;
        const ended=!request.ref.active;
        const beforeDrafts=ended?{A:draftRaw('A'),B:draftRaw('B')}:null;
        if(outcome==='success'){answer=applyServer(request);}
        else if(outcome==='lost-success'){const applied=applyServer(request);answer=applied.ok?{ok:false,status:0}:applied;}
        else if(outcome==='401')answer={ok:false,status:401,code:'unauthenticated'};
        else if(outcome==='409'){if(accounts[request.subject].revision===request.body.expectedRevision)saveOtherDevice(request.subject);answer={ok:false,status:409,code:'revision_conflict',currentRevision:accounts[request.subject].revision};}
        else if(outcome==='client-key'){const known=accounts[request.subject].keys.get(request.body.clientKey);answer=known?clone(known.result):{ok:false,status:0};}
        else if(outcome==='413'){const bytes=new TextEncoder().encode(JSON.stringify(request.body)).byteLength;answer=bytes>65536?{ok:false,status:413,code:'payload_too_large',message:'too large'}:{ok:false,status:0};}
        else answer={ok:false,status:0};
        if(answer.ok&&request.ref.active)
          successCovered[request.subject]={sessionId:request.ref.id,requestId:request.id,editCount:request.editCountAtSend};
        request.resolve(answer);await drain();
        if(ended)for(const subject of ['A','B']){
          const actual=draftRaw(subject),expected=beforeDrafts[subject];
          if(actual!==expected)violation('closed-session-draft-mutation',
            `closed session #${request.ref.id}, response #${request.id}: ${subject} draft expected=${draftLabel(expected)} actual=${draftLabel(actual)}`);
        }
      }else if(!replay)descriptor.noRequest=true;
    }else if(type==='hide-visibility'||type==='hide-pagehide'){current.session.flushOnHide();await drain();}
    else if(type==='refresh'||type==='relogin-same'){await leaveWithGuard(descriptor,currentSubject,type);}
    else if(type==='relogin-other'){await leaveWithGuard(descriptor,currentSubject==='A'?'B':'A',type);}
    else if(type==='other-device'){saveOtherDevice(currentSubject);}
    else if(type==='wait-900'){clock+=900;timers.sort((a,b)=>a.due-b.due);while(timers.length&&timers[0].due<=clock){timers.shift().resolve();await drain();}}
    else if(type==='delay-response'){const ms=descriptor.ms??50+Math.floor(random()*450);descriptor.ms=ms;clock+=ms;}
    await drain();check();return descriptor;
  };

  const choose=()=>{const types=['add','add','add','edit','edit','delete','undo','retry','retry','respond','respond','respond','hide-visibility','hide-pagehide','refresh','relogin-same','relogin-other','other-device','wait-900','delay-response'];return{type:types[Math.floor(random()*types.length)]};};
  await makeSession('A','initial');const list=override?clone(override):Array.from({length:20+Math.floor(random()*41)},()=>choose());
  for(const descriptor of list){await execute(descriptor);actions.push(descriptor);if(options.targetRule&&violations.some(v=>v.rule===options.targetRule))break;}
  for(const ref of sessions)ref.session.dispose();return{seed,steps:actions.length,actions,violations};
}

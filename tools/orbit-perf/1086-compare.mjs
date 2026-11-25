import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {startCpuSampling,startTrace,reportGaps} from './1086-trace.mjs';

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2'};
export const combinations=[[1440,900,'night'],[1440,900,'garden'],[390,844,'night'],[390,844,'garden'],[800,900,'night']];
const backgroundFlags=['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'];
const phase=.2;
export async function compareOrbit({main,current,headed=false,out,only,variants=['before','after'],captureOnly=false,measureOnly=false,traceEnabled=false}){
 const roots={before:path.resolve(main),after:path.resolve(current)};
 const server=createServer(async(req,res)=>{
  const clean=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const [,variant,...parts]=clean.split('/'),root=roots[variant];
  if(!root){res.writeHead(404);res.end();return;}
  const relative=parts.join('/');
  for(const file of [path.resolve(root,relative),path.resolve(root,relative,'index.html')]){
   if(!file.startsWith(root+path.sep))continue;
   try{if(!(await stat(file)).isFile())continue;res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});createReadStream(file).pipe(res);return;}catch{}
  }
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 let browser,browserPid,awake,cpuSampler;const results=[],captures={};
 const visibleWindow=()=>{
  if(!headed||process.platform!=='win32')return;
  const ps='Add-Type -TypeDefinition \'using System;using System.Runtime.InteropServices;public class OrbitWindow{[DllImport("user32.dll")]public static extern bool IsIconic(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int n);[DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int t,uint flags);}\';$h=(Get-Process -Id '+browserPid+').MainWindowHandle;if($h -eq 0){exit 2};if([OrbitWindow]::IsIconic($h)){[void][OrbitWindow]::ShowWindow($h,9)};if(-not [OrbitWindow]::SetWindowPos($h,[IntPtr](-1),0,0,0,0,67)){exit 3};if([OrbitWindow]::IsIconic($h)){exit 4}';
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',ps],{windowsHide:true});
 };
 const boot=async(width,height,theme,variant,motion,body)=>{
  const context=await browser.newContext({viewport:{width,height},reducedMotion:motion});
  try{
   await context.addInitScript(t=>localStorage.setItem('lt41.theme',t),theme);
   if(traceEnabled)await context.addInitScript(()=>{globalThis.__LT_ORBIT_PROFILE__=true;});
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==base)return route.abort();return route.fetch({url:base+'/'+variant+u.pathname+u.search}).then(response=>route.fulfill({response}));});
   const page=await context.newPage();await page.goto(base+'/v41/',{waitUntil:'load'});await page.bringToFront();await page.mouse.move(0,0);
   let frame;for(let i=0;i<80;i++){frame=page.frames().find(f=>f.url().includes('home.html'));if(frame)break;await page.waitForTimeout(250);}
   assert.ok(frame,'첫 화면 문서 확인');
   await frame.waitForFunction(v=>{const host=document.querySelector('main#orbit'),s=host?.shadowRoot,t=globalThis.__LT_ORBIT_TEST__,active=s?[...s.querySelectorAll('.card:not(.off)')].filter(e=>host.dataset.ltLayout==='ribbon'||e.style.transform):[];return s&&t&&(v==='before'||t.canvasReady())&&active.length>=(host.dataset.ltLayout==='ribbon'?6:9);},variant);
   if(variant==='after')assert.equal(await frame.evaluate(()=>{const host=document.querySelector('main#orbit');return host.dataset.ltLayout==='ribbon'?'ribbon':globalThis.__LT_ORBIT_TEST__.renderer();}),await frame.evaluate(()=>document.querySelector('main#orbit').dataset.ltLayout==='ribbon'?'ribbon':'webgl'));
   await page.waitForTimeout(1500);
   return await body(page,frame);
  }finally{await context.close();}
 };
 // #1229: 기준·변경본을 묶음 하나씩 번갈아 잰다(before 1 → after 1 → before 2 …). 같은 실행기의 부하 변화를 양쪽이 나눠 갖게 한다.
 // 판정 기준(초과 수·최대 간격 비교)은 그대로다.
 const pending={};
 const measure=async(page,frame,width,theme,variant,first=0,count=3)=>{
  const key=width+'-'+theme+'-'+variant,slot=pending[key]||(pending[key]={groups:[],attempts:[],advanced:0});
  const groups=slot.groups,attempts=slot.attempts;
  const ribbon=await frame.evaluate(()=>document.querySelector('main#orbit').dataset.ltLayout==='ribbon');
  const initial=await frame.evaluate(ribbon=>{const hook=globalThis.__LT_ORBIT_TEST__;return ribbon?hook.ribbonTime():hook.lastWriteAt();},ribbon);
  for(let i=first;i<first+count;i++){
   for(let attempt=1;;attempt++){
    if(headed){await page.bringToFront();visibleWindow();}
    const traceKey=width+"-"+theme+"-"+variant+"-"+(i+1)+"-"+attempt;
    const stopTrace=traceEnabled?await startTrace(browser):null;
    let data,events;
    try{data=await frame.evaluate(async ({traceEnabled,ribbon,initial})=>{
     const t=globalThis.__LT_ORBIT_TEST__,visibility=new Set([document.visibilityState]),changes=[];
     const change=()=>{visibility.add(document.visibilityState);changes.push({at:performance.now(),state:document.visibilityState});};
     document.addEventListener("visibilitychange",change);
     const anchor=traceEnabled?performance.mark("orbit:trace-anchor").startTime:null;
     try{
      const frames=await new Promise(resolve=>{const frames=[];let start;function tick(now){visibility.add(document.visibilityState);if(start===undefined)start=now;frames.push(now);if(now-start>=10000)resolve(frames);else requestAnimationFrame(tick);}requestAnimationFrame(tick);});
      return {frames,anchor,timeOrigin:performance.timeOrigin,visibility:[...visibility],changes,advanced:ribbon?t.ribbonAdvanced(initial):t.lastWriteAt()-initial,theme:document.querySelector('main#orbit').getAttribute('data-lt-theme')||document.documentElement.getAttribute('data-lt-theme')||'night'};
     }finally{document.removeEventListener('visibilitychange',change);}
    },{traceEnabled,ribbon,initial});}finally{if(stopTrace)events=await stopTrace(path.join(out,traceKey+"-trace.json"));}
    if(events)await reportGaps(events,data,out,path.join(out,traceKey+"-gaps.json"));
    const gaps=data.frames.slice(1).map((x,i)=>x-data.frames[i]),topVisibility=await page.evaluate(()=>document.visibilityState);
    const group={frames:gaps.length,over50:gaps.filter(x=>x>50).length,max:Math.max(...gaps),median:[...gaps].sort((a,b)=>a-b)[Math.floor(gaps.length/2)],visibility:data.visibility,topVisibility,near1000:gaps.filter(x=>x>=850&&x<=1150).length,advanced:data.advanced};
    const valid=group.visibility.length===1&&group.visibility[0]==='visible'&&topVisibility==='visible'&&group.near1000===0;
    attempts.push({group:i+1,attempt,valid,summary:group,data});
    if(out)await writeFile(path.join(out,width+'-'+theme+'-'+variant+'.json'),JSON.stringify({attempts}));
    console.log(JSON.stringify({width,theme,variant,group:i+1,attempt,valid,...group}));
    assert.equal(data.theme,theme);
    if(valid){assert.ok(data.advanced>=9500,'측정 중 궤도 동작 확인');groups.push(group);break;}
    // 창의 가시성 오류만 재측정한다. 실제 긴 프레임은 그대로 판정에 포함한다.
    assert.ok(headed&&attempt<3,'가시성 또는 백그라운드 프레임 제한으로 측정 무효');
   }
  }
  slot.advanced+=await frame.evaluate(({ribbon,initial})=>{const hook=globalThis.__LT_ORBIT_TEST__;return ribbon?hook.ribbonAdvanced(initial):hook.lastWriteAt()-initial;},{ribbon,initial});
  if(groups.length<3)return;
  assert.ok(slot.advanced>=30000,'실제 궤도 30초 동안 움직임 확인');
  const result={width,theme,variant,groups};results.push(result);console.log(JSON.stringify(result));
  if(out){await writeFile(path.join(out,width+'-'+theme+'-'+variant+'.json'),JSON.stringify({result,attempts}));await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));}
 };
 const capture=async(page,frame,width,height,theme,variant)=>{
  // 모바일의 떠 있는 단추 여백까지 준비된 다음 실제 크기 변화로 궤도 표를 다시 굽는다.
  if(width===390){
   for(const size of [width+2,width]){
    await page.setViewportSize({width:size,height});
    await frame.evaluate(async()=>{await document.fonts.ready;for(let i=0;i<6;i++)await new Promise(requestAnimationFrame);});
    if(variant==='after')await frame.waitForFunction(()=>globalThis.__LT_ORBIT_TEST__.canvasSettled());
   }
  }
  // 두 화면 모두 글꼴과 실제 배치 갱신을 끝낸 뒤 같은 위상을 고정한다.
  await frame.evaluate(async()=>{await document.fonts.ready;dispatchEvent(new Event('resize'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  if(variant==='after')await frame.waitForFunction(()=>globalThis.__LT_ORBIT_TEST__.canvasSettled());
  const snapshot=()=>{const root=document.querySelector('main#orbit').shadowRoot;return [...root.querySelectorAll('.card:not(.off)')].map(el=>({label:el.querySelector('.surface')?.getAttribute('aria-label'),transform:document.querySelector('main#orbit').dataset.ltLayout==='ribbon'?getComputedStyle(el).transform:el.style.transform,z:Number(getComputedStyle(el).zIndex),clash:el.classList.contains('clash'),under:el.classList.contains('lt-under-link')}));};
  const fixed=await frame.evaluate(async phase=>{
   const t=globalThis.__LT_ORBIT_TEST__,root=document.querySelector('main#orbit').shadowRoot;t.hold(true);
   for(const a of root.getAnimations())if(a.id==='lt-float'){a.pause();a.currentTime=0;}
   t.pauseFloat?.();t.seek(phase);
   // 기존 DOM의 가림 판정도 고정 위치에 맞춰 다시 실행한다.
   dispatchEvent(new Event('resize'));
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   t.seek(phase);
   return [...root.querySelectorAll('.card:not(.off)')].map(el=>({label:el.querySelector('.surface')?.getAttribute('aria-label'),transform:document.querySelector('main#orbit').dataset.ltLayout==='ribbon'?getComputedStyle(el).transform:el.style.transform,z:Number(getComputedStyle(el).zIndex),clash:el.classList.contains('clash'),under:el.classList.contains('lt-under-link')}));
  },phase);
  assert.equal(fixed.length,width===1440?28:width===390?(variant==='before'?9:8):width===800?14:9);
  assert.ok(fixed.every(c=>c.transform),'고정 위치의 카드 변환값 확인');
  if(variant==="after"){await frame.waitForFunction(()=>globalThis.__LT_ORBIT_TEST__.canvasSettled());await frame.evaluate(phase=>globalThis.__LT_ORBIT_TEST__.seek(phase),phase);}
  const styles=await frame.evaluate(()=>{
   const root=document.querySelector('main#orbit').shadowRoot,stats=globalThis.__LT_ORBIT_TEST__.rasterStats?.();
   const describe=(node,pseudo)=>{if(!node)return null;const s=getComputedStyle(node,pseudo);return Object.fromEntries(['filter','opacity','mixBlendMode','backgroundColor','backgroundImage','objectFit','objectPosition','transform','visibility','content'].map(k=>[k,s[k]]));};
   return [...root.querySelectorAll('.card:not(.off)')].map((el,i)=>{const img=el.querySelector('img'),r=el.getBoundingClientRect();return {i,label:el.querySelector('.surface')?.getAttribute('aria-label'),rect:{x:r.x,y:r.y,w:r.width,h:r.height},classes:el.className,src:img?.currentSrc?.split('/').at(-1),natural:[img?.naturalWidth,img?.naturalHeight],sat:getComputedStyle(el).getPropertyValue('--sat'),bright:getComputedStyle(el).getPropertyValue('--bright'),card:describe(el),image:describe(img),surface:describe(el.querySelector('.surface')),move:describe(el.querySelector('.lt-move')),lift:describe(el.querySelector('.lt-lift')),before:describe(el,'::before'),after:describe(el,'::after'),surfaceBefore:describe(el.querySelector('.surface'),'::before'),surfaceAfter:describe(el.querySelector('.surface'),'::after'),raster:stats?.[i]};});
  });
  await writeFile(path.join(out,width+'-'+theme+'-'+variant+'-styles.json'),JSON.stringify(styles,null,2));
  await page.screenshot({path:path.join(out,width+'-'+theme+'-'+variant+'.png')});
  assert.deepEqual(await frame.evaluate(snapshot),fixed,'캡처 중 궤도 위치 고정');
  captures[width+'-'+theme+'-'+variant]={phase,floatTime:0,cards:fixed};
  await writeFile(path.join(out,'capture-poses.json'),JSON.stringify(captures,null,2));
  console.log('CAPTURE',width,theme,variant,phase,fixed.length);
 };
 try{
  if(out)await mkdir(out,{recursive:true});
  if(traceEnabled){assert.ok(headed&&out&&process.platform==="win32");cpuSampler=startCpuSampling(out);}
  if(headed&&process.platform==='win32'){
   // 시험 프로세스가 살아 있는 동안만 화면 절전 요청을 유지한다. 시스템 설정을 바꾸지 않는다.
   const ps='Add-Type -TypeDefinition \'using System;using System.Runtime.InteropServices;public class OrbitAwake{[DllImport("kernel32.dll")]public static extern uint SetThreadExecutionState(uint flags);}\';if([OrbitAwake]::SetThreadExecutionState([uint32]2147483651) -eq 0){exit 2};try{while(Get-Process -Id '+process.pid+' -ErrorAction SilentlyContinue){Start-Sleep -Seconds 2}}finally{[void][OrbitAwake]::SetThreadExecutionState([uint32]2147483648)}';
   awake=spawn('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',ps],{windowsHide:true,stdio:'ignore'});
  }
  browser=await chromium.launch(headed?{channel:'chrome',headless:false,ignoreDefaultArgs:['--disable-gpu'],args:['--start-maximized',...backgroundFlags,'--disable-features=CalculateNativeWinOcclusion']}:{headless:true});
  if(headed){
   const p=await browser.newPage();
   try{
    await p.goto('chrome://gpu');
    const line=await p.waitForFunction(()=>{function scan(root){let text=root.innerText||root.textContent||'';for(const e of root.querySelectorAll('*'))if(e.shadowRoot)text+='\n'+scan(e.shadowRoot);return text;}return scan(document).match(/Compositing\s*:\s*Hardware accelerated/i)?.[0]||false;},null,{timeout:15000}).then(x=>x.jsonValue());
    const session=await browser.newBrowserCDPSession(),gpu=(await session.send('SystemInfo.getInfo')).gpu.featureStatus;
    browserPid=(await session.send('SystemInfo.getProcessInfo')).processInfo.find(p=>p.type==='browser')?.id;assert.ok(browserPid);
    await p.goto('chrome://version');
    const profile=await p.locator('#profile_path').innerText(),args=await p.locator('#command_line').innerText();
    assert.ok(path.resolve(profile.trim()).toLowerCase().startsWith(path.resolve(os.tmpdir()).toLowerCase()+path.sep)&&args.includes('--user-data-dir='),'임시 프로필 확인');
    assert.ok(backgroundFlags.every(flag=>args.includes(flag))&&!/(?:^|\\s)--disable-gpu(?:\\s|$)/.test(args));
    assert.equal(gpu.gpu_compositing,'enabled');console.log('GPU',line,JSON.stringify({gpu,temporaryProfile:true,backgroundFlags}));
    if(out)await writeFile(path.join(out,'gpu.json'),JSON.stringify({line,gpu,temporaryProfile:true,backgroundFlags},null,2));
   }finally{await p.close();}
  }
  for(const [width,height,theme] of combinations.filter(x=>!only||only.split(',').includes(x[0]+'-'+x[2]))){
   if(!captureOnly)for(let g=0;g<3;g++)for(const variant of variants)await boot(width,height,theme,variant,'no-preference',(p,f)=>measure(p,f,width,theme,variant,g,1));
   if(out&&!measureOnly)for(const variant of variants)await boot(width,height,theme,variant,'reduce',(p,f)=>capture(p,f,width,height,theme,variant));
   if(out&&!measureOnly&&variants.length===2){
    const a=captures[width+'-'+theme+'-before'],b=captures[width+'-'+theme+'-after'];
    assert.equal(a.phase,b.phase);assert.equal(a.floatTime,b.floatTime);
    const pose=({label,transform,z})=>({label,transform,z});
    if(width===390){assert.equal(a.cards.length,9);assert.equal(b.cards.length,8);console.log('RIBBON',width,theme,'9→8');}
    else{
     assert.deepEqual(a.cards.map(pose),b.cards.map(pose),'기존 화면과 새 화면의 고정 궤도 위치 및 쌓임 순서');
     const guardDiff=a.cards.flatMap((c,i)=>c.clash!==b.cards[i].clash||c.under!==b.cards[i].under?[i]:[]);
     console.log('GUARD',width,theme,JSON.stringify(guardDiff));
    }
   }
  }
  return results;
 }finally{try{await browser?.close();}finally{awake?.kill();cpuSampler?.kill();server.close();}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [main,current,out]=process.argv.slice(2);await compareOrbit({main,current,out,headed:process.argv.includes('--headed'),captureOnly:process.argv.includes('--capture-only'),measureOnly:process.argv.includes('--measure-only'),traceEnabled:process.argv.includes('--trace'),only:process.argv.find(x=>x.startsWith('--only='))?.slice(7),variants:process.argv.includes('--after')?['after']:process.argv.includes('--before')?['before']:['before','after']});
}

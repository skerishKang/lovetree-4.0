import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

// 각 묶음의 원본 추적과 운영체제 표본을 별개로 남긴다. 외부 원인이라고 자동 판정하지 않는다.
const categories=['devtools.timeline','gpu','v8.gc','disabled-by-default-v8.gc','disabled-by-default-devtools.timeline.frame','blink.user_timing','toplevel','cc','viz'];
export function startCpuSampling(out){
 const file=path.join(out,'cpu-top5.jsonl');
 const ps=`$f='${file.replaceAll("'","''")}';$enc=New-Object Text.UTF8Encoding($false);$cores=[Environment]::ProcessorCount
 function Snap{$d=@{};foreach($p in Get-Process){try{if($null -ne $p.CPU){$d[$p.Id]=@($p.ProcessName,[double]$p.CPU)}}catch{}};return $d}
 $last=Snap;$at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
 while(Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue){
 Start-Sleep -Milliseconds 1000;$next=Snap;$now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();$elapsed=($now-$at)/1000
 $rows=@(foreach($id in $next.Keys){if($last.ContainsKey($id)){$delta=$next[$id][1]-$last[$id][1];if($delta -ge 0){[pscustomobject]@{pid=$id;name=$next[$id][0];corePercent=[Math]::Round(100*$delta/$elapsed,2);cpuPercent=[Math]::Round(100*$delta/$elapsed/$cores,2)}}}})
 $row=[pscustomobject]@{from=$at;to=$now;logicalCores=$cores;totalCPU=[Math]::Round(($rows|Measure-Object -Property cpuPercent -Sum).Sum,2);top=@($rows|Sort-Object corePercent -Descending|Select-Object -First 5)}
 [IO.File]::AppendAllText($f,($row|ConvertTo-Json -Depth 5 -Compress)+[Environment]::NewLine,$enc);$last=$next;$at=$now
 }`;
 return spawn('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',ps],{windowsHide:true,stdio:'ignore'});
}
export async function startTrace(browser){
 const session=await browser.newBrowserCDPSession();
 await session.send('Tracing.start',{transferMode:'ReturnAsStream',traceConfig:{recordMode:'recordAsMuchAsPossible',includedCategories:categories}});
 return async(file)=>{
  try{
   const ended=new Promise(resolve=>session.once('Tracing.tracingComplete',resolve));
   await session.send('Tracing.end');const {stream,dataLossOccurred}=await ended;
   if(!stream||dataLossOccurred)throw Error('성능 기록 손실');
   let raw='';try{for(;;){const r=await session.send('IO.read',{handle:stream,size:1048576});raw+=r.base64Encoded?Buffer.from(r.data,'base64').toString('utf8'):r.data;if(r.eof)break;}}finally{await session.send('IO.close',{handle:stream});}
   await writeFile(file,raw);return JSON.parse(raw).traceEvents;
  }finally{await session.detach();}
 };
}
export async function reportGaps(events,data,out,file){
 const anchor=events.find(e=>e.name==='orbit:trace-anchor'&&e.cat?.includes('user_timing'));
 if(!anchor)throw Error('성능 기록 시각 기준 없음');
 const procs=new Map(),threads=new Map();
 for(const e of events){if(e.name==='process_name')procs.set(e.pid,e.args?.name);if(e.name==='thread_name')threads.set(e.pid+':'+e.tid,e.args?.name);}
 const timed=events.filter(e=>e.ph==='X'&&e.dur>0);
 const marks=events.filter(e=>e.name?.startsWith('orbit:event:'));
 const cpuRaw=await readFile(path.join(out,'cpu-top5.jsonl'),'utf8');
 const cpu=cpuRaw.trim().split(/\r?\n/).filter(Boolean).flatMap(s=>{try{return [JSON.parse(s)];}catch{return [];}});
 const gaps=[];
 for(let i=1;i<data.frames.length;i++){
  const gap=data.frames[i]-data.frames[i-1];if(gap<=50)continue;
  const start=anchor.ts+(data.frames[i-1]-data.anchor)*1000,end=start+gap*1000;
  const wallStart=data.timeOrigin+data.frames[i-1],wallEnd=wallStart+gap;
  const grouped=new Map();
  for(const e of timed){const overlap=Math.min(e.ts+e.dur,end)-Math.max(e.ts,start);if(overlap<=0)continue;const key=[e.pid,e.tid,e.name].join(':');const row=grouped.get(key)||{pid:e.pid,process:procs.get(e.pid)||'',tid:e.tid,thread:threads.get(e.pid+':'+e.tid)||'',task:e.name,overlapMs:0,maxMs:0,count:0};row.overlapMs+=overlap/1000;row.maxMs=Math.max(row.maxMs,overlap/1000);row.count++;grouped.set(key,row);}
  const tasks=[...grouped.values()].sort((a,b)=>b.overlapMs-a.overlapMs).slice(0,35);
  gaps.push({index:i,frameGap:gap,elapsed:data.frames[i-1]-data.frames[0],wallStart,wallEnd,tasks,orbitEvents:marks.filter(e=>e.ts>=start-1000&&e.ts<=end+1000).map(e=>({name:e.name,offsetMs:(e.ts-start)/1000})),cpu:cpu.filter(c=>c.from<=wallEnd&&c.to>=wallStart)});
 }
 await writeFile(file,JSON.stringify({gaps},null,2));return gaps;
}

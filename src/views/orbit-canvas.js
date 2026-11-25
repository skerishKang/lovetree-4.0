// #1086: 정지된 카드 표면을 비트맵으로 만들고 궤도는 한 캔버스에 그린다.
const PAD=96;
import shadowShapes from './orbit-shadow.json' with { type: 'json' };
const shadowImages=new Map();
// 브라우저가 그린 정원 그림자의 투명 가장자리를 그대로 사용한다.
// 원본 PNG의 알파는 캔버스에서 한 번 합성하고 텍스처로 넘길 때 한 번만 미리 곱한다.
async function gardenShadow(w,h,r,dpr,shadow){
 const key=w+'x'+h+'x'+r;
 if(shadowShapes[key]?.shadow!==shadow)return null;
 const asset=key+'-'+(dpr>1?2:1);
 if(!shadowImages.has(asset)){
  const img=new Image();img.src='/media/orbit/shadow/'+asset+'.png';
  shadowImages.set(asset,img.decode().then(()=>img,()=>null));
 }
 return shadowImages.get(asset);
}
function round(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,Math.max(0,r));}
function font(ctx,cs){ctx.font=cs.font||[cs.fontWeight,cs.fontSize,cs.fontFamily].join(' ');ctx.fillStyle=cs.color;ctx.textBaseline='middle';if('letterSpacing' in ctx)ctx.letterSpacing=cs.letterSpacing==='normal'?'0px':cs.letterSpacing;}
function textLines(ctx,text,x,y,w,step,max=5){
 let line='',n=0;
 for(const ch of text){if(ctx.measureText(line+ch).width>w&&line){ctx.fillText(line,x,y+n*step);n++;line='';if(n>=max)return;}line+=ch;}
 if(line&&n<max)ctx.fillText(line,x,y+n*step);
}
function shadowParts(value){
 return (value||'').split(/,(?![^(]*\))/).map(s=>{const color=s.match(/rgba?\([^)]*\)|#[a-f\d]{3,8}/i)?.[0];const nums=s.replace(color||'','').match(/-?[\d.]+px/g)?.map(parseFloat)||[];return {color,x:nums[0]||0,y:nums[1]||0,blur:nums[2]||0,spread:nums[3]||0};}).filter(x=>x.color);
}
function badge(ctx,el,x,y,css,text){
 if(!text||Number(css.opacity)===0)return;
 const w=parseFloat(css.width)||ctx.measureText(text).width+14,h=parseFloat(css.height)||24;
 const r=Math.min(w,h)/2;ctx.fillStyle=css.backgroundColor;round(ctx,x,y,w,h,r);ctx.fill();
 ctx.strokeStyle=css.borderColor;ctx.lineWidth=parseFloat(css.borderWidth)||1;ctx.stroke();
 font(ctx,css);ctx.textAlign='center';ctx.fillText(text,x+w/2,y+h/2,w-4);ctx.textAlign='start';
}
function cardTip(ctx,el,x,y){
 const tip=el.querySelector('.lt-card-tip');if(!tip)return;
 const css=getComputedStyle(tip),w=tip.offsetWidth,h=tip.offsetHeight;if(!w||!h)return;
 const left=x+(tip.offsetLeft||0)-w/2,top=y+(tip.offsetTop||0);
 ctx.fillStyle=css.backgroundColor;round(ctx,left,top,w,h,h/2);ctx.fill();ctx.strokeStyle=css.borderTopColor;ctx.lineWidth=parseFloat(css.borderTopWidth)||1;ctx.stroke();
 font(ctx,css);ctx.textAlign='center';ctx.fillText(tip.textContent||'',left+w/2,top+h/2,w-4);ctx.textAlign='start';
}
function posValue(str,space){return str?.endsWith('%')?space*parseFloat(str)/100:parseFloat(str)||0;}
export async function paintCardBitmap(el,dpr,hover=false,offset={x:0,y:0}){
 const w=el.offsetWidth,h=el.offsetHeight;if(!w||!h)return null;
 const css=getComputedStyle(el),surface=el.querySelector('.surface'),sc=getComputedStyle(surface);
 const depth=css.getPropertyValue('--lt-orbit-depth').match(/brightness\(([\d.]+)\) blur\(([\d.]+)px\)/),brightness=Number(depth?.[1])||1,cssBlur=Number(depth?.[2])||0;
 const radius=parseFloat(css.borderTopLeftRadius)||12,border=parseFloat(css.borderLeftWidth)||1;
 const canvas=new OffscreenCanvas(Math.ceil((w+PAD*2)*dpr),Math.ceil((h+PAD*2)*dpr)),ctx=canvas.getContext('2d');
 ctx.scale(dpr,dpr);ctx.translate(PAD,PAD);
 // 그림자와 테두리는 움직이기 전에 한 번만 합쳐 놓는다.
 const pseudo=getComputedStyle(el,'::before'),shadows=shadowParts(pseudo.boxShadow),inset=-(parseFloat(pseudo.left)||0);
 const raster=await gardenShadow(w,h,radius,dpr,pseudo.boxShadow);
 if(raster)ctx.drawImage(raster,-PAD,-PAD,w+PAD*2,h+PAD*2);
 else for(const sh of shadows.reverse()){
  ctx.filter=sh.blur?'blur('+(sh.blur*dpr/2)+'px)':'none';
  ctx.fillStyle=sh.color;const spread=inset+sh.spread;
  round(ctx,sh.x-spread,sh.y-spread,w+2*spread,h+2*spread,radius+sh.spread);ctx.fill();
 }
 ctx.filter='none';
 ctx.fillStyle=css.backgroundColor;round(ctx,0,0,w,h,radius);ctx.fill();
 ctx.save();round(ctx,border,border,w-2*border,h-2*border,Math.max(0,radius-border));ctx.clip();
 const sw=w-2*border,sh=h-2*border;
 if(el.classList.contains('memo')){
  const grad=ctx.createLinearGradient(0,0,w,h);grad.addColorStop(0,'#f4f0e8');grad.addColorStop(1,'#d9d2c8');ctx.fillStyle=grad;ctx.fillRect(border,border,sw,sh);
 }else if(el.classList.contains('fitContain')){
  const grad=ctx.createRadialGradient(w/2,h*.48,0,w/2,h*.48,Math.max(w,h)*.65);grad.addColorStop(0,'#1b1a20');grad.addColorStop(.68,'#0b0b0f');grad.addColorStop(1,'#050507');ctx.fillStyle=grad;ctx.fillRect(border,border,sw,sh);
 }else{ctx.fillStyle=sc.backgroundColor;ctx.fillRect(border,border,sw,sh);}
 const baseAlpha=ctx.getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data[3];
 const img=surface.querySelector('img'),source=img?.__ltOrbitDecodedFrom===img?.src&&img?.__ltOrbitDecoded?img.__ltOrbitDecoded:img;
 if(source&&(source.naturalWidth||source.width)){
  const ic=getComputedStyle(img),iw=source.naturalWidth||source.width,ih=source.naturalHeight||source.height;
  const pad=parseFloat(ic.paddingLeft)||0,boxW=sw-2*pad,boxH=sh-2*pad;
  const k=(ic.objectFit==='contain'?Math.min:Math.max)(boxW/iw,boxH/ih),dw=iw*k,dh=ih*k;
  const [px,py]=ic.objectPosition.split(' ');
  const transform=ic.transform.match(/^matrix\(([^,]+)/),scale=transform?parseFloat(transform[1]):1;
  const picture=new OffscreenCanvas(Math.ceil(sw*dpr),Math.ceil(sh*dpr)),pc=picture.getContext('2d');
  pc.scale(dpr,dpr);pc.filter=hover?'saturate(.9) brightness(1.06)':'saturate('+(ic.getPropertyValue('--sat').trim()||'.66')+') brightness('+(ic.getPropertyValue('--bright').trim()||'.86')+')';
  pc.drawImage(source,pad+posValue(px,boxW-dw),pad+posValue(py,boxH-dh),dw,dh);
  ctx.save();ctx.beginPath();ctx.rect(border+offset.x,border+offset.y,sw,sh);ctx.clip();
  ctx.translate(w/2+offset.x,h/2+offset.y);ctx.scale(scale,scale);ctx.translate(-w/2,-h/2);
  ctx.drawImage(picture,border,border,sw,sh);
  ctx.restore();
 }else{
  for(const e of surface.children){if(e.tagName==='IMG'||e.tagName==='CANVAS')continue;
   const c=getComputedStyle(e);font(ctx,c);
   textLines(ctx,e.textContent||'',border+(e.offsetLeft||14),border+(e.offsetTop||15)+offset.y+(parseFloat(c.fontSize)||12)/2,e.offsetWidth||w-26,parseFloat(c.lineHeight)||18);
  }
 }
 const link=getComputedStyle(surface,'::after');
 if(link.content!=='none'&&link.content!=='normal')badge(ctx,surface,w-(parseFloat(link.width)||40)-12,12+offset.y,link,link.content.replace(/^["']|["']$/g,''));
 ctx.restore();
 ctx.strokeStyle=hover?'#ffe6a6':css.borderColor;ctx.lineWidth=border;round(ctx,border/2,border/2,w-border,h-border,radius-border/2);ctx.stroke();
 const rim=getComputedStyle(el,'::after'),rimWidth=parseFloat(rim.borderTopWidth)||0;
 if(rimWidth&&rim.content!=='none'&&Number(rim.opacity)!==0){const rx=border+(parseFloat(rim.left)||0)+rimWidth/2,ry=border+(parseFloat(rim.top)||0)+rimWidth/2,rr=border+(parseFloat(rim.right)||0)+rimWidth/2,rb=border+(parseFloat(rim.bottom)||0)+rimWidth/2;ctx.strokeStyle=rim.borderTopColor;ctx.lineWidth=rimWidth;round(ctx,rx,ry,w-rx-rr,h-ry-rb,Math.max(0,radius-rx));ctx.stroke();}
 if(el.classList.contains('lt-card-hint'))cardTip(ctx,el,border,border);
 for(const e of el.querySelectorAll('.firstMark,.playGlyph')){const c=getComputedStyle(e);badge(ctx,e,border+e.offsetLeft,border+e.offsetTop,c,e.textContent||'');}
 if(hover){
  const cap=el.querySelector('.caption span'),capStyle=getComputedStyle(cap);font(ctx,capStyle);ctx.fillStyle=capStyle.color;ctx.fillText(cap.textContent||'',8,h-13,w-16);
 }
 // CSS의 깊이 필터는 그림과 테두리와 그림자를 합친 카드 전체에 한 번만 적용한다.
 const composed=new OffscreenCanvas(canvas.width,canvas.height),rasterCtx=composed.getContext('2d');
 rasterCtx.filter='brightness('+brightness+') blur('+(cssBlur*dpr)+'px)';rasterCtx.drawImage(canvas,0,0);
 let left=0,top=0,right=canvas.width,bottom=canvas.height,image,alpha=null;
 // Scan once, preserving every nonzero alpha pixel including the full shadow.
 try{const data=rasterCtx.getImageData(0,0,canvas.width,canvas.height).data;alpha=data[(Math.floor(canvas.height/2)*canvas.width+Math.floor(canvas.width/2))*4+3];left=canvas.width;top=canvas.height;right=0;bottom=0;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]){if(x<left)left=x;if(x>=right)right=x+1;if(y<top)top=y;if(y>=bottom)bottom=y+1;}
  if(right<=left||bottom<=top)throw Error('empty sprite');
  image=await createImageBitmap(composed,left,top,right-left,bottom-top,{premultiplyAlpha:"premultiply",colorSpaceConversion:"none"});
 }catch{left=top=0;right=canvas.width;bottom=canvas.height;image=await createImageBitmap(composed,{premultiplyAlpha:"premultiply",colorSpaceConversion:"none"});}
 const guard=img||surface,guardScale=img?(el.classList.contains('fitContain')?.94:1.02):1;
 return {image,w,h,pad:PAD,offset,drawX:left/dpr-w/2-PAD,drawY:top/dpr-h/2-PAD,drawW:(right-left)/dpr,drawH:(bottom-top)/dpr,guardW:guard.offsetWidth||w,guardH:guard.offsetHeight||h,guardScale,cssBlur,bakedBlur:cssBlur*dpr,alpha,baseAlpha,brightness,borderColor:css.borderTopColor,borderWidth:border,rimColor:rim.borderTopColor,rimWidth,shadowRaster:!!raster};
}
export function cardPose(values,w,h,baseW,baseH,fx=0,fy=0,out={box:{}}){
 const px=values[1],py=values[2],scale=values[4],rx=values[5],ry=values[6],rz=values[7];
 const rad=Math.PI/180,X=rx*rad,Y=ry*rad,Z=rz*rad;
 const cx=Math.cos(X),sx=Math.sin(X),cy=Math.cos(Y),sy=Math.sin(Y),cz=Math.cos(Z),sz=Math.sin(Z);
 // CSS scale(s)는 x·y만 확대한다. z축은 rotateX/Y/Z의 값을 그대로 쓴다.
 const zx=sx*sz-cx*sy*cz,zy=sx*cz+cx*sy*sz;
 const A=scale*cy*cz,B=scale*(cx*sz+sx*sy*cz),C=-scale*cy*sz,D=scale*(cx*cz-sx*sy*sz);
 // Fit the affine draw to the four perspective-projected corners, not only the centre derivative.
 const hx=baseW/2,hy=baseH/2,ox=w/2+hx,oy=h/2+hy;
 const u=fx-hx,v=fy-hy,U=fx+hx,V=fy+hy;
 const q1=1-(zx*u+zy*v)/1200,q2=1-(zx*U+zy*v)/1200,q3=1-(zx*u+zy*V)/1200,q4=1-(zx*U+zy*V)/1200;
 const x1=(px+A*u+C*v)/q1,x2=(px+A*U+C*v)/q2,x3=(px+A*u+C*V)/q3,x4=(px+A*U+C*V)/q4;
 const y1=(py+B*u+D*v)/q1,y2=(py+B*U+D*v)/q2,y3=(py+B*u+D*V)/q3,y4=(py+B*U+D*V)/q4;
 out.A=A;out.B=B;out.C=C;out.D=D;out.E=scale*sy;out.F=-scale*sx*cy;out.zx=zx;out.zy=zy;out.zz=cx*cy;out.px=px;out.py=py;out.ox=ox;out.oy=oy;out.fx=fx;out.fy=fy;
 out.a=(x2+x4-x1-x3)/(2*baseW);out.b=(y2+y4-y1-y3)/(2*baseW);out.c=(x3+x4-x1-x2)/(2*baseH);out.d=(y3+y4-y1-y2)/(2*baseH);
 out.x=ox+(x1+x2+x3+x4)/4;out.y=oy+(y1+y2+y3+y4)/4;
 out.box.l=ox+Math.min(x1,x2,x3,x4);out.box.r=ox+Math.max(x1,x2,x3,x4);out.box.t=oy+Math.min(y1,y2,y3,y4);out.box.b=oy+Math.max(y1,y2,y3,y4);
 return out;
}
// 평평한 부모의 쌓임 순서: z-index가 같은 경우 DOM에서 뒤에 있는 카드가 위에 온다.
// 이미 정렬된 배열을 재사용해 매 프레임 별도 배열이나 비교 함수를 만들지 않는다.
export function sortPaintOrder(order,z){
 for(let i=1;i<order.length;i++){const card=order[i];let j=i-1;while(j>=0&&(z[order[j]]>z[card]||(z[order[j]]===z[card]&&order[j]>card))){order[j+1]=order[j];j--;}order[j+1]=card;}
 return order;
}
export function hitPose(p,w,h,x,y){
 const det=p.a*p.d-p.b*p.c;if(!det)return false;
 const dx=x-p.x,dy=y-p.y;return Math.abs((p.d*dx-p.c*dy)/det)<=w/2&&Math.abs((-p.b*dx+p.a*dy)/det)<=h/2;
}

export function hitProjective(p,w,h,x,y){
 const X=x-p.ox,Y=y-p.oy,A=p.A+X*p.zx/1200,B=p.B+Y*p.zx/1200,C=p.C+X*p.zy/1200,D=p.D+Y*p.zy/1200;
 const det=A*D-B*C;if(!det)return false;
 const dx=X-p.px,dy=Y-p.py;
 return Math.abs((D*dx-C*dy)/det-p.fx)<=w/2&&Math.abs((A*dy-B*dx)/det-p.fy)<=h/2;
}

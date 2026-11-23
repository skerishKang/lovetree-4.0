// #1086: 카드 비트맵을 같은 원근 행렬로 한 그림판에 그린다.
const vertex=`
attribute vec2 aUnit;
uniform mat4 uMatrix;
uniform vec4 uRect;
varying vec2 vUV;
void main(){
 vUV=aUnit;
 gl_Position=uMatrix*vec4(uRect.xy+aUnit*uRect.zw,0.0,1.0);
}`;
const fragment=`
precision mediump float;
uniform sampler2D uTexture;
uniform vec2 uSize;
uniform float uOutline;
uniform sampler2D uVignette;
uniform float uShade;
uniform vec2 uViewport;
varying vec2 vUV;
void main(){
 if(uOutline>0.5){
  vec2 p=abs((vUV-0.5)*uSize)-(uSize*0.5-12.0);
  float distance=length(max(p,0.0))+min(max(p.x,p.y),0.0)-12.0;
  float alpha=1.0-smoothstep(0.5,1.5,abs(distance));
  gl_FragColor=vec4(vec3(1.0,0.902,0.651)*alpha,alpha);
 }else gl_FragColor=texture2D(uTexture,vUV);
 if(uShade>0.5)gl_FragColor.rgb*=1.0-texture2D(uVignette,gl_FragCoord.xy/uViewport).a;
}`;
export function orbitMatrix(p,w,h,out){
 const ox=2*p.ox/w-1,oy=1-2*p.oy/h;
 const qx=-p.zx/1200,qy=-p.zy/1200,qz=-p.zz/1200;
 // 행렬은 CSS perspective(1200px) translate3d scale rotateX rotateY rotateZ 순서다.
 out[0]=2*p.A/w+ox*qx;out[1]=-2*p.B/h+oy*qx;out[2]=0;out[3]=qx;
 out[4]=2*p.C/w+ox*qy;out[5]=-2*p.D/h+oy*qy;out[6]=0;out[7]=qy;
 out[8]=2*p.E/w+ox*qz;out[9]=-2*p.F/h+oy*qz;out[10]=0;out[11]=qz;
 const q=1+qx*p.fx+qy*p.fy;
 out[12]=2*(p.px+p.A*p.fx+p.C*p.fy)/w+ox*q;
 out[13]=-2*(p.py+p.B*p.fx+p.D*p.fy)/h+oy*q;out[14]=0;out[15]=q;
 return out;
}
export function createOrbitGL(canvas){
 const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,depth:false,stencil:false,preserveDrawingBuffer:false});
 if(!gl)return null;
 const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){gl.deleteShader(shader);throw Error('궤도 셰이더');}return shader;};
 const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment),program=gl.createProgram();
 gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('궤도 셰이더 연결');
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);
 gl.useProgram(program);const a=gl.getAttribLocation(program,'aUnit');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
 const matrix=gl.getUniformLocation(program,'uMatrix'),rect=gl.getUniformLocation(program,'uRect'),size=gl.getUniformLocation(program,'uSize'),outline=gl.getUniformLocation(program,'uOutline');
 gl.uniform1i(gl.getUniformLocation(program,'uTexture'),0);gl.activeTexture(gl.TEXTURE0);
 gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);
 const shade=gl.getUniformLocation(program,'uShade'),viewport=gl.getUniformLocation(program,'uViewport');
 gl.uniform1i(gl.getUniformLocation(program,'uVignette'),1);
 let vignette=null;const m=new Float32Array(16);let textures=new Map();
 function prepareShade(options){
  if(vignette){gl.deleteTexture(vignette);vignette=null;}
  if(!options||options.theme==='garden'){vignette=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,vignette);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));gl.activeTexture(gl.TEXTURE0);gl.uniform1f(shade,0);return;}
  const {w,h,dpr}=options,board=new OffscreenCanvas(Math.ceil(w*dpr),Math.ceil(h*dpr)),ctx=board.getContext('2d');
  const x=board.width/2,y=board.height/2,gradient=ctx.createRadialGradient(x,y,0,x,y,Math.hypot(x,y));
  for(const [at,alpha] of [[0,0],[.18,0],[.30,.18],[.74,.44],[1,.78]])gradient.addColorStop(at,'rgba(0,0,0,'+alpha+')');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,board.width,board.height);
  vignette=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,vignette);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,board);
  gl.activeTexture(gl.TEXTURE0);gl.uniform1f(shade,1);
 }
 const discard=map=>{for(const t of map.values())gl.deleteTexture(t);map.clear();};
 return {
  gl,
  async prepare(entries,signal,options){
   const next=new Map();try{
    for(const [i,s] of entries){
     if(!s)continue;
     await new Promise(resolve=>requestIdleCallback(resolve,{timeout:100}));
     if(signal.aborted||gl.isContextLost())throw Error('궤도 텍스처 중단');
     const t=gl.createTexture();next.set(i,t);gl.bindTexture(gl.TEXTURE_2D,t);
     gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
     gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
     gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,s.image);
     if(gl.getError()!==gl.NO_ERROR)throw Error('궤도 텍스처 올리기');
    }
    prepareShade(options);discard(textures);textures=next;return true;
   }catch{discard(next);return false;}
  },
  begin(){gl.uniform2f(viewport,canvas.width,canvas.height);gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT);},
  draw(i,s,p,w,h,focused){
   const t=textures.get(i);if(!t)return;
   gl.uniformMatrix4fv(matrix,false,orbitMatrix(p,w,h,m));gl.bindTexture(gl.TEXTURE_2D,t);
   gl.uniform1f(outline,0);gl.uniform4f(rect,s.drawX,s.drawY,s.drawW,s.drawH);gl.drawArrays(gl.TRIANGLES,0,6);
   if(focused){gl.uniform1f(outline,1);gl.uniform2f(size,s.w,s.h);gl.uniform4f(rect,-s.w/2,-s.h/2,s.w,s.h);gl.drawArrays(gl.TRIANGLES,0,6);}
  },
  dispose(){discard(textures);if(vignette)gl.deleteTexture(vignette);gl.deleteBuffer(buffer);gl.deleteProgram(program);}
 };
}

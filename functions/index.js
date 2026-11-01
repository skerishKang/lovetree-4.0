// The custom frontend opens 4.1; pages.dev keeps the existing 4.0 root.
export function onRequest({request,next}) {
 const url=new URL(request.url);
 if(url.hostname==='lovetree.padiem.net'&&url.pathname==='/'){
  url.pathname='/v41/';
  return new Response(null,{status:302,headers:{location:url.href,'cache-control':'no-store'}});
 }
 return next();
}

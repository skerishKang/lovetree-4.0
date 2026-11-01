// Serve 4.1 at the custom host root; the pages.dev root remains 4.0.
export async function onRequest({request,next,env}) {
 const url=new URL(request.url);
 if(url.hostname==='lovetree.padiem.net'&&url.pathname==='/'&&request.method==='GET'){
  const asset=new URL('/v41/',url.origin);
  const response=await env.ASSETS.fetch(new Request(asset,request));
  if(!response.ok)return response;
  let html=await response.text();
  html=html.replaceAll('href="shell.css"','href="/v41/shell.css"')
   .replaceAll('href="identity.css"','href="/v41/identity.css"')
   .replaceAll('src="media-preview.js"','src="/v41/media-preview.js"')
   .replaceAll('src="shell.mjs"','src="/v41/shell.mjs"')
   .replaceAll('/auth/login?next=%2Fv41%2F','/auth/login?next=%2F');
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store');
  return new Response(html,{status:response.status,headers});
 }
 return next();
}

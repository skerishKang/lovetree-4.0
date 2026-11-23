// 서버 진입 분기 판정 — 프록시가 넘기는 경로가 어느 핸들러로 가는지 한 곳에서 정한다(#1047).
export function handlerForPath(path) {
 const p = String(path ?? '');
 if (p === '/internal/account/delete' || p === '/internal/account/email') return 'trusted';
 if (p.startsWith('/auth/')) return 'auth';
 if (p.startsWith('/api/media')) return 'media';
 if (p.startsWith('/api/shares') || p.startsWith('/api/public/shares/') || p.startsWith('/api/trees/')) return 'share';
 // 공개 읽기는 로그인 없이도 커뮤니티 핸들러로 — tag-moments(#627)와 moments(#1025)와 같은 길.
 if (p.startsWith('/api/community/') || p === '/api/public/tag-moments' || p === '/api/public/moments') return 'community';
 if (p === '/api/feedback' || p.startsWith('/api/admin/feedback') || p.startsWith('/api/admin/journals') || p === '/api/board' || p.startsWith('/api/board/') || p.startsWith('/api/admin/persona/')) return 'feedback';
 if (p.startsWith('/api/admin/customers')) return 'adminCustomers';
 if (p === '/api/youtube/oembed') return 'youtube';
  if (p === '/api/tiktok/oembed') return 'tiktok';
  if (p === '/api/instagram/oembed') return 'instagram';
 return 'storage';
}

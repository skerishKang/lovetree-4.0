// 옛 /auth/* API 라우트는 닫혀 있다 — 로그인은 Pages(/auth/*)가 공용 로그인으로 처리한다.
export function retiredLogin(request){
 return { status: 410, body: { error: { code: 'auth_moved', message: '로그인은 공용 로그인으로 옮겼어요.' } } };
}

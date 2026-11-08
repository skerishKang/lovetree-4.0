import {isOwnerSelectionRoute,isPublicSelectionRoute} from './selection-location.mjs';
import {loginUrlWithTheme} from './header-state.mjs';

// Shared Pages auth accepts local paths, not arbitrary query strings in `next`.
export const MEMBER_LOGIN_URL=globalThis.location?.hostname==='lovetree.padiem.net'?'/auth/login?next=%2F':'/auth/login?next=%2Fv41%2F';
export function memberLoginUrl(theme, intent) {
  return loginUrlWithTheme(MEMBER_LOGIN_URL, theme, intent);
}
export function shouldLoadMemberRecords(search='',cookie='',hash='') {
 if(isPublicSelectionRoute(hash))return false;
 return isOwnerSelectionRoute(hash)||new URLSearchParams(search).get('account')==='1'||/(?:^|;\s*)__Host-lovetree-shared=1(?:;|$)/.test(cookie);
}

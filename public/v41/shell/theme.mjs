// 셸의 테마 적용·표시 (#231 1-B ①).
// 2026-11-08 리팩터링: 동작·겉모습 변경 0. 계산은 header-state.mjs, 화면 반영은 여기서 한다.
// 저장 키(lt41.theme)와 버튼 id·문구는 그대로다.
import {memberLoginUrl} from '../member-entry.mjs';
import {readTheme, writeTheme, nextTheme, themeButtonLabel, themeButtonAriaLabel, themePressed, appliedTheme, applyThemeAttribute} from '../header-state.mjs';
import {themedViewFor} from './navigation.mjs';

const $ = id => document.getElementById(id);

export function paintLoginLinks(theme = readTheme(localStorage)) {
  const href = memberLoginUrl(theme);
  const entry = $('account-entry');
  if (entry) entry.href = href;
  for (const a of document.querySelectorAll('[data-guest-login]')) a.href = href;
}

export function paintThemeControls(theme = readTheme(localStorage)) {
  for (const button of document.querySelectorAll('[data-lt-theme-toggle]')) {
    button.textContent = themeButtonLabel(theme);
    // 계정 메뉴 안에서는 role="menuitemcheckbox"라 aria-pressed가 아니라 aria-checked를 쓴다.
    button.setAttribute('aria-checked', String(themePressed(theme)));
    button.setAttribute('aria-label', themeButtonAriaLabel(theme));
    button.title = themeButtonAriaLabel(theme);
  }
  // 2026-11-10: 계정 메뉴의 밤/정원 두 칸.
  for (const button of document.querySelectorAll('[data-set-theme]')) {
    button.setAttribute('aria-checked', String(button.dataset.setTheme === theme));
  }
  paintLoginLinks(theme);
}

export function applyTheme(file, theme = readTheme(localStorage)) {
  const applied = applyThemeAttribute(document.documentElement, appliedTheme(theme, themedViewFor(file)));
  const frame = $('view').contentDocument;
  if (frame) applyThemeAttribute(frame.documentElement, applied);
  return applied;
}

export function toggleTheme(file) {
  const theme = writeTheme(localStorage, nextTheme(readTheme(localStorage)));
  applyTheme(file, theme);
  paintThemeControls(theme);
  return theme;
}

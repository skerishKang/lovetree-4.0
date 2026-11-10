// 공용 로그인(auth.padiem.net) 이메일 로그인 한 벌.
// 2026-11-08: 한 화면(#email·#password) 방식.
// 2026-11-10: 2단계(/login → /login/password) 방식 추가 — 둘 다 지원한다.
// postdeploy와 시험(tests/postdeploy-login-flow.test.mjs)이 같은 함수를 쓴다.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fillAuthEmailLogin(page, password, emailValue = '', wait = sleep) {
  const submit = async () => {
    await page.locator('form button[type=submit]').first().click({ timeout: 5000 }).catch(() => {});
    await wait(2500);
  };
  const readError = async () => {
    const text = await page.locator('[role=alert], .error, .form-error').first().innerText().catch(() => '');
    return text ? { ok: false, error: text.trim() } : { ok: true };
  };
  const passwordStep = async () => {
    if (!/\/login\/password/.test(page.url())) return false;
    const pw = page.locator('#password');
    if (await pw.count()) await pw.fill(password).catch(() => {});
    await submit();
    return true;
  };

  const email = page.locator('#email');
  if (await email.count()) {
    if (await email.isVisible().catch(() => false)) await email.fill(emailValue).catch(() => {});
    const pw = page.locator('#password');
    const pwVisible = (await pw.count()) && (await pw.isVisible().catch(() => false));
    if (pwVisible) await pw.fill(password).catch(() => {});
    await submit();
    if (!/auth\.padiem\.net/.test(page.url())) return { ok: true };
    if (await passwordStep()) {
      if (!/auth\.padiem\.net/.test(page.url())) return { ok: true };
    }
    return readError();
  }
  if (await passwordStep()) {
    if (!/auth\.padiem\.net/.test(page.url())) return { ok: true };
    return readError();
  }
  return false;
}

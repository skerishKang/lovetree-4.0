import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../tools/postdeploy/postdeploy.mjs', import.meta.url), 'utf8');
const argsSource = source.slice(source.indexOf('function parseArgs(argv) {'), source.indexOf('\nconst checks ='));
const launchSource = source.slice(source.indexOf('async function launch(opts) {'), source.indexOf('\nfunction wireConsole('));

function options(args) {
  const context = {
    process: { env: { USERPROFILE: 'C:/test' } },
    path: { join: (...parts) => parts.join('/') },
    HERE: '/tmp/postdeploy',
    chooseTestAccount: ({ arg, env }) => arg || env || '',
    defaultProfileFor: (account, here) => here + '/.profile-' + account
  };
  return runInNewContext(argsSource + '\nparseArgs(argv)', { ...context, argv: args });
}

test('기본 실행과 자동 로그인은 헤드리스, headed만 화면 표시', () => {
  for (const args of [
    ['https://example.test/v41/'],
    ['https://example.test/v41/', '--auto-login', '--account', '02'],
    ['https://example.test/v41/', '--auth-flows', '--account', '02'],
    ['https://example.test/v41/', '--cdp', 'http://127.0.0.1:9222']
  ]) assert.equal(options(args).headless, true, args.join(' '));
  for (const args of [
    ['https://example.test/v41/', '--headed'],
    ['https://example.test/v41/', '--auto-login', '--account', '02', '--headed'],
    ['https://example.test/v41/', '--login', '--headed']
  ]) assert.equal(options(args).headless, false, args.join(' '));
  assert.equal(options(['https://example.test/v41/', '--login']).headless, true);
});

test('실제 브라우저 대신 실행 인자를 가로채 headless 값을 확인', async () => {
  const calls = [];
  const chromium = {
    launchPersistentContext: async (_profile, options) => {
      calls.push(options);
      return { close: async () => {} };
    }
  };
  const launch = runInNewContext(launchSource + '\nlaunch', {
    chromium, mkdir: async () => {}, BROWSER_CHANNEL: undefined
  });
  for (const args of [
    ['https://example.test/v41/'],
    ['https://example.test/v41/', '--auto-login', '--account', '02'],
    ['https://example.test/v41/', '--auto-login', '--account', '02', '--headed']
  ]) {
    const result = await launch(options(args));
    await result.close();
  }
  assert.deepEqual(calls.map((entry) => entry.headless), [true, true, false]);
});

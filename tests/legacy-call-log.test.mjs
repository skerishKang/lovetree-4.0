import test from 'node:test';
import assert from 'node:assert/strict';
import { countAuthorityReads, countMint, countWriteCall, LEGACY_CALL_TAG } from '../server/legacy-call-log.js';

test('#7944 옛 경로 호출마다 종류만 한 줄 남기고 값은 적지 않는다', async () => {
  const lines = [];
  const log = (...a) => lines.push(a.join(' '));
  const authority = countAuthorityReads({ resolveIdentity: async ({ sessionId }) => ({ sessionId }) }, log);
  const mint = countMint({ redeem: async () => ({ ok: true }) }, log);
  const call = countWriteCall(async (m, p) => ({ m, p }), log);
  assert.deepEqual(await authority.resolveIdentity({ sessionId: 'secret-session-value' }), { sessionId: 'secret-session-value' });
  await mint.redeem({ handoffTicket: 'secret-ticket' });
  await call('revoke_session', { token: 'secret-token' });
  assert.deepEqual(lines, [`${LEGACY_CALL_TAG} authority_read`, `${LEGACY_CALL_TAG} mint`, `${LEGACY_CALL_TAG} authority_write:revoke_session`]);
  assert.ok(lines.every(l => !/secret/.test(l)));
});

test('#7944 감쌀 대상이 없으면 그대로 돌려준다', () => {
  assert.equal(countMint(undefined), undefined);
  assert.equal(countWriteCall(undefined), undefined);
});

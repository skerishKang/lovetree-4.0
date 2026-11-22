import { createHmac } from 'node:crypto';
import { assertServiceUrl } from './http-client.js';

// 재시도: 1분·5분·30분·2시간·12시간. 마지막 간격을 넘기면 '실패'로 남는다.
export const RETRY_DELAYS_MS = Object.freeze([60_000, 300_000, 1_800_000, 7_200_000, 43_200_000]);
export const OUTBOX_SITE_KEY = 'lovetree';

export function createFeedbackOutboxDispatcher({
  outbox, receiverUrl = '', secret = '', siteKey = OUTBOX_SITE_KEY,
  fetchImpl = fetch, now = () => Date.now(), log = () => {}
} = {}) {
  let running = false;
  function configured() {
    if (!receiverUrl || !secret) return false;
    try { assertServiceUrl(receiverUrl, '보낼 주소'); return true; }
    catch (error) { log(error); return false; }
  }
  async function sendOne(row) {
    const body = JSON.stringify(row.payload || {});
    const at = String(now());
    const signature = createHmac('sha256', secret).update(`${at}\n${siteKey}\n${body}`, 'utf8').digest('hex');
    const response = await fetchImpl(receiverUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-lt-site': siteKey,
        'x-lt-timestamp': at,
        'x-lt-signature': 'sha256=' + signature
      },
      body
    });
    return Number(response?.status) >= 200 && Number(response?.status) < 300;
  }
  async function drain({ limit = 20 } = {}) {
    if (running || !outbox || !configured()) return 0;
    running = true;
    let sent = 0;
    try {
      for (const row of await outbox.due({ limit })) {
        let ok = false;
        try { ok = await sendOne(row); }
        catch (error) { log(error); }
        if (ok) {
          if (await outbox.markSent({ id: row.id })) sent += 1;
          continue;
        }
        const attempts = Number(row.attempts || 0) + 1;
        const failed = attempts >= RETRY_DELAYS_MS.length;
        const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
        await outbox.markAttempt({
          id: row.id, attempts,
          nextAttemptAt: new Date(now() + delay).toISOString(),
          failed
        });
      }
    } catch (error) {
      log(error);
    } finally {
      running = false;
    }
    return sent;
  }
  return { drain, configured };
}


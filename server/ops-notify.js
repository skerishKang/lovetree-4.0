import { ROLE_AI_CUSTOMER, ROLE_TESTER } from './admin-roles.js';

export const OPS_NOTIFY_URL_ENV = 'LT_OPS_NOTIFY_URL';
export const OPS_NOTIFY_KEY_ENV = 'LT_OPS_NOTIFY_KEY';
export const OPS_NOTIFY_KEY_HEADER = 'X-Padiem-Ops-Notify-Key';
export const OPS_SITE = 'lovetree';
export const OPS_KINDS = Object.freeze(['feedback_new', 'feedback_append']);
export const OPS_AUDIENCES = Object.freeze(['real', 'ai']);
export const OPS_TITLE_MAX = 80;

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_RETRY_INTERVAL_MS = 10 * 60_000;
const DEFAULT_MAX_QUEUE = 20;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function audienceForRole(role) {
  if (role === ROLE_TESTER) return null;
  return role === ROLE_AI_CUSTOMER ? 'ai' : 'real';
}

function acceptableUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:') return true;
    return parsed.protocol === 'http:' && LOOPBACK.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function createOpsNotifier({
  url = process.env[OPS_NOTIFY_URL_ENV],
  key = process.env[OPS_NOTIFY_KEY_ENV],
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
  maxQueue = DEFAULT_MAX_QUEUE,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval
} = {}) {
  const enabled = typeof url === 'string' && url.trim() !== ''
    && typeof key === 'string' && key.trim() !== ''
    && acceptableUrl(url) && typeof fetchImpl === 'function';
  const sent = new Set();
  const queue = new Map();
  const inflight = new Set();
  let flushing = false;
  let timer = null;

  function enqueue(event) {
    if (queue.has(event.sourceId)) return;
    if (queue.size >= maxQueue) {
      const oldest = queue.keys().next().value;
      if (oldest !== undefined) queue.delete(oldest);
    }
    queue.set(event.sourceId, event);
  }

  async function deliver(event) {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [OPS_NOTIFY_KEY_HEADER]: key },
        body: JSON.stringify({
          site: OPS_SITE,
          kind: event.kind,
          audience: event.audience,
          title: String(event.title ?? '').slice(0, OPS_TITLE_MAX),
          source_id: event.sourceId
        }),
        signal: controller.signal
      });
      const responseBody = response.body;
      if (responseBody && typeof responseBody.cancel === 'function') void responseBody.cancel().catch(() => {});
      return { ok: response.status >= 200 && response.status < 300, status: response.status };
    } catch {
      return { ok: false, status: null };
    } finally {
      clearTimeout(deadline);
    }
  }

  async function flush() {
    if (!enabled || flushing || queue.size === 0) return;
    flushing = true;
    try {
      await Promise.all([...queue.values()].map(async (event) => {
        if (inflight.has(event.sourceId)) return;
        inflight.add(event.sourceId);
        try {
          const result = await deliver(event);
          if (result.ok) {
            queue.delete(event.sourceId);
            sent.add(event.sourceId);
          }
        } finally {
          inflight.delete(event.sourceId);
        }
      }));
    } finally {
      flushing = false;
    }
  }

  if (enabled) {
    timer = setIntervalFn(() => { void flush(); }, retryIntervalMs);
    timer?.unref?.();
  }

  return {
    enabled,
    get pending() { return [...queue.values()]; },
    async notify({ kind, audience, title, sourceId } = {}) {
      if (!enabled) return { sent: false, reason: 'disabled' };
      if (!OPS_KINDS.includes(kind)) return { sent: false, reason: 'invalid_kind' };
      if (!OPS_AUDIENCES.includes(audience)) return { sent: false, reason: 'invalid_audience' };
      if (typeof sourceId !== 'string' || !sourceId) return { sent: false, reason: 'invalid_source_id' };
      await flush();
      if (sent.has(sourceId) || queue.has(sourceId) || inflight.has(sourceId)) return { sent: false, reason: 'duplicate' };
      inflight.add(sourceId);
      try {
        const result = await deliver({ kind, audience, title, sourceId });
        if (result.ok) {
          sent.add(sourceId);
          return { sent: true, status: result.status };
        }
        enqueue({ kind, audience, title, sourceId });
        return { sent: false, reason: 'failed', status: result.status };
      } finally {
        inflight.delete(sourceId);
      }
    },
    flush,
    close() {
      if (timer) {
        clearIntervalFn(timer);
        timer = null;
      }
    }
  };
}

import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { isHiddenShare } from './hidden-share.js';

export const VISIT_WINDOW_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export function createShareVisitsService({repo, shareRepo, visibilityRepo, communityRepo, productId, secret, now = () => Date.now()}) {
  const key = typeof secret === 'string' ? secret.trim() : '';
  const scope = shareId => ({ productId, shareId });
  async function eligible(shareId) {
    const row = await shareRepo.load(scope(shareId));
    if (!row || row.status !== 'active') return null;
    if (await isHiddenShare(communityRepo, {...row,productId})) return null;
    if ((await visibilityRepo.get({productId,subjectId:row.subjectId,treeId:row.treeId})).visibility === 'private') return null;
    return row;
  }
  async function count(shareId) {
    try { return await eligible(shareId) ? await repo.count(scope(shareId)) : 0; } catch { return 0; }
  }
  return {
    count,
    async record(shareId, {subjectId = null, clientIp = '', trusted = false, authKnown = false} = {}) {
      try {
        const row = await eligible(shareId);
        if (!row) return 0;
        if (!trusted || !authKnown || key.length < 32 || !isIP(clientIp) || subjectId === row.subjectId) return await repo.count(scope(shareId));
        const at = now(), day = Math.floor(at / DAY_MS);
        const digest = d => createHmac('sha256',createHmac('sha256',key).update('lovetree:visit-day:'+d).digest())
          .update(JSON.stringify([productId,shareId,clientIp])).digest('hex');
        const hashes = [digest(day)];
        if (at % DAY_MS < VISIT_WINDOW_MS) hashes.push(digest(day-1));
        return await repo.record({...scope(shareId),hashes,now:new Date(at),expiresAt:new Date(at+VISIT_WINDOW_MS)});
      } catch { return count(shareId); }
    },
    async prune() { return repo.prune(new Date(now())); }
  };
}

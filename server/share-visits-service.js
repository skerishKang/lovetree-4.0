import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { isHiddenShare } from './hidden-share.js';

export const VISIT_WINDOW_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export function createShareVisitsService({repo, shareRepo, visibilityRepo, communityRepo, productId, secret, now = () => Date.now()}) {
  const key = typeof secret === 'string' ? secret.trim() : '';
  const scope = shareId => ({ productId, shareId });
  // 직접 호출하는 시험·내부 도구의 공개 경계. 방문 읽기에서는 이미 확인한 행을 넘겨받는다.
  async function eligible(shareId) {
    const row = await shareRepo.load(scope(shareId));
    if (!row || row.status !== 'active') return null;
    if (await isHiddenShare(communityRepo, {...row,productId})) return null;
    if ((await visibilityRepo.get({productId,subjectId:row.subjectId,treeId:row.treeId})).visibility === 'private') return null;
    return row;
  }
  const warn = () => console.warn('[lovetree-visit] 방문 집계를 처리하지 못했어요.');
  async function count(shareId, checkedRow = null) {
    try { return (checkedRow || await eligible(shareId)) ? await repo.count(scope(shareId)) : 0; }
    catch { warn(); return 0; }
  }
  function prepare(row, {subjectId = null, clientIp = '', trusted = false, authKnown = false} = {}) {
    if (!row || !trusted || !authKnown || key.length < 32 || !isIP(clientIp) || subjectId === row.subjectId) return null;
    const shareId = row.shareId;
    const at = now(), day = Math.floor(at / DAY_MS);
    const digest = d => createHmac('sha256',createHmac('sha256',key).update('lovetree:visit-day:'+d).digest())
      .update(JSON.stringify([productId,shareId,clientIp])).digest('hex');
    const hashes = [digest(day)];
    if (at % DAY_MS < VISIT_WINDOW_MS) hashes.push(digest(day-1));
    // 응답 뒤 집계 순서가 뒤집혀도 자정 전후 같은 방문을 한 번만 센다.
    // 비교용 해시만 추가하며 저장되는 해시·소금·만료 시각은 그대로다.
    if (at % DAY_MS >= DAY_MS - VISIT_WINDOW_MS) hashes.push(digest(day+1));
    const input = {...scope(shareId),hashes,now:new Date(at),expiresAt:new Date(at+VISIT_WINDOW_MS)};
    return async () => {
      try { return await repo.record(input); }
      catch { warn(); return 0; }
    };
  }
  return {
    count, prepare,
    async record(shareId, visitor = {}) {
      try {
        const row = await eligible(shareId);
        if (!row) return 0;
        const task = prepare(row, visitor);
        return task ? await task() : await count(shareId, row);
      } catch { warn(); return 0; }
    },
    async prune() { return repo.prune(new Date(now())); }
  };
}

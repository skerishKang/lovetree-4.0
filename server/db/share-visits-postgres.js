// 같은 방문자만 잠그고, 누적 수는 원자적인 증가로 지킨다. 공유 행 전체를 잠그지 않는다.
function abortError() {
  const error = new Error('응답 뒤 작업 시간 상한');
  error.name = 'AbortError';
  return error;
}
async function abortable(value, signal) {
  if (!signal) return value;
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(abortError());
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, {once: true});
  });
  try { return await Promise.race([Promise.resolve(value), aborted]); }
  finally { signal.removeEventListener('abort', onAbort); }
}
export function createShareVisitsRepo(pool) {
  return {
    async record({ productId, shareId, hashes, now, expiresAt, signal }) {
      let client = null, released = false;
      const release = (destroy = false) => {
        if (!client || released) return;
        released = true;
        client.release(destroy ? abortError() : undefined);
      };
      const onAbort = () => release(true);
      signal?.addEventListener('abort', onAbort, {once: true});
      try {
        const connecting = pool.connect().then(value => {
          client = value;
          if (signal?.aborted) release(true);
          return value;
        });
        await abortable(connecting, signal);
        if (signal?.aborted) throw abortError();
        const query = (text, params) => abortable(client.query(text, params), signal);
        await query('BEGIN');
        // 날짜 경계의 두 해시도 같은 순서로 잠근다. 다른 방문자의 판정은 서로 기다리지 않는다.
        await query(
          `SELECT pg_advisory_xact_lock(lock_id)
             FROM (SELECT DISTINCT hashtextextended(h,0) AS lock_id
                   FROM unnest($1::text[]) AS hashes(h) ORDER BY lock_id) AS locks`, [hashes]);
        // 읽기에서 확인한 공유를 넘겨받는다. 응답 뒤 회수·숨김·비공개가 된 경우에는
        // 별도 조회 없이 쓰기 문장 자체에서 차단한다. 중복 행을 얻은 경우에만 누적 수를 증가시킨다.
        const result = await query(
          `WITH eligible AS MATERIALIZED (
             SELECT 1 FROM lovetree_shares s WHERE s.product_id=$1 AND s.share_id=$2
               AND s.status='active'
               AND NOT EXISTS (SELECT 1 FROM lovetree_tree_visibility v WHERE v.product_id=s.product_id AND v.subject_id=s.subject_id AND v.tree_id=s.tree_id AND v.visibility='private')
               AND NOT EXISTS (SELECT 1 FROM lovetree_shares h JOIN lovetree_community_hidden_shares x ON x.product_id=h.product_id AND x.share_id=h.share_id WHERE h.product_id=s.product_id AND h.subject_id=s.subject_id AND h.tree_id=s.tree_id)
           ), claimed AS (
             INSERT INTO lovetree_share_visit_dedup (product_id,share_id,visitor_hash,expires_at)
             SELECT $1,$2,($3::text[])[1],$5 FROM eligible
             WHERE NOT EXISTS (SELECT 1 FROM lovetree_share_visit_dedup d
               WHERE d.product_id=$1 AND d.share_id=$2 AND d.visitor_hash=ANY($3::text[])
                 AND d.expires_at > $4::timestamptz
                 AND d.expires_at < $4::timestamptz + 2 * ($5::timestamptz - $4::timestamptz))
             ON CONFLICT (product_id,share_id,visitor_hash) DO UPDATE
               SET expires_at=EXCLUDED.expires_at
               WHERE EXCLUDED.expires_at>lovetree_share_visit_dedup.expires_at
             RETURNING 1
           ), bumped AS (
             INSERT INTO lovetree_share_visits (product_id,share_id,visits)
             SELECT $1,$2,1 FROM claimed
             ON CONFLICT (product_id,share_id) DO UPDATE SET visits=lovetree_share_visits.visits+1
             RETURNING visits
           )
           SELECT COALESCE((SELECT visits FROM bumped),
             (SELECT visits FROM lovetree_share_visits WHERE product_id=$1 AND share_id=$2 AND EXISTS (SELECT 1 FROM eligible)),0) AS visits`,
          [productId, shareId, hashes, now, expiresAt]);
        await query('COMMIT');
        return Number(result.rows[0]?.visits || 0);
      } catch (error) {
        if (client && !released) await abortable(client.query('ROLLBACK'), signal).catch(() => {});
        throw error;
      } finally {
        signal?.removeEventListener('abort', onAbort);
        release();
      }
    },
    async count({productId,shareId}) {
      const result=await pool.query('SELECT visits FROM lovetree_share_visits WHERE product_id=$1 AND share_id=$2',[productId,shareId]);
      return Number(result.rows[0]?.visits || 0);
    },
    async prune(now = new Date()) {
      return (await pool.query('DELETE FROM lovetree_share_visit_dedup WHERE expires_at <= $1',[now])).rowCount;
    }
  };
}

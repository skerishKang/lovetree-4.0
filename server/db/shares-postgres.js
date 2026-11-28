import { createTreeDiscoverRepo } from './tree-discover-postgres.js';
import { SHARE_LIST_PAGE_SIZE, decodeShareListCursor, encodeShareListCursor } from '../share-list-pagination.js';

const iso = value => value instanceof Date ? value.toISOString() : value ? String(value) : null;
const row = value => value && ({
  shareId: value.share_id, subjectId: value.subject_id, treeId: value.tree_id,
  entryMomentId: value.entry_moment_id, view: value.initial_view, status: value.status,
  createdAt: iso(value.created_at), revokedAt: iso(value.revoked_at),
  discoverable: value.discoverable === true, discoverableAt: iso(value.discoverable_at),
  origin: value.origin || 'owner', momentCount: Number(value.moment_count ?? 0)
});
async function withTransaction(pool, work) {
  if (typeof pool.transaction === 'function') return pool.transaction(work);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
export function createShareRepo(pool) {
  return {
    // 최신 원본과 공유행·소개 동의 정리를 한 트랜잭션에서 맞춘다.
    async withCurrentWorkspace({ productId, subjectId }, sync) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          'SELECT doc FROM lovetree_workspaces WHERE product_id=$1 AND subject_id=$2 FOR UPDATE',
          [productId, subjectId]
        );
        if (rows.length) await sync(rows[0].doc, createShareRepo(client), createTreeDiscoverRepo(client));
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async create(input) {
      const result = await pool.query(
        `INSERT INTO lovetree_shares (product_id, share_id, subject_id, tree_id, entry_moment_id, initial_view, moment_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (product_id, share_id) DO NOTHING RETURNING *`,
        [input.productId,input.shareId,input.subjectId,input.treeId,input.entryMomentId,input.view,input.momentCount ?? 0]
      );
      return row(result.rows[0]);
    },
    async createPreview(input) {
      await pool.query(
        `INSERT INTO lovetree_share_previews (token_hash, product_id, subject_id, tree_id, request_hash, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [input.tokenHash,input.productId,input.subjectId,input.treeId,input.requestHash,input.expiresAt]
      );
      return true;
    },
    async createShareWithPreview(input) {
      return withTransaction(pool, async client => {
        const found = await client.query(
          'SELECT * FROM lovetree_share_previews WHERE token_hash=$1 AND product_id=$2 FOR UPDATE',
          [input.tokenHash,input.productId]
        );
        const preview = found.rows[0];
        if (!preview) return {status:'missing'};
        if (preview.subject_id !== input.subjectId) return {status:'forbidden'};
        // 소비된 토큰도 유효 시간과 같은 요청 내용이 확인될 때에만 재응답한다.
        if (new Date(preview.expires_at).getTime() <= (input.now ?? Date.now())) return {status:'expired'};
        if (preview.tree_id !== input.treeId || preview.request_hash !== input.requestHash) return {status:'stale'};
        if (preview.consumed_at) {
          if (!preview.result_share_id) return {status:'stale'};
          const existing = await client.query('SELECT * FROM lovetree_shares WHERE product_id=$1 AND share_id=$2', [input.productId,preview.result_share_id]);
          return existing.rows[0] ? {status:'replayed',share:row(existing.rows[0])} : {status:'missing'};
        }
        const inserted = await client.query(
          `INSERT INTO lovetree_shares (product_id, share_id, subject_id, tree_id, entry_moment_id, initial_view, moment_count)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (product_id, share_id) DO NOTHING RETURNING *`,
          [input.productId,input.shareId,input.subjectId,input.treeId,input.entryMomentId,input.view,input.momentCount ?? 0]
        );
        if (!inserted.rows[0]) return {status:'collision'};
        await client.query('UPDATE lovetree_share_previews SET consumed_at=now(), result_share_id=$2 WHERE token_hash=$1', [input.tokenHash,input.shareId]);
        return {status:'created',share:row(inserted.rows[0])};
      });
    },
    async prunePreviews() {
      await pool.query("DELETE FROM lovetree_share_previews WHERE expires_at < now() - interval '1 day'");
    },
    async load({productId,shareId}) {
      const result = await pool.query('SELECT * FROM lovetree_shares WHERE product_id=$1 AND share_id=$2',[productId,shareId]);
      return row(result.rows[0]);
    },
    async list({productId,subjectId}) {
      const result = await pool.query('SELECT * FROM lovetree_shares WHERE product_id=$1 AND subject_id=$2 ORDER BY created_at DESC LIMIT 50',[productId,subjectId]);
      return result.rows.map(row);
    },
    // 공유 관리 화면만 50개씩 이어 읽는다. 날짜가 같은 행도 ID로 순서를 고정한다.
    async listPage({productId,subjectId,cursor=null}) {
      const after = decodeShareListCursor(cursor);
      const result = await pool.query(
        `SELECT *, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS page_created_at
         FROM lovetree_shares
         WHERE product_id=$1 AND subject_id=$2
           AND ($3::timestamptz IS NULL OR (created_at, share_id) < ($3::timestamptz, $4::text))
         ORDER BY created_at DESC, share_id DESC
         LIMIT $5`,
        [productId,subjectId,after?.createdAt??null,after?.shareId??null,SHARE_LIST_PAGE_SIZE+1]
      );
      const page = result.rows.slice(0,SHARE_LIST_PAGE_SIZE);
      const tail = page.at(-1);
      return {rows:page.map(row),nextCursor:result.rows.length>SHARE_LIST_PAGE_SIZE
        ? encodeShareListCursor({createdAt:tail.page_created_at,shareId:tail.share_id}) : null};
    },
    async setDiscoverable({productId,subjectId,shareId,discoverable}) {
      const result = await pool.query(
        `UPDATE lovetree_shares SET discoverable=$4, discoverable_at=CASE WHEN $4 THEN COALESCE(discoverable_at,now()) ELSE NULL END, updated_at=now()
         WHERE product_id=$1 AND subject_id=$2 AND share_id=$3 AND status='active' RETURNING *`,
        [productId,subjectId,shareId,discoverable]
      );
      return row(result.rows[0]);
    },
    async revoke({productId,subjectId,shareId}) {
      const result = await pool.query(
        `UPDATE lovetree_shares SET status='revoked', revoked_at=COALESCE(revoked_at,now()), updated_at=now()
         WHERE product_id=$1 AND subject_id=$2 AND share_id=$3 RETURNING *`,
        [productId,subjectId,shareId]
      );
      return row(result.rows[0]);
    },
    // #538: 저장 성공 뒤 같은 훅에서 순간 수를 갱신한다(주인이 만든 행도 함께).
    async updateMomentCount({productId,subjectId,treeId,momentCount}) {
      const result = await pool.query(
        `UPDATE lovetree_shares SET moment_count=$4, updated_at=now()
         WHERE product_id=$1 AND subject_id=$2 AND tree_id=$3 AND status='active'`,
        [productId,subjectId,treeId,momentCount]
      );
      return result.rowCount;
    },
    // #538: 자동 공개 행이 없으면 만든다(트리 하나에 자동 행 하나).
    // #1046: 주인이 취소한 행(status='revoked', revoked_at 있음)은 되살리지 않는다 — ON CONFLICT DO NOTHING.
    // 다시 공유는 공유 창에서 직접 새 링크를 만들 때만 이뤄진다(동기화가 같은 주소를 다시 켜지 않는다).
    async upsertAutoShare({productId,subjectId,shareId,treeId,entryMomentId,momentCount}) {
      const result = await pool.query(
        `INSERT INTO lovetree_shares (product_id,share_id,subject_id,tree_id,entry_moment_id,initial_view,origin,moment_count)
         VALUES ($1,$2,$3,$4,$5,'book','auto',$6)
         ON CONFLICT (product_id,subject_id,tree_id) WHERE origin='auto' DO NOTHING
         RETURNING *`,
        [productId,shareId,subjectId,treeId,entryMomentId,momentCount]
      );
      return row(result.rows[0]);
    },
    // #538: 문서에서 사라진 트리의 공유 행은 즉시 내린다(주인이 지우면 바로 내려감).
    // 자동 공개 행만이 아니라 주인이 만든 행도 함께 내린다 — 트리가 없는 공유 행(유령)을 남기지 않는다.
    async revokeSharesNotIn({productId,subjectId,treeIds}) {
      const result = await pool.query(
        `UPDATE lovetree_shares SET status='revoked', revoked_at=COALESCE(revoked_at,now()), updated_at=now()
         WHERE product_id=$1 AND subject_id=$2 AND status='active' AND NOT (tree_id = ANY($3))`,
        [productId,subjectId,treeIds]
      );
      return result.rowCount;
    }
  };
}

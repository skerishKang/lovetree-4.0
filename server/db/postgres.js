import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SCHEMA_PATH = fileURLToPath(new URL('./schema.sql', import.meta.url));

export async function applySchema(executor) {
  await executor.query(await readFile(SCHEMA_PATH, 'utf8'));
}

const iso = value => (value instanceof Date ? value.toISOString() : String(value));

export function createWorkspaceRepo(pool) {
  async function commit(client, { productId, subjectId, doc, expectedRevision, clientKey, requestHash }) {
    const claim = await client.query(
      `INSERT INTO lovetree_request_claims (product_id, subject_id, client_key, request_hash, result_revision, result_saved_at)
       VALUES ($1, $2, $3, $4, NULL, NULL)
       ON CONFLICT (product_id, subject_id, client_key) DO NOTHING
       RETURNING client_key`,
      [productId, subjectId, clientKey, requestHash]
    );
    if (claim.rowCount === 0) {
      const existing = await client.query(
        `SELECT request_hash, result_revision, result_saved_at FROM lovetree_request_claims
         WHERE product_id = $1 AND subject_id = $2 AND client_key = $3`,
        [productId, subjectId, clientKey]
      );
      const row = existing.rows[0];
      if (!row || row.request_hash !== requestHash) return { status: 'keyConflict' };
      // 클레임과 저장 결과는 같은 트랜잭션에서 커밋된다. 커밋된 행에 결과가 비어 있는 상태는 성립하지 않는다.
      if (row.result_revision === null) throw new Error('claim without result');
      return { status: 'replayed', revision: Number(row.result_revision), savedAt: iso(row.result_saved_at) };
    }

    const write = expectedRevision === 0
      ? await client.query(
        `INSERT INTO lovetree_workspaces (product_id, subject_id, doc, revision, saved_at)
         VALUES ($1, $2, $3::jsonb, 1, now())
         ON CONFLICT (product_id, subject_id) DO NOTHING
         RETURNING revision, saved_at`,
        [productId, subjectId, JSON.stringify(doc)]
      )
      : await client.query(
        `UPDATE lovetree_workspaces SET doc = $3::jsonb, revision = revision + 1, saved_at = now()
         WHERE product_id = $1 AND subject_id = $2 AND revision = $4
         RETURNING revision, saved_at`,
        [productId, subjectId, JSON.stringify(doc), expectedRevision]
      );

    if (write.rowCount === 0) {
      const current = await client.query(
        `SELECT revision FROM lovetree_workspaces WHERE product_id = $1 AND subject_id = $2`,
        [productId, subjectId]
      );
      return { status: 'revisionConflict', currentRevision: current.rowCount ? Number(current.rows[0].revision) : 0 };
    }

    const { revision, saved_at: savedAt } = write.rows[0];
    await client.query(
      `UPDATE lovetree_request_claims SET result_revision = $4, result_saved_at = $5
       WHERE product_id = $1 AND subject_id = $2 AND client_key = $3`,
      [productId, subjectId, clientKey, revision, savedAt]
    );
    return { status: 'saved', revision: Number(revision), savedAt: iso(savedAt) };
  }

  return {
    async load({ productId, subjectId }) {
      const { rows } = await pool.query(
        `SELECT doc, revision, saved_at FROM lovetree_workspaces WHERE product_id = $1 AND subject_id = $2`,
        [productId, subjectId]
      );
      const row = rows[0];
      if (!row) return null;
      return { revision: Number(row.revision), savedAt: iso(row.saved_at), doc: row.doc };
    },

    async commit(input) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const outcome = await commit(client, input);
        if (outcome.status === 'saved' || outcome.status === 'replayed') await client.query('COMMIT');
        else await client.query('ROLLBACK');
        return outcome;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    async end() { await pool.end(); }
  };
}

export async function createWorkspaceRepoFromUrl(databaseUrl, options = {}) {
  const pg = await import('pg');
  const { Pool } = pg.default ?? pg;
  return createWorkspaceRepo(new Pool({ connectionString: databaseUrl, ...options }));
}

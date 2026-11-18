import { projectSharedTree } from '../share-service.js';
import { stageKeyForMoment } from '../../src/stage-key.js';
import { eligibleStageTreesSql } from './stage-visibility-sql.js';
import { assignVideo, byVideo, lockVideo, resolveKnownInputs } from './stage-assignments-postgres.js';

const totals = () => ({ owners: 0, inserted: 0, updated: 0, removed: 0, invalidTrees: 0 });
const momentId = row => JSON.stringify([row.tree_id, row.moment_id]);
const treeRevision = row => JSON.stringify([row.subject_id, row.tree_id, String(row.source_revision)]);

async function transaction(pool, run, { readOnly = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (attempt >= 2 || !['40P01', '40001'].includes(error.code)) throw error;
    } finally {
      client.release();
    }
  }
}

// 공개 투영이 파일 주소를 제거한다. 구간은 옛 문서를 읽으면서 보정되기 전의 값으로 엄격히 판정한다.
function projectedMoments(rows) {
  const moments = [];
  let invalidTrees = 0;
  const seen = new Set(), ambiguous = new Set();
  for (const row of rows) {
    const id = treeRevision(row);
    if (seen.has(id)) ambiguous.add(id);
    seen.add(id);
  }
  for (const { subject_id, tree_id, source_revision, tree_doc } of rows) {
    if (ambiguous.has(treeRevision({ subject_id, tree_id, source_revision }))) continue;
    let tree;
    try {
      tree = projectSharedTree({ version: 1, trees: [tree_doc] }, tree_id).tree;
    } catch (error) {
      if (!['stored_document_invalid', 'share_removed'].includes(error.code)) throw error;
      invalidTrees++;
      continue;
    }
    for (const [index, moment] of tree.moments.entries()) {
      const raw = tree_doc.moments[index];
      const key = stageKeyForMoment({ url: moment.url, startSeconds: raw.startSeconds, endSeconds: raw.endSeconds });
      if (key) moments.push({ subject_id, tree_id, moment_id: moment.id, source_revision, key });
    }
  }
  return { moments, invalidTrees: invalidTrees + ambiguous.size };
}

async function replaceMembership(client, productId, subjectId, moments) {
  const scope = [productId, subjectId];
  const current = await client.query(
    'SELECT tree_id,moment_id,stage_id,source_revision FROM lovetree_stage_moments WHERE product_id=$1 AND subject_id=$2', scope
  );
  const previous = new Map(current.rows.map(row => [momentId(row), row]));
  const changes = [];
  let inserted = 0;
  for (const { tree_id, moment_id, stage_id, source_revision } of moments) {
    const row = { tree_id, moment_id, stage_id, source_revision };
    const id = momentId(row);
    const old = previous.get(id);
    previous.delete(id);
    if (!old) inserted++;
    if (!old || old.stage_id !== stage_id || String(old.source_revision) !== String(source_revision)) changes.push(row);
  }
  if (previous.size) {
    await client.query(
      `DELETE FROM lovetree_stage_moments m USING jsonb_to_recordset($3::jsonb) AS r(tree_id text,moment_id text)
       WHERE m.product_id=$1 AND m.subject_id=$2 AND m.tree_id=r.tree_id AND m.moment_id=r.moment_id`,
      [...scope, JSON.stringify([...previous.values()])]
    );
  }
  if (changes.length) {
    await client.query(
      `INSERT INTO lovetree_stage_moments(product_id,subject_id,tree_id,moment_id,stage_id,source_revision)
       SELECT $1,$2,r.tree_id,r.moment_id,r.stage_id,r.source_revision FROM jsonb_to_recordset($3::jsonb)
       AS r(tree_id text,moment_id text,stage_id text,source_revision bigint)
       ON CONFLICT (product_id,subject_id,tree_id,moment_id) DO UPDATE
       SET stage_id=EXCLUDED.stage_id, source_revision=EXCLUDED.source_revision`,
      [...scope, JSON.stringify(changes)]
    );
  }
  return { inserted, updated: changes.length - inserted, removed: previous.size };
}

// 영상 잠금 뒤 같은 공개 자격과 revision을 다시 읽는다. 전체 백필에서는 해당 영상의 후보 트리만 대조한다.
async function currentSources(client, productId, { subjectId = null, candidates = [] }) {
  const params = [productId];
  let join = '';
  if (subjectId !== null) {
    params.push(subjectId);
  } else {
    const sources = new Map();
    for (const { subject_id, tree_id, source_revision } of candidates) {
      const row = { subject_id, tree_id, source_revision };
      sources.set(treeRevision(row), row);
    }
    params.push(JSON.stringify([...sources.values()]));
    join = `JOIN jsonb_to_recordset($2::jsonb) AS r(subject_id text,tree_id text,source_revision bigint)
            USING (subject_id,tree_id,source_revision)`;
  }
  const eligible = eligibleStageTreesSql({ ownerParam: subjectId === null ? false : '$2' });
  const { rows } = await client.query(`SELECT e.subject_id,e.tree_id,e.source_revision FROM (${eligible}) e ${join}`, params);
  return new Set(rows.map(treeRevision));
}

async function reconcileOwner(pool, productId, subjectId) {
  return transaction(pool, async client => {
    // 저장/탈퇴와 경합해도 이 소유자의 현재 문서 하나만 잠근다. 늦은 훅이 전달한 문서는 쓰지 않는다.
    const workspace = await client.query(
      'SELECT revision FROM lovetree_workspaces WHERE product_id=$1 AND subject_id=$2 FOR NO KEY UPDATE',
      [productId, subjectId]
    );
    if (!workspace.rowCount) return totals(); // workspace 삭제는 FK가 소속도 정리한다.
    const eligibility = eligibleStageTreesSql({ ownerParam: '$2' });
    const visible = await client.query(eligibility, [productId, subjectId]);
    const { moments, invalidTrees } = projectedMoments(visible.rows);
    const unassigned = await resolveKnownInputs(client, productId, moments);
    const groups = byVideo(unassigned);
    if (groups.length) {
      for (const group of groups) await lockVideo(client, productId, group[0].key);
      // 영상 잠금을 기다리는 동안 별도 표의 소개·비공개·숨김이 바뀌었으면 최신 자격으로 다시 시작한다.
      const current = await currentSources(client, productId, { subjectId });
      const previous = new Set(visible.rows.map(treeRevision));
      if (current.size !== previous.size || [...previous].some(id => !current.has(id))) {
        throw Object.assign(new Error('무대 등록 중 공개 조건이 바뀌었어요.'), { code: '40001' });
      }
      for (const group of groups) await assignVideo(client, productId, group);
    }
    const changes = await replaceMembership(client, productId, subjectId, moments);
    return { owners: 1, ...changes, invalidTrees };
  });
}

// 백필 후보 수집 뒤 수정/삭제/철회된 트리는 고정 기준을 새로 만들지 않는다. 영상 잠금 후 원본 revision과
// 공개 자격을 함께 다시 읽는다. 여기서는 소유자 행을 잠그지 않으므로 실시간 경로와 잠금 순서가 뒤집히지 않는다.
async function registerCurrentInputs(pool, productId, group) {
  return transaction(pool, async client => {
    await lockVideo(client, productId, group[0].key);
    const live = await currentSources(client, productId, { candidates: group });
    await assignVideo(client, productId, group.filter(moment => live.has(treeRevision(moment))));
  });
}

export function createStageIndexRepo(pool) {
  return {
    async reconcile({ productId, subjectId = null }) {
      if (subjectId !== null) return reconcileOwner(pool, productId, subjectId);

      // 모든 공개 입력을 영상·시작·끝 순으로 먼저 배정한다. 트리가 먼저 조회된 순서가 기준을 정하지 않는다.
      const visible = await pool.query(eligibleStageTreesSql({}), [productId]);
      const { moments } = projectedMoments(visible.rows);
      const unassigned = await resolveKnownInputs(pool, productId, moments);
      for (const group of byVideo(unassigned)) await registerCurrentInputs(pool, productId, group);

      // 공개 자격을 모두 잃은 소유자도 이전 소속을 회수해야 한다.
      const indexed = await pool.query(
        'SELECT DISTINCT subject_id FROM lovetree_stage_moments WHERE product_id=$1', [productId]
      );
      const owners = new Set([...visible.rows, ...indexed.rows].map(row => row.subject_id));
      const summary = totals();
      for (const owner of owners) {
        const result = await reconcileOwner(pool, productId, owner);
        for (const name of Object.keys(summary)) summary[name] += result[name];
      }
      return summary;
    },

    async audit({ productId }) {
      return transaction(pool, async client => {
        const visible = await client.query(eligibleStageTreesSql({}), [productId]);
        const { moments, invalidTrees } = projectedMoments(visible.rows);
        await resolveKnownInputs(client, productId, moments);
        const expected = moments.map(({ subject_id, tree_id, moment_id, source_revision, stage_id }) => ({
          subject_id, tree_id, moment_id, source_revision, stage_id
        }));
        const { rows } = await client.query(
          `WITH expected AS (
             SELECT * FROM jsonb_to_recordset($2::jsonb) AS e(subject_id text,tree_id text,moment_id text,
               source_revision bigint,stage_id text)
           ), indexed AS (
             SELECT * FROM lovetree_stage_moments WHERE product_id=$1
           )
           SELECT (SELECT count(*) FROM indexed) AS actual, count(*) AS matched
           FROM expected e JOIN indexed i ON (i.subject_id,i.tree_id,i.moment_id,i.source_revision,i.stage_id)
                                           =(e.subject_id,e.tree_id,e.moment_id,e.source_revision,e.stage_id)`,
          [productId, JSON.stringify(expected)]
        );
        const actual = Number(rows[0].actual), matched = Number(rows[0].matched);
        return { expected: expected.length, actual, missing: expected.length - matched, extra: actual - matched, invalidTrees };
      }, { readOnly: true });
    }
  };
}

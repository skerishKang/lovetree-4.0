import { stageKeyForMoment } from '../../src/stage-key.js';
import { subjectHash } from '../account-service.js';
import { lockStageVoterAccount } from './account-postgres.js';
import { visibleStageMomentsSql } from './stage-visibility-sql.js';
import { countedVoterSql } from './ranking-policy-sql.js';

const representativeOrder = 'share_id COLLATE "C", moment_id COLLATE "C"';
const publicCount = value => Number(value) >= 3 ? Number(value) : null;

function publicStage(row) {
  const key = stageKeyForMoment({ url: row.moment_url, startSeconds: row.start_seconds, endSeconds: row.end_seconds });
  if (!key) return null;
  const card = {
    stageId: row.stage_id, platform: key.platform, videoId: key.videoId, kind: key.kind, title: row.title,
    weeklyVoters: publicCount(row.weekly_voters), publicTreeCount: publicCount(row.public_trees)
  };
  if (key.kind === 'bookmark') card.displayRange = { startSeconds: key.startSeconds };
  if (key.kind === 'range') card.displayRange = { startSeconds: key.startSeconds, endSeconds: key.endSeconds };
  if (row.ai_tester) card.aiTester = true;
  return card;
}

export function createStageVoteRepo(pool, { hasRealCustomers = false } = {}) {
  const visibleStage = `SELECT * FROM (${visibleStageMomentsSql()}) visible WHERE stage_id=$3`;
  const countedVoter = countedVoterSql(hasRealCustomers, 'v');
  const countedThisWeek = `v.voted_at >= $4::timestamptz AND v.voted_at < $5::timestamptz AND ${countedVoter}`;
  const stageVotes = "v.product_id=$1 AND v.target_kind='stage' AND v.target_id=$3";

  return {
    async resolveMoment({ productId, viewerSubjectId = null, shareId, momentId }) {
      // 주소를 여러 번 만든 트리도 해당 주소가 지금 살아 있어야 한다.
      const { rows } = await pool.query(`
        WITH visible AS (${visibleStageMomentsSql()})
        SELECT m.stage_id FROM visible m JOIN lovetree_shares alias
          ON alias.product_id=$1 AND alias.subject_id=m.subject_id AND alias.tree_id=m.tree_id
        WHERE alias.share_id=$3 AND alias.status='active' AND m.moment_id=$4`,
        [productId, viewerSubjectId, shareId, momentId]);
      return rows.length ? { stageId: rows[0].stage_id } : null;
    },

    async detail({ productId, viewerSubjectId = null, stageId, since, until, currentShareId = null, afterShareId = null }) {
      const { rows } = await pool.query(`
        WITH visible AS (${visibleStage}), trees AS (
          SELECT DISTINCT subject_id,tree_id,share_id,tree_title,ai_tester FROM visible
        ), page AS (
          SELECT t.share_id,t.tree_title,t.ai_tester FROM trees t
          WHERE ($7::text IS NULL OR t.share_id COLLATE "C" > $7)
            AND NOT EXISTS (
              SELECT 1 FROM lovetree_shares context WHERE context.product_id=$1 AND context.share_id=$6
                AND context.status='active' AND context.subject_id=t.subject_id AND context.tree_id=t.tree_id
            )
          ORDER BY t.share_id COLLATE "C" LIMIT 13
        )
        SELECT r.*,
          (SELECT count(*) FROM lovetree_community_votes v WHERE ${stageVotes} AND ${countedThisWeek}) AS weekly_voters,
          (SELECT count(*) FROM trees) AS public_trees,
          EXISTS(SELECT 1 FROM lovetree_stage_saves WHERE product_id=$1 AND stage_id=$3 AND subject_id=$2) AS saved,
          EXISTS(SELECT 1 FROM lovetree_community_votes v WHERE ${stageVotes} AND v.subject_id=$2) AS voted,
          COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY share_id COLLATE "C") FROM page),'[]'::jsonb) AS page
        FROM (SELECT * FROM visible ORDER BY ${representativeOrder} LIMIT 1) r`,
        [productId, viewerSubjectId, stageId, since, until, currentShareId, afterShareId]);
      if (!rows.length) return null;
      const row = rows[0], stage = publicStage(row);
      if (!stage) return null;
      const trees = row.page.slice(0, 12).map(tree => ({
        shareId: tree.share_id, title: tree.tree_title, link: '/t/' + tree.share_id,
        ...(tree.ai_tester ? { aiTester: true } : {})
      }));
      return { ...stage, saved: row.saved, voted: row.voted, trees, nextCursor: row.page.length > 12 ? trees.at(-1).shareId : null };
    },

    async popular({ productId, viewerSubjectId = null, since, until }) {
      const { rows } = await pool.query(`
        WITH visible AS (${visibleStageMomentsSql({ forRanking: true, hasRealCustomers })}), stages AS (
          SELECT stage_id,count(DISTINCT (subject_id,tree_id)) AS public_trees FROM visible GROUP BY stage_id
        ), top_stages AS (
          SELECT s.stage_id,s.public_trees,count(*) AS weekly_voters
          FROM stages s JOIN lovetree_community_votes v ON v.product_id=$1 AND v.target_kind='stage' AND v.target_id=s.stage_id
          WHERE v.voted_at >= $3::timestamptz AND v.voted_at < $4::timestamptz AND ${countedVoter}
          GROUP BY s.stage_id,s.public_trees HAVING count(*)>=3
          ORDER BY weekly_voters DESC,s.stage_id COLLATE "C" LIMIT 10
        )
        SELECT representative.*,t.public_trees,t.weekly_voters FROM top_stages t CROSS JOIN LATERAL (
          SELECT * FROM visible WHERE stage_id=t.stage_id ORDER BY ${representativeOrder} LIMIT 1
        ) representative ORDER BY t.weekly_voters DESC,t.stage_id COLLATE "C"`, [productId, viewerSubjectId, since, until]);
      return rows.map(publicStage).filter(Boolean);
    },

    async setVote({ productId, subjectId, stageId, enabled, since, until, votedAt = null }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await lockStageVoterAccount(client, { productId, subjectId });
        // 첫 담기에는 잠글 행이 없다. 같은 사용자·무대의 해제와 재담기도 같은 잠금을 거친다.
        await client.query("SELECT pg_advisory_xact_lock(hashtext('lovetree-stage-vote'),hashtext($1))",
          [JSON.stringify([productId, subjectId, stageId])]);
        if (!enabled) {
          await client.query('DELETE FROM lovetree_stage_saves WHERE product_id=$1 AND subject_id=$2 AND stage_id=$3',
            [productId, subjectId, stageId]);
          await client.query('COMMIT');
          return;
        }
        // 잠금 이후 한 스냅샷에서 공개 소속 재확인과 두 기록을 함께 처리한다. 같은 문장의 새 표는 RETURNING에서 센다.
        const { rows } = await client.query(`
          WITH visible AS (${visibleStage}), target AS (
            SELECT stage_id FROM visible WHERE NOT EXISTS (
              SELECT 1 FROM lovetree_account_deletions WHERE product_id=$1 AND subject_hash=$6
            ) LIMIT 1
          ),
          save AS (
            INSERT INTO lovetree_stage_saves(product_id,subject_id,stage_id)
            SELECT $1,$2,stage_id FROM target ON CONFLICT DO NOTHING
          ), first_vote AS (
            INSERT INTO lovetree_community_votes(product_id,subject_id,target_kind,target_id,voted_at)
            SELECT $1,$2,'stage',stage_id,COALESCE($7::timestamptz,statement_timestamp()) FROM target ON CONFLICT DO NOTHING
            RETURNING product_id,subject_id,voted_at
          )
          SELECT (SELECT count(*) FROM lovetree_community_votes v WHERE ${stageVotes} AND ${countedThisWeek})
               + (SELECT count(*) FROM first_vote v WHERE ${countedThisWeek}) AS weekly_voters FROM target`,
          [productId, subjectId, stageId, since, until, subjectHash(subjectId), votedAt]);
        await client.query('COMMIT');
        return rows.length ? { saved: true, voted: true, weeklyVoters: publicCount(rows[0].weekly_voters) } : null;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

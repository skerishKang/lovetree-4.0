import { ROLE_AI_CUSTOMER, ROLE_TESTER } from '../admin-roles.js';

const iso = (value) => (value instanceof Date ? value.toISOString() : value ? String(value) : null);

// #1098 3단계 — 내 소식 저장소(목록·안 읽은 수·읽음 표시).
// 기존 community 저장소(트리 단위 + 순간 단위 메서드)를 그대로 받아 위에 얹는다 — 기존 메서드는 한 줄도 바꾸지 않는다.
// 규칙은 서비스(server/my-news-service.js)가 정하고, 여기서는 표를 그대로 읽고 쓴다:
//  · 내(계정) 공유 행(lovetree_shares.subject_id = 나)에 남은 ♡·댓글·담기만 본다 — 내 트리와 그 순간이다.
//  · 내가 남긴 것(actor = 나)은 빼고, 시험 계정(tester)이 남긴 것도 뺀다.
//  · 숨김·삭제된 댓글(status <> 'visible')은 빼고, AI 명예회원(ai_customer) 몫은 ai_count 로 구분해 센다.
//  · 하루 묶음은 한국 날짜(Asia/Seoul) 기준이다 — 같은 날·같은 대상(트리/순간)·같은 종류(♡/댓글/담기)는 한 줄이다.
//  · ♡는 heart 하나만 본다(이슈 #1098 — 소식은 ♡·댓글·담기). 반응 표의 나머지 여섯 종은 소식이 아니다.
const AI_ROLE_EXISTS = (column) => `EXISTS (
    SELECT 1 FROM lovetree_product_roles ar
     WHERE ar.product_id = ${column}.product_id AND ar.subject_id = ${column}.subject_id
       AND ar.role = '${ROLE_AI_CUSTOMER}')`;
const NEWS_SOURCES = `
  SELECT r.share_id, r.subject_id AS actor, 'heart'::text AS kind, r.target_kind, r.moment_id,
         NULL::text AS body, r.created_at, ${AI_ROLE_EXISTS('r')} AS is_ai
    FROM lovetree_community_reactions r
   WHERE r.product_id = $1 AND r.kind = 'heart'
  UNION ALL
  SELECT c.share_id, c.subject_id, 'comment', c.target_kind, c.moment_id, c.body, c.created_at,
         ${AI_ROLE_EXISTS('c')} AS is_ai
    FROM lovetree_community_comments c
   WHERE c.product_id = $1 AND c.status = 'visible'
  UNION ALL
  SELECT f.share_id, f.subject_id, 'favorite', 'tree', '', NULL::text, f.created_at,
         ${AI_ROLE_EXISTS('f')} AS is_ai
    FROM lovetree_community_favorites f
   WHERE f.product_id = $1`;
const NEWS_FILTER = `
  JOIN lovetree_shares s ON s.product_id = $1 AND s.share_id = n.share_id
 WHERE s.subject_id = $2 AND n.actor <> $2
   AND NOT EXISTS (SELECT 1 FROM lovetree_product_roles tr
                    WHERE tr.product_id = $1 AND tr.subject_id = n.actor AND tr.role = '${ROLE_TESTER}')`;
const LINE_SQL = `
WITH news AS (${NEWS_SOURCES})
SELECT (n.created_at AT TIME ZONE 'Asia/Seoul')::date::text AS day,
       n.kind, n.target_kind, n.share_id, s.tree_id, n.moment_id,
       count(*)::int AS event_count,
       count(*) FILTER (WHERE n.is_ai)::int AS ai_count,
       max(n.created_at) AS last_at,
       (array_agg(n.body ORDER BY n.created_at DESC))[1] AS last_body
  FROM news n
  ${NEWS_FILTER}
 GROUP BY 1, 2, 3, 4, 5, 6
 ORDER BY last_at DESC, day DESC, n.kind, n.target_kind, n.share_id, n.moment_id
 LIMIT $3`;
const UNREAD_SQL = `
WITH news AS (${NEWS_SOURCES})
SELECT count(*)::int AS unread_count
  FROM (SELECT 1
          FROM news n
          ${NEWS_FILTER}
           AND ($3::timestamptz IS NULL OR n.created_at > $3::timestamptz)
         GROUP BY (n.created_at AT TIME ZONE 'Asia/Seoul')::date, n.kind, n.target_kind, n.share_id, n.moment_id) lines`;

export function createMyNewsRepo(base, pool) {
  return {
    ...base,
    // 내 소식 줄 목록 — 하루(KST)·종류·대상 묶음. 줄마다 count(사람+명예회원, 시험 계정 제외)와
    // aiCount(그중 명예회원 몫), 댓글 줄에는 가장 최근 본문(lastBody)을 함께 내려준다.
    async listMyNewsLines({productId, subjectId, limit = 50}) {
      const {rows} = await pool.query(LINE_SQL, [productId, subjectId, limit]);
      return rows.map((row) => ({
        id: `${row.day}|${row.kind}|${row.target_kind}|${row.share_id}|${row.moment_id || '-'}`,
        day: row.day,
        kind: row.kind,
        targetKind: row.target_kind,
        shareId: row.share_id,
        treeId: row.tree_id,
        momentId: row.moment_id || '',
        count: Number(row.event_count || 0),
        aiCount: Number(row.ai_count || 0),
        lastAt: iso(row.last_at),
        lastBody: row.kind === 'comment' ? (row.last_body ?? null) : null
      }));
    },
    // 안 읽은 줄 수 — 마지막 읽은 시각 이후에 새로 생긴 일이 있는 줄의 수(after 가 없으면 전부).
    async unreadNewsCount({productId, subjectId, after = null}) {
      const {rows} = await pool.query(UNREAD_SQL, [productId, subjectId, after]);
      return Number(rows[0]?.unread_count || 0);
    },
    // 읽음 표시 — 계정당 한 줄(표 PK). 시각은 뒤로 가지 않는다(두 창을 동시에 열어도 안전).
    async markNewsRead({productId, subjectId, at}) {
      const {rows} = await pool.query(
        `INSERT INTO lovetree_community_my_news_reads(product_id, subject_id, last_read_at, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (product_id, subject_id) DO UPDATE
           SET last_read_at = GREATEST(lovetree_community_my_news_reads.last_read_at, EXCLUDED.last_read_at),
               updated_at = now()
         RETURNING last_read_at`,
        [productId, subjectId, at]
      );
      return iso(rows[0]?.last_read_at);
    },
    async lastNewsReadAt({productId, subjectId}) {
      const {rows} = await pool.query(
        `SELECT last_read_at FROM lovetree_community_my_news_reads WHERE product_id = $1 AND subject_id = $2`,
        [productId, subjectId]
      );
      return rows[0] ? iso(rows[0].last_read_at) : null;
    }
  };
}

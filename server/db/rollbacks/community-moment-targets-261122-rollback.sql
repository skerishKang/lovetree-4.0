-- 되돌리기 문서(수동 실행 — 자동 적용되지 않는다).
-- PR: #1098 2단계 — 순간 단위 ♡·댓글 서버 규칙
-- 대상: server/db/migrations/community-moment-targets-261122.sql 을 적용한 DB를 적용 전 모양으로 되돌린다.
-- 순서: 아래 문단 순서대로 psql 에서 실행한다. 표의 실제 크기를 먼저 확인하고(문단 0) 진행한다.
-- 원칙: 순간 단위 행(적용 이후 새로 쌓인 행)만 지운다. 기존 트리 단위 행은 하나도 지우지 않는다.

-- 문단 0. 적용 이후 쌓인 순간 단위 행이 있는지 먼저 본다. 0행이면 문단 1~3의 DELETE 는 건너뛰어도 된다.
SELECT 'reactions' AS 표, count(*) AS 순간행
  FROM lovetree_community_reactions WHERE target_kind = 'moment';
SELECT 'comments' AS 표, count(*) AS 순간행
  FROM lovetree_community_comments WHERE target_kind = 'moment';
SELECT 'reports' AS 표, count(*) AS 순간댓글신고
  FROM lovetree_community_reports WHERE comment_id IS NOT NULL;

-- 문단 1. 순간 단위 신고 행부터 정리한다(되돌린 뒤에는 어떤 댓글 신고였는지 구분할 수 없으므로 먼저 처리 상태를 확인한다).
--   처리되지 않은(open) 순간 댓글 신고가 있으면 운영센터에서 먼저 처리하거나 기록을 백업한다.
--   필요하지 않다고 판단되면 아래 DELETE 의 주석을 푼다.
-- DELETE FROM lovetree_community_reports WHERE comment_id IS NOT NULL;

-- 문단 2. 순간 단위 반응 행을 지운다. (기존 PK는 moment_id 를 모르므로 순간 행이 남으면 PK 복원이 실패한다.)
DELETE FROM lovetree_community_reactions WHERE target_kind = 'moment';

-- 문단 3. 순간 단위 댓글 행을 지운다. 같은 idempotency 키를 트리 댓글에서 다시 쓰게 되는 충돌을 피하기 위해서다.
DELETE FROM lovetree_community_comments WHERE target_kind = 'moment';

-- 문단 4. 댓글 표: 유일 제약을 원래 모양으로 되돌린다.
ALTER TABLE lovetree_community_comments DROP CONSTRAINT IF EXISTS lovetree_community_comments_client_target_key;
ALTER TABLE lovetree_community_comments
  ADD CONSTRAINT lovetree_community_comments_product_id_subject_id_client_key_key UNIQUE (product_id, subject_id, client_key);

-- 문단 5. 반응 표: PK를 원래 모양으로 되돌린다(문단 2가 끝난 뒤에만 성공한다).
ALTER TABLE lovetree_community_reactions DROP CONSTRAINT IF EXISTS lovetree_community_reactions_pkey;
ALTER TABLE lovetree_community_reactions
  ADD CONSTRAINT lovetree_community_reactions_pkey PRIMARY KEY (product_id, share_id, subject_id, kind);

-- 문단 6. 대상 칸 검사 제약을 지운다.
ALTER TABLE lovetree_community_reactions DROP CONSTRAINT IF EXISTS lovetree_community_reactions_target_pair_check;
ALTER TABLE lovetree_community_reactions DROP CONSTRAINT IF EXISTS lovetree_community_reactions_target_kind_check;
ALTER TABLE lovetree_community_comments DROP CONSTRAINT IF EXISTS lovetree_community_comments_target_pair_check;
ALTER TABLE lovetree_community_comments DROP CONSTRAINT IF EXISTS lovetree_community_comments_target_kind_check;

-- 문단 7. 순간 목록 색인을 지운다.
DROP INDEX IF EXISTS lovetree_community_comments_moment_idx;

-- 문단 8. 덧붙였던 칸을 지운다(마지막 단계 — 위 문단이 모두 끝난 뒤).
ALTER TABLE lovetree_community_reports DROP COLUMN IF EXISTS comment_id;
ALTER TABLE lovetree_community_comments DROP COLUMN IF EXISTS moment_id;
ALTER TABLE lovetree_community_comments DROP COLUMN IF EXISTS target_kind;
ALTER TABLE lovetree_community_reactions DROP COLUMN IF EXISTS moment_id;
ALTER TABLE lovetree_community_reactions DROP COLUMN IF EXISTS target_kind;

-- 검증: 원래 모양(적용 전)으로 돌아왔는지 확인
SELECT column_name FROM information_schema.columns
 WHERE table_name IN ('lovetree_community_reactions','lovetree_community_comments')
   AND column_name IN ('target_kind','moment_id');
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'lovetree_community_reports' AND column_name = 'comment_id';
-- 두 질의가 모두 0행이면 되돌리기가 끝난 것이다.

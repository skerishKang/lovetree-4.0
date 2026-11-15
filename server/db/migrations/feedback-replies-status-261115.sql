-- 2026-11-15 고객 덧붙임 고치기·지우기(#678 후속 PR A). 커뮤니티 댓글(lovetree_community_comments)과
-- 같은 방식으로 lovetree_feedback_replies에 두 칸을 더한다.
--   status  text NOT NULL DEFAULT 'visible'  — 'visible'/'deleted'. 지우기는 실제 삭제가 아니라 status='deleted'(댓글과 같다).
--   edited_at timestamptz(빈 값 허용)          — 고객이 고친 시각. 지웠을 때도 '고객이 건드린 시각'으로 남긴다.
-- schema.sql의 lovetree_feedback_replies에도 같은 두 칸이 한 벌로 들어 있다. 재실행 안전(ADD COLUMN IF NOT EXISTS).
ALTER TABLE lovetree_feedback_replies
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','deleted')),
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

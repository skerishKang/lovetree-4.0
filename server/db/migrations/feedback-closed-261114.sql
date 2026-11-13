-- 2026-11-14 '닫음' 상태 (#564 10). 운영 DB에 이미 있는 lovetree_feedback.status CHECK 를 넓힌다.
-- schema.sql 에도 같은 CHECK('received','reviewing','fixed','later','closed')가 한 벌로 들어 있다.
-- '닫음'은 목록 기본에서 숨긴다(화면 몫). 서버는 FEEDBACK_STATUSES 에서 같은 목록을 쓴다.
ALTER TABLE lovetree_feedback DROP CONSTRAINT IF EXISTS lovetree_feedback_status_check;
ALTER TABLE lovetree_feedback ADD CONSTRAINT lovetree_feedback_status_check
  CHECK (status IN ('received','reviewing','fixed','later','closed'));

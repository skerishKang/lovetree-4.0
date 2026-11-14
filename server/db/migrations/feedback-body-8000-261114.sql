-- 2026-11-14 일지 본문 한도 2000→8000 (#596). 같은 날 2회차를 덧붙이기에 2000자가 모자랐다.
-- 의견(opinion)은 서버(MAX_BODY 2000)와 DB CHECK 로 2000 한도를 유지하고, 일지(journal)만 8000 까지 허용한다.
-- schema.sql 에도 같은 CHECK 가 한 벌로 들어 있다. 재실행 안전(DROP IF EXISTS → ADD).
ALTER TABLE lovetree_feedback DROP CONSTRAINT IF EXISTS lovetree_feedback_body_check;
ALTER TABLE lovetree_feedback ADD CONSTRAINT lovetree_feedback_body_check
  CHECK ((kind = 'journal' AND char_length(body) BETWEEN 1 AND 8000)
      OR (kind <> 'journal' AND char_length(body) BETWEEN 1 AND 2000));

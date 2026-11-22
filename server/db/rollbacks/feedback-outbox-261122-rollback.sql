-- #1190 되돌리기: 서식·이름은 서로 같은 표를 가리킨다(자동 이름 추측 없음).
-- 보내기 줄이 비어 있는지 먼저 확인한다.
SELECT count(*) AS 남은_줄 FROM lovetree_feedback_outbox;
DROP TABLE IF EXISTS lovetree_feedback_outbox;
SELECT 1 FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'lovetree_feedback_outbox';


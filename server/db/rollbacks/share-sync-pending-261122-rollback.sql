-- 되돌리기 문서(수동 실행 — 자동 적용되지 않는다).
-- PR: #1163 — 보임 쪽 공유 동기화를 응답 뒤로 미루고 실패 표식으로 다시 한다.
-- 대상: server/db/migrations/share-sync-pending-261122.sql 을 적용한 DB를 적용 전 모양으로 되돌린다.
-- 순서: 표의 크기를 먼저 확인하고(문단 1) 표를 지운다(문단 2). 공유·색인 표는 건드리지 않는다.
-- 문단 1. 남아 있는 표식 행 수 확인
SELECT count(*) AS 남은_표식 FROM lovetree_share_sync_pending;
-- 문단 2. 표식 표와 색인 삭제
DROP INDEX IF EXISTS lovetree_share_sync_pending_marked_idx;
DROP TABLE IF EXISTS lovetree_share_sync_pending;

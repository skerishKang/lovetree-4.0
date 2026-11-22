-- 되돌리기 문서(수동 실행 — 자동 적용되지 않는다).
-- PR: #1098 3단계 — 내 소식 읽음 시각 표
-- 대상: server/db/migrations/community-my-news-reads-261122.sql 이 만든 표 하나.
-- 순서: 아래 문단 순서대로 psql 에서 실행한다.
-- 원칙: 이 마이그레이션이 만든 표만 삭제한다. 반응·댓글·담기·공유 표는 건드리지 않는다.
--   표 이름은 마이그레이션이 만든 그 이름이다(잘린 자동 이름을 추측하는 일이 없다 — #1146 교훈).
--   제약·색인은 표와 함께 사라지므로 이름을 따로 다룰 일이 없다.

-- 문단 0. 삭제 전에 행 수를 본다. 읽음 시각은 되돌린 뒤 복구할 수 없으니 필요하면 먼저 백업한다.
SELECT count(*) AS 읽음행 FROM lovetree_community_my_news_reads;

-- 문단 1. 표를 삭제한다.
DROP TABLE IF EXISTS lovetree_community_my_news_reads;

-- 검증: 표가 없어졌는지 — 이 질의는 0행이어야 한다.
SELECT 1 FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'lovetree_community_my_news_reads';

-- 적용 DB 마이그레이션(이 파일만 단독 적용은 하지 않는다).
-- PR: #1098 3단계 — 내 소식(목록·안 읽은 수·읽음 표시) 서버 경로
-- 내용: 계정별 '마지막으로 소식을 읽은 시각'을 담는 표를 새로 만든다. 덧붙이기만 한다 —
--   기존 표(반응·댓글·담기·공유)는 한 칸도 바꾸지 않는다.
--   · 한 계정은 한 줄이다(제품 + 계정이 열쇠). 목록을 열 때 그 줄의 last_read_at 만 남긴다.
--   · 읽음 시각은 뒤로 가지 않는다(서비스가 GREATEST 로 올린다 — 두 창을 동시에 열어도 안전).
--   · 표 이름은 이 파일이 만든 그 이름이다. 되돌리기 문서(server/db/rollbacks/community-my-news-reads-261122-rollback.sql)가
--     같은 이름으로 삭제하므로 이름 추측이 없다(#1146 교훈 — 제약·표를 이름으로 추측해 다루지 않는다).
-- 재실행 안전: IF NOT EXISTS 라 두 번 적용해도 같은 상태다.

CREATE TABLE IF NOT EXISTS lovetree_community_my_news_reads (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id)
);

-- 검증: 칸이 다 있는지 — 이 질의는 0행이어야 한다(실행 시험이 마이그레이션 전체 적용 뒤 같이 확인한다).
SELECT want.column_name
  FROM (VALUES ('product_id'),('subject_id'),('last_read_at'),('updated_at')) AS want(column_name)
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'lovetree_community_my_news_reads'
      AND c.column_name = want.column_name);

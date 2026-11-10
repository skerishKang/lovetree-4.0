-- 미사용(자동 적용 아님): 기존 운영 DB에 손으로 집행한다. schema.sql 재적용만으로는
-- 새 표가 생기지 않으므로 별도 1회 실행이 필요하다. 재실행 안전(IF NOT EXISTS).
-- 2026-11-11 계정 이메일: 공통 로그인 토큰 교환 응답의 profile.email을 검증된 access
-- 토큰의 account_id와 함께 저장한다(스토어 서비스 내부 경로 전용).
CREATE TABLE IF NOT EXISTS lovetree_account_emails (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  email text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id)
);

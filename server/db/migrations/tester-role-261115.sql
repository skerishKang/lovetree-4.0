-- 2026-11-15 (#671) — 시험 계정 표식 역할 'tester'.
-- 레인 시험 계정(01~05)을 운영 숫자에서 '실제 사용자'와 갈라 세기 위한 값이다.
-- 남에게 보이는 화면에는 표시하지 않는다(AI 테스터 표시는 ai_customer 그대로).
-- 재실행 안전: CHECK 를 지우고 같은 내용으로 다시 건다(이미 tester 가 들어 있어도 결과가 같다).

ALTER TABLE lovetree_product_roles DROP CONSTRAINT IF EXISTS lovetree_product_roles_role_check;
ALTER TABLE lovetree_product_roles ADD CONSTRAINT lovetree_product_roles_role_check
  CHECK (role IN ('admin','ai_customer','tester'));

-- #1163(#1068 2단계): 보임 쪽 공유 동기화를 저장 응답 뒤로 미루면서 실패 시 계정별 표식.
-- 보임 동기화(순간 수 갱신·자동 공개 행·색인 반영)가 실패하면 표식을 남기고, 표식이 있는 계정은
-- 다음 저장·조회 요청에서 보임 동기화를 다시 시도해 성공하면 해제한다.
-- 기존 표는 한 칸도 바뀌지 않고 새 표 하나만 붙는다(재실행 안전).
CREATE TABLE IF NOT EXISTS lovetree_share_show_pending (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id)
);

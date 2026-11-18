-- #792 4단계 ②. 공개 순간의 무대 배정과 현재 담기를 담는다. 기존 기록과 표는 백필하지 않는다.
-- registration_order는 #792 ①의 겹침 동률을 푸는 순번이다. 최초 공개자가 탈퇴해도 기준은 유지한다.
CREATE TABLE IF NOT EXISTS lovetree_stages (
  product_id text NOT NULL,
  stage_id text NOT NULL DEFAULT gen_random_uuid()::text CHECK (stage_id <> ''),
  registration_order integer GENERATED ALWAYS AS IDENTITY UNIQUE,
  key_version smallint NOT NULL DEFAULT 1 CHECK (key_version = 1),
  platform text NOT NULL CHECK (platform = 'youtube'),
  video_id text COLLATE "C" NOT NULL CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  kind text NOT NULL,
  start_seconds integer,
  end_seconds integer,
  PRIMARY KEY (product_id, stage_id),
  UNIQUE NULLS NOT DISTINCT (product_id, key_version, platform, video_id, kind, start_seconds, end_seconds),
  UNIQUE (product_id, key_version, platform, video_id, kind, stage_id),
  CHECK (
    (kind = 'whole' AND start_seconds IS NULL AND end_seconds IS NULL) OR
    (kind = 'bookmark' AND start_seconds IS NOT NULL AND start_seconds BETWEEN 0 AND 43200 AND end_seconds IS NULL) OR
    (kind = 'range' AND start_seconds IS NOT NULL AND end_seconds IS NOT NULL
      AND start_seconds >= 0 AND start_seconds < end_seconds AND end_seconds <= 43200)
  )
);

-- 같은 입력의 배정은 하나다. 복합 외래 키가 다른 제품·영상·규칙·종류의 기준을 참조하는 것을 막는다.
CREATE TABLE IF NOT EXISTS lovetree_stage_assignments (
  product_id text NOT NULL,
  key_version smallint NOT NULL DEFAULT 1,
  platform text NOT NULL,
  video_id text COLLATE "C" NOT NULL,
  kind text NOT NULL,
  start_seconds integer,
  end_seconds integer,
  stage_id text NOT NULL,
  UNIQUE NULLS NOT DISTINCT (product_id, key_version, platform, video_id, kind, start_seconds, end_seconds),
  FOREIGN KEY (product_id, key_version, platform, video_id, kind, stage_id)
    REFERENCES lovetree_stages (product_id, key_version, platform, video_id, kind, stage_id),
  CHECK (
    (kind = 'whole' AND start_seconds IS NULL AND end_seconds IS NULL) OR
    (kind = 'bookmark' AND start_seconds IS NOT NULL AND start_seconds BETWEEN 0 AND 43200 AND end_seconds IS NULL) OR
    (kind = 'range' AND start_seconds IS NOT NULL AND end_seconds IS NOT NULL
      AND start_seconds >= 0 AND start_seconds < end_seconds AND end_seconds <= 43200)
  )
);

-- 기존 영구표가 가리키는 ID, 고정 기준 구간, 한 번 배정한 입력은 소속 순간이 모두 사라져도 보존한다.
CREATE OR REPLACE FUNCTION lovetree_keep_stage_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registered stage keys and assignments are immutable' USING ERRCODE = '55000';
END;
$$;
CREATE OR REPLACE TRIGGER lovetree_stages_immutable
  BEFORE UPDATE OR DELETE ON lovetree_stages
  FOR EACH ROW EXECUTE FUNCTION lovetree_keep_stage_identity();
CREATE OR REPLACE TRIGGER lovetree_stage_assignments_immutable
  BEFORE UPDATE OR DELETE ON lovetree_stage_assignments
  FOR EACH ROW EXECUTE FUNCTION lovetree_keep_stage_identity();

-- 공개 소속은 원본 revision이 바뀌면 교체한다. 화면 집계는 현재 볼 수 있는 (소유자, 트리)를 한 번씩 센다.
CREATE TABLE IF NOT EXISTS lovetree_stage_moments (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  tree_id text NOT NULL,
  moment_id text NOT NULL,
  stage_id text NOT NULL,
  source_revision bigint NOT NULL CHECK (source_revision >= 1),
  PRIMARY KEY (product_id, subject_id, tree_id, moment_id),
  FOREIGN KEY (product_id, stage_id) REFERENCES lovetree_stages (product_id, stage_id),
  FOREIGN KEY (product_id, subject_id) REFERENCES lovetree_workspaces (product_id, subject_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS lovetree_stage_moments_stage_idx
  ON lovetree_stage_moments (product_id, stage_id, subject_id, tree_id);

-- 현재 담기는 해제할 수 있다. 최초 표의 시각은 기존 lovetree_community_votes가 보관한다.
CREATE TABLE IF NOT EXISTS lovetree_stage_saves (
  product_id text NOT NULL,
  stage_id text NOT NULL,
  subject_id text NOT NULL,
  PRIMARY KEY (product_id, stage_id, subject_id),
  FOREIGN KEY (product_id, stage_id) REFERENCES lovetree_stages (product_id, stage_id)
);
CREATE INDEX IF NOT EXISTS lovetree_stage_saves_subject_idx
  ON lovetree_stage_saves (product_id, subject_id);

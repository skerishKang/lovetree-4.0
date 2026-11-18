import { findMatchingStageId } from '../../src/stage-key.js';

const inputId = key => JSON.stringify([key.kind, key.startSeconds, key.endSeconds]);
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;

// 모든 호출자가 같은 순서로 영상 잠금을 얻는다. 같은 영상 안에서는 시작·끝 오름차순으로 최초 기준을 만든다.
export function byVideo(moments) {
  const groups = new Map();
  for (const moment of moments) {
    const { version, platform, videoId } = moment.key;
    const id = JSON.stringify([version, platform, videoId]);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(moment);
  }
  return [...groups.keys()].sort().map(id => groups.get(id));
}

export async function lockVideo(client, productId, { version, platform, videoId }) {
  const lock = JSON.stringify(['lovetree-stage-video', productId, version, platform, videoId]);
  await client.query("SELECT pg_advisory_xact_lock(hashtext('lovetree-stage-video'), hashtext($1))", [lock]);
}

// 최초 배정은 불변이라 이미 아는 키는 잠금·기준 탐색 없이 함께 읽을 수 있다.
export async function resolveKnownInputs(db, productId, moments) {
  if (!moments.length) return [];
  const inputs = moments.map(({ key }, position) => ({
    position, key_version: key.version, platform: key.platform, video_id: key.videoId,
    kind: key.kind, start_seconds: key.startSeconds, end_seconds: key.endSeconds
  }));
  const result = await db.query(
    `SELECT k.position,a.stage_id FROM jsonb_to_recordset($2::jsonb) AS k(position int,key_version smallint,
       platform text,video_id text,kind text,start_seconds int,end_seconds int)
     JOIN lovetree_stage_assignments a ON a.product_id=$1
       AND (a.key_version,a.platform,a.video_id,a.kind)=(k.key_version,k.platform,k.video_id,k.kind)
       AND a.start_seconds IS NOT DISTINCT FROM k.start_seconds AND a.end_seconds IS NOT DISTINCT FROM k.end_seconds`,
    [productId, JSON.stringify(inputs)]
  );
  for (const row of result.rows) moments[row.position].stage_id = row.stage_id;
  return moments.filter(moment => !moment.stage_id);
}

// 호출자는 영상 잠금을 보유한다. 배정표가 없는 최초 키만 고정 기준과 비교한다.
export async function assignVideo(client, productId, moments) {
  if (!moments.length) return;
  const { version, platform, videoId } = moments[0].key;
  const params = [productId, version, platform, videoId];
  const fromVideo = 'WHERE product_id=$1 AND key_version=$2 AND platform=$3 AND video_id=$4';
  const fields = 'kind, start_seconds AS "startSeconds", end_seconds AS "endSeconds", stage_id AS "stageId"';
  const existing = await client.query(`SELECT ${fields} FROM lovetree_stage_assignments ${fromVideo}`, params);
  const assigned = new Map(existing.rows.map(row => [inputId(row), row.stageId]));
  const missing = new Map();
  for (const { key } of moments) {
    const id = inputId(key);
    if (!assigned.has(id)) missing.set(id, key);
  }
  if (missing.size) {
    const registered = await client.query(
      `SELECT ${fields}, registration_order AS "registrationOrder" FROM lovetree_stages ${fromVideo}`, params
    );
    const anchors = registered.rows.map(({ stageId, registrationOrder, ...interval }) => ({
      stageId, registrationOrder, key: { version, platform, videoId, ...interval }
    }));
    const keys = [...missing.values()].sort((a, b) =>
      (a.startSeconds ?? -1) - (b.startSeconds ?? -1) || (a.endSeconds ?? -1) - (b.endSeconds ?? -1) ||
      compareText(a.kind, b.kind));
    const additions = [];
    for (const key of keys) {
      let stageId = findMatchingStageId(key, anchors);
      if (!stageId) {
        const result = await client.query(
          `INSERT INTO lovetree_stages(product_id,key_version,platform,video_id,kind,start_seconds,end_seconds)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING stage_id, registration_order`,
          [...params, key.kind, key.startSeconds, key.endSeconds]
        );
        stageId = result.rows[0].stage_id;
        anchors.push({ stageId, key, registrationOrder: result.rows[0].registration_order });
      }
      assigned.set(inputId(key), stageId);
      additions.push({ kind: key.kind, start_seconds: key.startSeconds, end_seconds: key.endSeconds, stage_id: stageId });
    }
    await client.query(
      `INSERT INTO lovetree_stage_assignments(product_id,key_version,platform,video_id,kind,start_seconds,end_seconds,stage_id)
       SELECT $1,$2,$3,$4,k.kind,k.start_seconds,k.end_seconds,k.stage_id
       FROM jsonb_to_recordset($5::jsonb) AS k(kind text,start_seconds integer,end_seconds integer,stage_id text)`,
      [...params, JSON.stringify(additions)]
    );
  }
  for (const moment of moments) moment.stage_id = assigned.get(inputId(moment.key));
}

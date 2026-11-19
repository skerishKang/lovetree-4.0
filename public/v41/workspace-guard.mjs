import {validateState} from './domain.mjs';

// #977: 작업 공간(/api/workspace)에는 도메인 규칙을 어긴 트리가 섞여 있을 수 있다.
// 트리 하나가 어긋났다고 셸 전체를 못 열면(게다가 안내도 없으면) 화면은 빈 채로 멈춘다.
// 그래서 읽을 때 트리 하나씩 검사한다.
//   ① 고칠 수 있는 값(시각·이름·표지)만 기본값으로 채워 읽고
//   ② 그래도 규칙에 맞지 않으면 그 트리만 빼고 나머지로 연다.
// #986: 뺀 트리의 원본 보존은 서버 몫이다 — 서버가 저장할 때 격리 원본을 다시 붙여 보관하고
// 읽을 때는 빠진 개수(quarantined)만 응답에 알린다. 화면은 본문에 원본을 붙이지 않는다(붙이면
// 서버 전체 검사에 400 invalid_document로 거절되어 그 계정은 영영 저장하지 못하게 된다).
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const idValid = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const timeValid = value => typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
const line = (value, fallback, max) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : fallback;

// 기본값으로 고쳐도 되는 값만 고친다. 순간 목록처럼 내용이 걸린 값은 고치지 않는다(그 트리는 뺀다).
function repairTree(tree, now) {
  if (!isObject(tree)) return { tree, fields: [] };
  const fields = [];
  const out = { ...tree };
  const moments = Array.isArray(out.moments) ? out.moments : [];
  if (!timeValid(out.updatedAt)) {
    out.updatedAt = timeValid(out.createdAt) ? out.createdAt : now;
    fields.push('updatedAt');
  }
  if (!timeValid(out.createdAt)) {
    out.createdAt = out.updatedAt;
    fields.push('createdAt');
  }
  if (typeof out.subject !== 'string' || !out.subject.trim() || out.subject.length > 60) {
    out.subject = line(out.title, '기록', 60);
    fields.push('subject');
  }
  if (typeof out.title !== 'string' || !out.title.trim() || out.title.length > 100) {
    out.title = line(out.subject, '제목 없는 트리', 100);
    fields.push('title');
  }
  if (typeof out.coverMomentId !== 'string' || (out.coverMomentId && !moments.some(m => m?.id === out.coverMomentId))) {
    out.coverMomentId = '';
    fields.push('coverMomentId');
  }
  return { tree: out, fields };
}

// raw는 서버(또는 저장본)가 준 state. 돌려주는 값:
//   state     — 읽을 수 있는 트리만 담은 검증된 상태(셸·도메인이 쓰는 값)
//   skipped   — 뺀 트리 [{id, reason}] (화면 안내·콘솔 경고에 쓴다)
//   repaired  — 기본값으로 고쳐 읽은 트리 [{id, fields}]
export function guardWorkspaceState(value, { now = new Date().toISOString() } = {}) {
  const skipped = [], repaired = [];
  const unreadable = !isObject(value) || value.version !== 1 || !Array.isArray(value.trees)
    ? '지원하지 않는 러브트리 파일이에요.' : null;
  let state = { version: 1, trees: [], prefs: isObject(value) ? value.prefs : undefined };
  for (const raw of (unreadable ? [] : value.trees)) {
    const { tree, fields } = repairTree(raw, now);
    let next;
    try {
      // 트리 하나씩만 검증한다 — 한 트리의 문제가 다른 트리까지 막지 않게.
      next = validateState({ version: 1, trees: [...state.trees, tree], prefs: isObject(value) ? value.prefs : undefined });
    } catch (error) {
      skipped.push({
        id: idValid(raw?.id) ? raw.id : null,
        reason: error?.message || '트리 데이터가 올바르지 않아요.'
      });
      continue;
    }
    state = next;
    if (fields.length && idValid(tree?.id)) repaired.push({ id: tree.id, fields });
  }
  return { state, skipped, repaired, unreadable };
}

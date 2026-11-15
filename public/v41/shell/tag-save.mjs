// #627 PR B: 꼬리표 저장 한 곳 — 기존 워크스페이스 저장 경로로 keywords만 바꾼다(새 저장 경로·서버 변경 없음).
// 저장 경로는 기존 순간 수정 경로 가운데 keywords를 이미 받는 boardSync(4.1 기억 보드 저장)를 쓴다.
// boardSync는 셸이 iframe을 다시 그리지 않는 길이라 상세를 연 채로 칩이 바뀐다 — 화면 사본은 lt41-tags-saved
// 답과 lt41-tags-changed 이벤트로 각자 바꾼다. 서버는 같은 문서 규칙(validateState)으로 받는다.
import { normalizeTags } from '../tags.mjs';
import { momentsWithKeywords } from '../tag-model.mjs';

export function createTagSave(deps) {
  const getMember = deps.getMember;
  const getModel = deps.getModel;
  const notify = deps.notify;

  // {treeId, momentId, keywords} → 바뀐 부분만 저장. 바뀐 것이 없으면 저장하지 않는다(조용히 같은 값).
  // 돌려주는 값: {ok, keywords, changed, error?} — 화면은 keywords로 칩을 다시 맞춘다.
  function save({ treeId, momentId, keywords, notice = '꼬리표를 저장했어요.', quiet = false } = {}) {
    const member = getMember();
    if (!member?.snapshot().owned || !member.snapshot().writable) return { ok: false, error: 'readonly' };
    const tree = (getModel()?.trees || []).find((t) => t.id === treeId);
    const moment = tree?.moments.find((m) => m.id === momentId);
    if (!tree || !moment) return { ok: false, error: 'notfound' };
    const { tags } = normalizeTags(keywords);
    const current = Array.isArray(moment.keywords) ? moment.keywords : [];
    const same = current.length === tags.length && current.every((v, i) => v === tags[i]);
    if (same) return { ok: true, keywords: current, changed: false };
    try {
      member.apply('boardSync', { moments: momentsWithKeywords(tree, [{ momentId, keywords: tags }]) }, { treeId });
    } catch (error) {
      return { ok: false, error: error?.message || '저장하지 못했어요.' };
    }
    if (!quiet && notice) notify(notice);
    return { ok: true, keywords: tags, changed: true };
  }

  // 여러 순간을 한 번에 바꾼다(이름 바꾸기·합치기·제안 한 번에 저장). 이미 계산된 moments 배열을 넘긴다.
  function saveMoments({ treeId, moments, notice = '꼬리표를 저장했어요.' } = {}) {
    const member = getMember();
    if (!member?.snapshot().owned || !member.snapshot().writable) return { ok: false, error: 'readonly' };
    const tree = (getModel()?.trees || []).find((t) => t.id === treeId);
    if (!tree) return { ok: false, error: 'notfound' };
    if (!Array.isArray(moments) || !moments.length) return { ok: false, error: 'empty' };
    try {
      member.apply('boardSync', { moments }, { treeId });
    } catch (error) {
      return { ok: false, error: error?.message || '저장하지 못했어요.' };
    }
    if (notice) notify(notice);
    return { ok: true, changed: true };
  }

  return { save, saveMoments };
}

// 원본 작업이 끝난 뒤 공개 소속을 보완한다. 실패한 소속은 전체 대조로 다시 만들 수 있다.
export async function refreshStageIndex(stageIndex, { productId, subjectId, shareId }, shareRepo) {
  if (!stageIndex) return;
  try {
    const owner = subjectId ?? (await shareRepo.load({ productId, shareId }))?.subjectId;
    if (owner) await stageIndex.reconcile({ productId, subjectId: owner });
  } catch {
    console.error('[lovetree-stage] 공개 무대 색인 갱신 실패');
  }
}

// 공유 주소 규칙과 복사 실패 안내 한 벌(#1540).
// 셸 공유 판·첫 화면 ⋯ 메뉴·둘러보기에서 같은 주소를 복사하고 같은 안내를 쓴다.
export const SHARE_COPY_FAILURE = '복사하지 못했어요. 열어 보기로 주소를 확인해 주세요.';

export function shareUrlFor(id, view) {
  // #541: 복사할 주소는 미리보기 카드가 붙는 /t/<id>. view 는 서버가 주소에서 정하고,
  // 기존 #share/<id>/<view> 주소도 계속 열린다(앱 안 이동은 그 형식을 그대로 쓴다).
  return new URL(`/t/${encodeURIComponent(id)}`, location.origin).href;
}

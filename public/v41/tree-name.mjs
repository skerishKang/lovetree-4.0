// 트리 이름 표시 규칙(#212)만 담는 순수 모듈. DOM·저장을 건드리지 않는다.
// 저장 데이터는 바꾸지 않고 화면 표시 단계에서만 자동 접미사를 뺀다.
//
// 자동 접미사는 트리를 만들 때 createTree가 붙이는 ", 나의 순간들"이다.
// 사용자가 직접 그 문구를 이름에 넣은 경우와 구분할 수 없으므로,
// "정확히 자동 문구로 끝나고, 그 앞부분이 비어 있지 않을 때"만 뗀다.
export const AUTO_TITLE_SUFFIX = ', 나의 순간들';

// createTree가 만드는 제목. 생성 경로와 표시 규칙이 같은 문구를 쓰도록 한 곳에 둔다.
export function autoTreeTitle(subject) {
  const name = typeof subject === 'string' ? subject.trim() : '';
  return `${name}${AUTO_TITLE_SUFFIX}`;
}

// 표시용 트리 이름. 자동 문구와 정확히 일치할 때만 접미사를 뗀다.
export function displayTreeTitle(title) {
  const value = typeof title === 'string' ? title : '';
  if (!value.endsWith(AUTO_TITLE_SUFFIX)) return value;
  const head = value.slice(0, value.length - AUTO_TITLE_SUFFIX.length);
  // 앞부분이 비면 접미사 자체가 이름이므로 그대로 둔다.
  return head.trim() ? head : value;
}

// 자동 접미사가 붙은 이름인지. 새로 만들 때 문구를 붙이지 않도록 생성 경로가 확인한다.
export function hasAutoTitleSuffix(title) {
  const value = typeof title === 'string' ? title : '';
  return value.length > AUTO_TITLE_SUFFIX.length && value.endsWith(AUTO_TITLE_SUFFIX);
}

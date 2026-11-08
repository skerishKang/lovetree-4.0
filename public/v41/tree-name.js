// 트리 이름 표시 규칙(#212)의 클래식 스크립트 판본. 화면(iframe)은 모듈이 아니므로 window에 붙인다.
// 규칙의 원본은 tree-name.mjs이고, 두 파일이 같은 결과를 내는지 시험이 확인한다.
(function () {
  'use strict';
  var AUTO_TITLE_SUFFIX = ', 나의 순간들';
  function autoTreeTitle(subject) {
    var name = typeof subject === 'string' ? subject.trim() : '';
    return name + AUTO_TITLE_SUFFIX;
  }
  // 자동 문구와 정확히 일치할 때만 접미사를 뗀다. 앞부분이 비면 그대로 둔다.
  function displayTreeTitle(title) {
    var value = typeof title === 'string' ? title : '';
    if (value.slice(-AUTO_TITLE_SUFFIX.length) !== AUTO_TITLE_SUFFIX) return value;
    var head = value.slice(0, value.length - AUTO_TITLE_SUFFIX.length);
    return head.trim() ? head : value;
  }
  function hasAutoTitleSuffix(title) {
    var value = typeof title === 'string' ? title : '';
    return value.length > AUTO_TITLE_SUFFIX.length && value.slice(-AUTO_TITLE_SUFFIX.length) === AUTO_TITLE_SUFFIX;
  }
  window.LTTreeName = Object.freeze({
    AUTO_TITLE_SUFFIX: AUTO_TITLE_SUFFIX,
    autoTreeTitle: autoTreeTitle,
    displayTreeTitle: displayTreeTitle,
    hasAutoTitleSuffix: hasAutoTitleSuffix
  });
}());

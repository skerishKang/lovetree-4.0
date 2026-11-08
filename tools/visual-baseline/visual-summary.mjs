#!/usr/bin/env node
// 화면 비교 결과(JSON)를 PR 체크 요약용 Markdown으로 바꾼다(2026-11-08, 원칙 8 알림 단계).
// 기준을 넘어도 실패로 만들지 않는다 — 의도한 디자인 변경도 있으므로 "확인 필요"로만 알린다.
// 사용: node tools/visual-baseline/visual-summary.mjs <diff.json> [--before-url u] [--after-url u] [--lag 메모]
import { readFileSync, appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const jsonPath = args.find((value) => !value.startsWith('--'));
const opt = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : '';
};
if (!jsonPath) {
  console.error('사용법: visual-summary.mjs <diff.json> [--before-url u] [--after-url u] [--lag 메모] [--summary md]');
  process.exit(2);
}
const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
const shots = data.shots || [];
const over = shots.filter((shot) => shot.ratio > shot.limit);
const lines = [];
lines.push(`## 겉모습 비교(visual-baseline) — ${over.length ? `확인 필요 ${over.length}장` : '기준 이내'}`);
lines.push('');
if (opt('before-url')) lines.push(`- before(운영): \`${opt('before-url')}\``);
if (opt('after-url')) lines.push(`- after(미리보기): \`${opt('after-url')}\``);
if (opt('lag')) lines.push(`- ⚠ ${opt('lag')}`);
lines.push(`- ${shots.length}장 중 차이 있음 ${shots.filter((shot) => shot.ratio > 0).length}장 · 최대 ${Number(data.worst || 0).toFixed(3)}% · 기준 초과 ${over.length}장`);
lines.push(`- 이 비교는 **알림**입니다(실패 처리하지 않음). 의도한 디자인 변경이면 그대로 두고, 아니면 확인이 필요합니다.`);
lines.push('');
lines.push('| 장 | 차이 % | 기준 | 결과 |');
lines.push('| --- | ---: | ---: | --- |');
for (const shot of shots.sort((a, b) => b.ratio - a.ratio).slice(0, 24)) {
  const label = shot.ratio > shot.limit ? '**확인 필요**' : (shot.ratio === 0 ? '동일' : '기준 이내');
  lines.push(`| \`${shot.name}\` | ${shot.ratio.toFixed(3)} | ${shot.limit} | ${label}${shot.note ? ` ${shot.note}` : ''} |`);
}
const markdown = `${lines.join('\n')}\n`;
console.log(markdown);
const summaryPath = opt('summary') || process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) appendFileSync(summaryPath, markdown);
process.exit(0);

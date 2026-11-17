#!/usr/bin/env node
// PR 제목·본문·커밋 메시지에 도구 꼬리말·금지어가 남았는지 본다(2026-11-16 CTO 결정).
// 공개 저장소에는 어떤 도구로 만들었는지·누가 만들었는지를 남기지 않는다. 이미 들어간 기록은 고치지 않는다.
// 금지어 목록은 **저장소 비밀값 LT_COMMIT_BANNED_WORDS**(줄마다 하나)에서 온다 — 문서·코드·시험에 적지 않는다.
// 비밀값이 없는 곳(포크 PR)에서는 도구 꼬리말만 검사한다.
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

export const FOOTER_WORD = 'co-authored-by';
// squash 병합 본문은 병합 시점에 생기므로 사전 검사 범위가 아니다 — 커밋·PR에 도구 공동 작성자 줄이 있으면
// 자동 병합이 그 줄을 본문에 옮긴다. 사람 공동 작성자도 두지 않으므로 예외 없이 줄 자체를 막는다.
export const FOOTER_LINE_PATTERN = /^\s*co-authored-by\s*:/i;
export const BANNED_ENV_NAME = 'LT_COMMIT_BANNED_WORDS';
export const MISSING_LIST_WARNING = `COMMIT_HYGIENE=WARN ${BANNED_ENV_NAME} 없음 — 도구 꼬리말만 검사합니다(포크 PR은 비밀값이 없습니다).`;

/** 비밀값 문자열(줄마다 하나)을 소문자 낱말 목록으로. 값은 출력하지 않는다. */
export function parseBannedWords(raw) {
  return String(raw ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0);
}

/** 검사에 쓸 목록: 도구 꼬리말은 늘 포함하고, 비밀값 목록이 있으면 더한다. */
export function resolveWords(env = process.env) {
  const fromSecret = parseBannedWords(env?.[BANNED_ENV_NAME]);
  const words = [FOOTER_WORD, ...fromSecret];
  return { words: [...new Set(words)], hasSecretList: fromSecret.length > 0 };
}

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 한글 낱말 뒤에 자연스럽게 붙는 조사 — 이름에 조사가 붙어도 같은 이름으로 보고, 동사('지우기')는 걸리지 않게 한다.
const KOREAN_PARTICLES = '의|이|가|은|는|을|를|과|와|도|만|께|에게|에서|부터|까지';

/**
 * 낱말 경계를 지킨 정규식. 사람 이름 오탐을 줄이려고 경계를 쓴다.
 * - ASCII 낱말: 앞뒤로 글자·숫자가 붙으면 다른 낱말이다(단위 이름 등).
 * - 한글 낱말: 앞뒤를 막되 조사 하나는 붙어도 같은 낱말로 본다.
 */
export function wordPattern(word) {
  const raw = String(word).toLowerCase();
  const body = escapePattern(raw);
  const ascii = /^[\x20-\x7e]+$/.test(raw);
  return ascii
    ? new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, 'i')
    : new RegExp(`(?<![가-힣])${body}(?:${KOREAN_PARTICLES})?(?![가-힣])`, 'i');
}

/** 제목·본문·커밋 메시지의 'Co-authored-by:' 줄 자체를 모은다(목록 유무와 무관, 예외 없음). */
export function findFooterLines({ title = '', body = '', commits = [] } = {}) {
  const hits = [];
  const check = (value, where, index) => {
    for (const line of String(value ?? '').split(/\r?\n/)) {
      if (FOOTER_LINE_PATTERN.test(line)) {
        hits.push({ where, index, word: FOOTER_WORD, excerpt: line.trim(), excerptMasked: '***' + line.trim().slice(FOOTER_WORD.length) });
      }
    }
  };
  check(title, 'PR 제목', null);
  check(body, 'PR 본문', null);
  commits.forEach((message, position) => check(message, '커밋', position + 1));
  return hits;
}

/** 제목·본문·커밋 메시지에서 걸린 곳을 모은다. 걸린 자리 앞뒤 24자만 남긴다. */
export function findViolations({ title = '', body = '', commits = [] } = {}, words = []) {
  const patterns = (Array.isArray(words) ? words : [])
    .filter((word) => typeof word === 'string' && word.trim().length > 0)
    .map((word) => ({ word, pattern: wordPattern(word) }));
  const footerLines = findFooterLines({ title, body, commits });
  const found = [...footerLines];
  const scan = (value, where, index) => {
    const text = String(value ?? '');
    if (!text) return;
    for (const { word, pattern } of patterns) {
      // 줄 자체로 이미 잡힌 꼬리말은 단어 검사로 중복 보고하지 않는다.
      if (word === FOOTER_WORD && footerLines.some((hit) => hit.where === where && hit.index === index)) continue;
      const match = pattern.exec(text);
      if (!match) continue;
      const from = Math.max(0, match.index - 24);
      const end = match.index + match[0].length;
      const head = text.slice(from, match.index);
      const tail = text.slice(end, end + 24);
      const tidy = (value) => value.replace(/\s+/g, ' ').trim();
      found.push({
        where,
        index,
        word,
        excerpt: tidy(text.slice(from, end + 24)),
        // 비밀값 목록 낱말은 로그에 되풀이하지 않는다 — 걸린 자리만 가린 사본.
        excerptMasked: tidy(`${head}***${tail}`)
      });
    }
  };
  scan(title, 'PR 제목', null);
  scan(body, 'PR 본문', null);
  commits.forEach((message, position) => scan(message, '커밋', position + 1));
  return found;
}

/** 보고용 한 줄씩. 커밋은 몇 번째 커밋인지 함께 적는다. 걸린 낱말 자체는 목록 비밀을 지키려고 가린다. */
export function formatReport(violations, { hideWords = false } = {}) {
  return violations
    .map((v) => {
      const label = hideWords ? '금지어' : `'${v.word}'`;
      const excerpt = hideWords ? v.excerptMasked : v.excerpt;
      return `${v.where}${v.index ? ` #${v.index}` : ''}: ${label} … ${excerpt}`;
    })
    .join('\n');
}

function readMessageRange(range) {
  try {
    const out = execFileSync('git', ['log', '--format=%B%x00', range], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return out
      .split('\0')
      .map((message) => message.trim())
      .filter((message) => message.length > 0);
  } catch {
    return [];
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i];
    if (!name.startsWith('--')) continue;
    const key = name.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : 'true';
    args[key] = value;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { words, hasSecretList } = resolveWords(process.env);
  if (!hasSecretList) console.log(MISSING_LIST_WARNING);

  let event = {};
  if (args.event && args.event !== 'true') {
    try {
      event = JSON.parse(await readFile(args.event, 'utf8'));
    } catch {
      console.error(`COMMIT_HYGIENE=ERROR 이벤트 파일을 읽지 못했습니다: ${args.event}`);
      process.exit(2);
    }
  }
  const pullRequest = event.pull_request ?? {};
  const base = args.base && args.base !== 'true' ? args.base : (pullRequest.base?.ref ?? 'main');
  const range = args.range && args.range !== 'true' ? args.range : `origin/${base}..HEAD`;
  const commits = readMessageRange(range);

  const violations = findViolations({ title: pullRequest.title, body: pullRequest.body, commits }, words);
  if (violations.length > 0) {
    console.log('COMMIT_HYGIENE=FAIL');
    // 비밀값 목록에서 온 낱말은 로그에 되풀이하지 않는다(꼬리말만 이름을 밝힌다).
    console.log(formatReport(violations, { hideWords: hasSecretList }));
    console.log('고치는 법: 제목·본문·커밋 메시지에서 도구 이름·꼬리말 줄을 지우세요(이미 머지된 기록은 그대로 둡니다).');
    process.exit(1);
  }
  console.log(`COMMIT_HYGIENE=PASS words=${words.length} secret_list=${hasSecretList ? 'yes' : 'no'} commits=${commits.length} range=${range}`);
}

if (process.argv[1]?.endsWith('commit-hygiene.mjs')) {
  await main();
}
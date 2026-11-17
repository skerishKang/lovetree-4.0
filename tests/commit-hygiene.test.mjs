// PR 제목·본문·커밋 메시지 문구 검사(2026-11-16 CTO 결정) 시험.
// 목록은 저장소 비밀값에서 오므로, 시험은 가짜 낱말을 환경변수로 넣어서 한다(실제 금지어를 파일에 적지 않는다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  FOOTER_WORD,
  FOOTER_LINE_PATTERN,
  findFooterLines,
  BANNED_ENV_NAME,
  MISSING_LIST_WARNING,
  parseBannedWords,
  resolveWords,
  wordPattern,
  findViolations,
  formatReport
} from '../scripts/commit-hygiene.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FAKE = ['zzsecretone', '가짜이름'];

test('비밀값 문자열을 줄마다 낱말로 읽는다(빈 줄·앞뒤 공백 무시, 대소문자 통일)', () => {
  assert.deepEqual(parseBannedWords(' ZzSecretOne \n\n가짜이름\n'), ['zzsecretone', '가짜이름']);
  assert.deepEqual(parseBannedWords(''), []);
  assert.deepEqual(parseBannedWords(undefined), []);
});

test('비밀값이 없으면 도구 꼬리말만 검사한다', () => {
  const resolved = resolveWords({});
  assert.equal(resolved.hasSecretList, false);
  assert.deepEqual(resolved.words, [FOOTER_WORD]);
  assert.match(MISSING_LIST_WARNING, /LT_COMMIT_BANNED_WORDS/);
});

test('비밀값이 있으면 꼬리말과 목록 낱말을 함께 본다(중복 없이)', () => {
  const resolved = resolveWords({ [BANNED_ENV_NAME]: 'zzsecretone\nco-authored-by\n가짜이름' });
  assert.equal(resolved.hasSecretList, true);
  assert.deepEqual(resolved.words.sort(), [FOOTER_WORD, 'zzsecretone', '가짜이름'].sort());
});

test('도구 꼬리말이 붙은 커밋 메시지는 목록이 없어도 실패한다', () => {
  const commits = [`쉬운 추가 연결 고침\n\n- public/v41/domain.mjs: 이전 순간 고르기\n\nCo-authored-by: zzsecretone <zz@example.com>`];
  const found = findViolations({ commits }, resolveWords({}).words);
  assert.equal(found.length, 1);
  assert.equal(found[0].where, '커밋');
  assert.equal(found[0].index, 1);
  assert.equal(found[0].word, FOOTER_WORD);
  assert.match(formatReport(found), /커밋 #1/);
});

test('Co-authored-by 줄 자체를 제목·본문·커밋에서 예외 없이 잡는다', () => {
  const cases = [
    [{ title: 'Co-authored-by: 사람 <p@example.com>' }, 'PR 제목', null],
    [{ body: '고침\n\nco-authored-by: 도구 <tool@example.com>' }, 'PR 본문', null],
    [{ commits: ['제목', '본문\n\nCO-AUTHORED-BY: 도구 <tool@example.com>'] }, '커밋', 2]
  ];
  for (const [input, where, index] of cases) {
    const hits = findFooterLines(input);
    assert.equal(hits.length, 1, JSON.stringify(input));
    assert.equal(hits[0].where, where);
    assert.equal(hits[0].index, index);
    assert.equal(hits[0].word, FOOTER_WORD);
    // 단어 검사와 합쳐도 같은 줄은 한 번만 보고한다.
    assert.equal(findViolations(input, resolveWords({}).words).length, 1);
  }
  assert.equal(FOOTER_LINE_PATTERN.test('Co-authored-by: x <x@y>'), true);
  assert.equal(FOOTER_LINE_PATTERN.test('본문에 co-authored-by 라고 적힘'), false);
  assert.deepEqual(findFooterLines({ body: '공동 작성자 없음' }), []);
});

test('비밀값 목록의 낱말이 PR 제목·본문·커밋에 있으면 실패한다', () => {
  const words = resolveWords({ [BANNED_ENV_NAME]: FAKE.join('\n') }).words;
  assert.equal(findViolations({ title: '고객 탭 추가', body: 'zzsecretone로 점검' }, words).length, 1);
  assert.equal(findViolations({ body: '가짜이름 확인' }, words)[0].word, '가짜이름');
  assert.equal(findViolations({ commits: ['메모: zzsecretone'] }, words)[0].where, '커밋');
  // 목록에 없으면 통과
  assert.deepEqual(findViolations({ body: 'zzsecretone로 점검' }, resolveWords({}).words), []);
});

test('꼬리말·금지어가 없는 제목·본문·커밋은 통과한다', () => {
  const words = resolveWords({ [BANNED_ENV_NAME]: FAKE.join('\n') }).words;
  const found = findViolations(
    {
      title: '새 소식 창을 어디서든 닫을 수 있게',
      body: 'sticky 머리줄 대신 입구에서 맨 위로 연다.\n\n검증: npm test 1752 pass, build 통과.',
      commits: ['창 머리줄 고정', 'CI 빨강 수리: 최신 버전으로 굴리던 자리']
    },
    words
  );
  assert.deepEqual(found, []);
});

test('낱말 경계를 지킨다 — 다른 낱말 속 글자와 동사는 걸리지 않는다', () => {
  const words = resolveWords({ [BANNED_ENV_NAME]: FAKE.join('\n') }).words;
  assert.equal(findViolations({ body: 'zzsecretonex 단위를 줄였다' }, words).length, 0);
  assert.equal(findViolations({ body: '가짜이름기 단추' }, words).length, 0);
  assert.equal(findViolations({ body: '가짜이름의 일지' }, words).length, 1, '조사가 붙어도 같은 이름');
  assert.equal(wordPattern('zzsecretone').test('ZzSecretOneX'), false);
  assert.equal(wordPattern('zzsecretone').test('by zzsecretone'), true);
});

test('검사기는 걸리면 1, 통과하면 0으로 끝나고, 비밀값이 없으면 경고를 남긴다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lt-hygiene-'));
  const dirtyFooter = join(dir, 'footer.json');
  const dirtyList = join(dir, 'list.json');
  const clean = join(dir, 'clean.json');
  await writeFile(dirtyFooter, JSON.stringify({ pull_request: { title: '고침', body: '작성자: zzsecretone' } }));
  await writeFile(dirtyFooter, JSON.stringify({ pull_request: { title: '고침', body: '내용 정리\n\nCo-authored-by: zzsecretone <zz@example.com>' } }));
  await writeFile(dirtyList, JSON.stringify({ pull_request: { title: '고침', body: 'zzsecretone로 점검' } }));
  await writeFile(clean, JSON.stringify({ pull_request: { title: '고침', body: '기록을 남기지 않는다' } }));
  const argv = (event) => ['scripts/commit-hygiene.mjs', '--event', event, '--range', 'HEAD..HEAD'];

  // 비밀값 없음: 꼬리말 검사는 돌고(빨강), 경고 한 줄이 남는다.
  const noSecret = { ...process.env };
  delete noSecret[BANNED_ENV_NAME];
  const footer = spawnSync(process.execPath, argv(dirtyFooter), { cwd: ROOT, encoding: 'utf8', env: noSecret });
  assert.equal(footer.status, 1, footer.stdout + footer.stderr);
  assert.match(footer.stdout, /COMMIT_HYGIENE=WARN/);
  assert.match(footer.stdout, /COMMIT_HYGIENE=FAIL/);

  const cleanRun = spawnSync(process.execPath, argv(clean), { cwd: ROOT, encoding: 'utf8', env: noSecret });
  assert.equal(cleanRun.status, 0, cleanRun.stdout + cleanRun.stderr);
  assert.match(cleanRun.stdout, /COMMIT_HYGIENE=PASS words=1 secret_list=no/);

  // 비밀값 있음: 목록 낱말로 빨강, 걸린 낱말은 로그에 되풀이하지 않는다.
  const withSecret = { ...process.env, [BANNED_ENV_NAME]: FAKE.join('\n') };
  const listed = spawnSync(process.execPath, argv(dirtyList), { cwd: ROOT, encoding: 'utf8', env: withSecret });
  assert.equal(listed.status, 1, listed.stdout + listed.stderr);
  assert.doesNotMatch(listed.stdout, /zzsecretone/, '목록 낱말을 로그에 그대로 찍지 않는다');
  assert.match(listed.stdout, /금지어/);

  const secretClean = spawnSync(process.execPath, argv(clean), { cwd: ROOT, encoding: 'utf8', env: withSecret });
  assert.equal(secretClean.status, 0, secretClean.stdout + secretClean.stderr);
  assert.match(secretClean.stdout, /COMMIT_HYGIENE=PASS words=3 secret_list=yes/);
});
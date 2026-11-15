import { ApiError } from './errors.js';

/**
 * 운영센터 '한눈에' 전체 숫자 (#655 2차).
 *
 * 1차는 이미 화면이 부르던 응답에서 숫자를 모았고, 2차는 서버 저장소가 직접 센다.
 * 세는 자리는 `repo.aggregate({ productId, since })` 하나다 — PostgreSQL 은 집계 SQL 한 번,
 * 시험용 메모리 저장소는 같은 계약을 자바스크립트로 흉내 낸다. 이 파일은 그 결과를
 * 화면이 읽기 좋은 모양으로 다듬고 '실제 사용자'·'AI 테스터'·'시험 계정'(#671)으로 나눈다.
 * 시험 계정은 운영센터 숫자에서만 갈라 보이고, 남에게 보이는 공개 화면에는 표시하지 않는다.
 *
 * 개인정보는 다루지 않는다: 저장소에서 돌아오는 것은 숫자뿐이고, 응답에도 숫자만 실린다
 * (이메일·이름·아이디·subject 를 담을 자리를 만들지 않는다).
 *
 * accounts 는 **로그인한 적 있는 계정**(lovetree_account_emails — 로그인 콜백이 쓰는 표)이다. 순간을
 * 하나도 담지 않은 계정도 로그인했으면 센다. accounts.new 는 그 표의 created_at(러브트리 **첫 로그인
 * 시각 = 가입일**)이 창(window) 안인 계정이다. created_at 은 upsert 에서 갱신하지 않으므로
 * (server/db/migrations/account-emails-created-at-261115.sql) 로그인을 반복해도 가입일이 밀리지 않는다.
 * 기존 행은 그 migration 이 가장 이른 흔적(문서 안 트리·순간 createdAt, 공유 행 시각, 고객 글 시각,
 * updated_at)으로 한 번 채웠다.
 */

export const STATS_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 집계 값이 없거나 이상해도 화면에는 안전한 음이 아닌 정수만 오른다. */
function count(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

/** 한 묶음(전체·실제 사용자·AI 테스터·시험 계정). 셋은 겹치지 않고 전체 = 셋의 합(#671). */
function split(rawReal, rawAi, rawTester) {
  const real = count(rawReal);
  const aiTester = count(rawAi);
  const tester = count(rawTester);
  return { total: real + aiTester + tester, real, aiTester, tester };
}

export function createAdminStatsService({ repo, productId, now = () => new Date(), windowDays = STATS_WINDOW_DAYS } = {}) {
  if (!productId || typeof productId !== 'string') throw new Error('제품 ID가 필요합니다.');
  if (!repo || typeof repo.aggregate !== 'function') throw new Error('숫자 저장소가 필요합니다.');
  const days = Number.isSafeInteger(windowDays) && windowDays > 0 ? windowDays : STATS_WINDOW_DAYS;

  return {
    windowDays: days,

    /**
     * 지금 숫자. 실패는 화면이 그 줄만 '불러오지 못했어요'로 두도록 503 으로 닫는다
     * (숫자를 지어내지 않는다).
     */
    async stats() {
      const current = now();
      const at = current instanceof Date ? current : new Date(current);
      if (!Number.isFinite(at.getTime())) throw new ApiError(503, 'admin_stats_unavailable', '숫자를 세지 못했어요.');
      const since = new Date(at.getTime() - days * DAY_MS).toISOString();
      let raw;
      try { raw = await repo.aggregate({ productId, since }); }
      catch { throw new ApiError(503, 'admin_stats_unavailable', '숫자를 세지 못했어요.'); }
      const row = raw && typeof raw === 'object' ? raw : {};
      return {
        checkedAt: at.toISOString(),
        window: { days, since },
        // new = 문서 안 첫 기록 시각(트리·순간 createdAt 의 최솟값)이 창 안인 계정.
        accounts: {
          ...split(row.accountsReal, row.accountsAi, row.accountsTester),
          new: split(row.accountsNewReal, row.accountsNewAi, row.accountsNewTester)
        },
        trees: {
          ...split(row.treesReal, row.treesAi, row.treesTester),
          public: split(row.publicReal, row.publicAi, row.publicTester),
          featured: split(row.featuredReal, row.featuredAi, row.featuredTester)
        },
        moments: {
          ...split(row.momentsReal, row.momentsAi, row.momentsTester),
          new: split(row.momentsNewReal, row.momentsNewAi, row.momentsNewTester)
        }
      };
    }
  };
}

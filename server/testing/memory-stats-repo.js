/**
 * 운영센터 전체 숫자의 메모리 모형 (#655 2차). 테스트 전용이다.
 *
 * PostgreSQL 판(`server/db/stats-postgres.js`)과 **같은 뜻**으로 세도록 맞춰 두었다 —
 * 계정·트리·순간·공개 트리·둘러보기 소개·AI 명예회원 가르기·최근 창(window) 판정이 모두 같은 규칙이다.
 * 계정은 **로그인한 적 있는 계정**(accountRepo 의 이메일 표 = lovetree_account_emails)을 센다 —
 * 순간을 하나도 담지 않은 계정도 들어간다. '새 계정'은 그 표의 createdAt(첫 로그인 시각 = 가입일)이
 * 창 안인 계정이다(PG 판과 같은 규칙).
 * 여기 통과가 PostgreSQL 검증은 아니다(실제 SQL 은 필수 검사 'PostgreSQL 저장·로그인 상태 검증'이 본다).
 *
 * 세는 근거는 이미 시험들이 쓰는 메모리 저장소 그대로다 — 저장 경로로 실제로 쌓은 문서·공유 행·
 * 고객 글·역할을 읽어 센다(숫자를 손으로 넣지 않는다).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const subjectOf = (row) => String(row?.subjectId ?? '');
const atOf = (value) => {
  const time = Date.parse(String(value ?? ''));
  return Number.isFinite(time) ? time : null;
};

export function createMemoryStatsRepo({
  workspaceRepo, shareRepo, accountRepo = null, roleStore = null, visibilityRepo = null, discoverRepo = null, communityRepo = null
} = {}) {
  if (!workspaceRepo || typeof workspaceRepo.documents !== 'function') throw new Error('workspaceRepo.documents 가 필요합니다.');
  if (!shareRepo || typeof shareRepo.allForProduct !== 'function') throw new Error('shareRepo.allForProduct 가 필요합니다.');

  return {
    async aggregate({ productId, since } = {}) {
      const sinceMs = atOf(since);
      const documents = await workspaceRepo.documents({ productId });
      const allShares = await shareRepo.allForProduct({ productId });
      const shares = allShares.filter((row) => row?.status === 'active');
      const roles = roleStore?.list ? await roleStore.list({ productId }) : [];
      const privateTrees = visibilityRepo?.privateTrees ? await visibilityRepo.privateTrees({ productId }) : [];
      const hiddenShares = communityRepo?.inspect ? new Set(communityRepo.inspect().hiddenShares ?? []) : new Set();

      const aiSubjects = new Set(roles.filter((row) => row?.role === 'ai_customer').map(subjectOf).filter(Boolean));
      // 시험 계정(role='tester', #671) — 레인 시험 계정을 '실제 사용자'와 갈라 센다. AI 와 겹치면 AI 로 센다.
      const testerSubjects = new Set(roles.filter((row) => row?.role === 'tester').map(subjectOf).filter(Boolean));
      const where = (row) => (aiSubjects.has(subjectOf(row)) ? 'Ai' : (testerSubjects.has(subjectOf(row)) ? 'Tester' : 'Real'));
      const privateKeys = new Set(privateTrees.map((row) => `${subjectOf(row)}\u0000${row.treeId}`));

      const totals = {
        accountsReal: 0, accountsAi: 0, accountsTester: 0, accountsNewReal: 0, accountsNewAi: 0, accountsNewTester: 0,
        treesReal: 0, treesAi: 0, treesTester: 0,
        momentsReal: 0, momentsAi: 0, momentsTester: 0,
        momentsNewReal: 0, momentsNewAi: 0, momentsNewTester: 0,
        publicReal: 0, publicAi: 0, publicTester: 0,
        featuredReal: 0, featuredAi: 0, featuredTester: 0
      };
      for (const document of documents) {
        const trees = Array.isArray(document?.doc?.trees) ? document.doc.trees : [];
        let moments = 0;
        let momentsSince = 0;
        for (const tree of trees) {
          const list = Array.isArray(tree?.moments) ? tree.moments : [];
          moments += list.length;
          for (const moment of list) {
            const created = atOf(moment?.createdAt);
            if (created !== null && sinceMs !== null && created >= sinceMs) momentsSince += 1;
          }
        }
        totals['trees' + where(document)] += trees.length;
        totals['moments' + where(document)] += moments;
        totals['momentsNew' + where(document)] += momentsSince;
      }

      // 계정 = 로그인한 적 있는 계정(이메일 표). 새 계정 = 그 표의 첫 로그인 시각이 창 안.
      const accounts = accountRepo?.accounts ? await accountRepo.accounts({ productId }) : [];
      for (const row of accounts) {
        const group = where(row);
        const created = atOf(row?.createdAt);
        totals['accounts' + group] += 1;
        if (created !== null && sinceMs !== null && created >= sinceMs) totals['accountsNew' + group] += 1;
      }

      // 공개 트리 = 활성 공유 행이 있고 비공개가 아닌 트리(중복 제거). 둘러보기 소개는 같은 조건에
      // 순간 3개 이상 + 소개 켬(2026-11-16 대표 결정 — 기본 꺼짐) + 숨김 없음 — discovery SQL 과 같은 뜻.
      const publicTrees = new Map();
      const featuredTrees = new Map();
      for (const share of shares) {
        const key = `${subjectOf(share)}\u0000${share.treeId}`;
        if (privateKeys.has(key)) continue;
        publicTrees.set(key, where(share));
        const discoverOn = discoverRepo ? await discoverRepo.isOn(productId, subjectOf(share), share.treeId) : true;
        // 숨김은 공유 행 하나가 아니라 트리 전체에 걸린다 — 같은 트리의 다른 행이 숨겨졌으면 그 트리도 빠진다(SQL 과 같은 규칙).
        const hidden = allShares.some((other) => other.treeId === share.treeId && subjectOf(other) === subjectOf(share) && hiddenShares.has(`${productId}\u0000${other.shareId}`));
        if (Number(share.momentCount ?? 0) >= 3 && discoverOn && !hidden) {
          featuredTrees.set(key, where(share));
        }
      }
      const countTrees = (map) => {
        const out = { Real: 0, Ai: 0, Tester: 0 };
        for (const value of map.values()) out[value] += 1;
        return out;
      };
      const publicCount = countTrees(publicTrees);
      const featuredCount = countTrees(featuredTrees);

      return {
        ...totals,
        publicReal: publicCount.Real, publicAi: publicCount.Ai, publicTester: publicCount.Tester,
        featuredReal: featuredCount.Real, featuredAi: featuredCount.Ai, featuredTester: featuredCount.Tester
      };
    }
  };
}
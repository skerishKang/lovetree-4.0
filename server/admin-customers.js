import { logServerError } from './error-log.js';
import { ApiError } from './errors.js';
import { parsePrincipal } from './principal.js';
import { ROLE_ADMIN } from './admin-roles.js';

/**
 * 운영센터 고객 정보(261116 대표 결정: 운영진은 고객 정보를 다 본다).
 *
 * - 읽기만 한다. 고객 순간·기록을 고치거나 지우는 경로는 만들지 않는다.
 * - 이메일·표시 이름은 전문으로, 가입일·마지막 로그인·마지막 활동도 함께 내려 준다.
 *   만 14세 확인 시각은 공용 로그인이 아직 값을 주지 않아 자리만 둔다(null → 화면은 '—').
 * - subject 원문은 응답에 실지 않는다 — maskSubjectId 로 가린 id만 내려 보낸다.
 *   (주소 #customer/<subject> 는 화면 글자가 아니라 이동·새로고침을 위한 내부 경로다.)
 * - 자세히 판을 열 때마다 열람 기록 한 줄(누가·언제·어느 고객)을 남긴다 — 서버가 기록하므로
 *   화면이 빼놓을 수 없다. 기록 표는 90일 자동 삭제 대상이다.
 * - 올린 사진은 관리자 인증을 통과한 요청만 내려받는다(GET /api/admin/customers/<subject>/media/<name>).
 */

// subject 꼴은 로그인 계정 저장소(account-email-store)와 같은 넓은 꼴 — admin-roles 의 좁은 꼴만 받으면 로그인 계정 중 일부를 못 연다.
const SUBJECT = /^sub_[A-Za-z0-9_-]{1,128}$/;
const NO_STORE = { 'cache-control': 'no-store, max-age=0', pragma: 'no-cache', 'x-content-type-options': 'nosniff' };
const ROLE_LABEL = { ai_customer: 'AI 명예회원', tester: '시험 계정' };

/** subject 원문을 가린 id로 — 앞의 sub_ 와 마지막 넉 자만 남긴다(sub_…cdef). */
export function maskSubjectId(value) {
  const raw = String(value ?? '');
  return SUBJECT.test(raw) ? `sub_…${raw.slice(-4)}` : '';
}

/** 순간을 운영센터 자세히 판에 내려 보내는 모양 — 제목·날짜·감정·꼬리표·영상 주소·메모를 전부 담는다. */
export function momentRow(moment) {
  if (!moment || typeof moment !== 'object') return null;
  const url = typeof moment.url === 'string' ? moment.url : '';
  return {
    id: String(moment.id ?? ''),
    title: String(moment.title ?? ''),
    date: String(moment.date ?? ''),
    createdAt: String(moment.createdAt ?? ''),
    emotion: String(moment.emotion ?? ''),
    keywords: Array.isArray(moment.keywords) ? moment.keywords.map((k) => String(k)) : [],
    url,
    note: String(moment.note ?? ''),
    uploaded: url.startsWith('/api/media/')
  };
}

/** 트리 공개 상표 — 나만 / 링크 공유 / 둘러보기 소개(공개 상표가 없으면 기본인 나만이다). */
export function treeVisibility(markers, treeId) {
  const rows = (Array.isArray(markers) ? markers : []).filter((m) => m?.treeId === treeId);
  if (rows.some((m) => m.kind === 'private' && m.value === 'private')) return '나만';
  const shared = rows.some((m) => m.kind === 'share' && m.value === 'active');
  if (shared && rows.some((m) => m.kind === 'discover' && m.value === 'true')) return '둘러보기 소개';
  if (shared) return '링크 공유';
  return '나만';
}

export function treeRow(tree, markers) {
  if (!tree || typeof tree !== 'object' || !Array.isArray(tree.moments)) return null;
  return {
    id: String(tree.id ?? ''),
    title: String(tree.title ?? tree.subject ?? ''),
    visibility: treeVisibility(markers, String(tree.id ?? '')),
    moments: tree.moments.map((m) => momentRow(m)).filter(Boolean)
  };
}

export function accountRow(entry) {
  return {
    // 자세히 판을 여는 내부 식별자. 화면 글자에는 쓰지 않는다(보이는 것은 가린 id 하나뿐이다).
    subjectId: String(entry?.subjectId ?? ''),
    subjectMasked: maskSubjectId(entry?.subjectId),
    email: String(entry?.email ?? ''),
    displayName: String(entry?.displayName ?? ''),
    role: entry?.role ?? null,
    roleLabel: ROLE_LABEL[entry?.role] ?? '실제 고객',
    joinedAt: entry?.joinedAt ?? null,
    lastLoginAt: entry?.lastLoginAt ?? null,
    lastActivityAt: entry?.lastActivityAt ?? null,
    treeCount: Number(entry?.treeCount) || 0,
    momentCount: Number(entry?.momentCount) || 0
  };
}

async function asAdmin(admin, principal) {
  const role = await admin.roleFor(principal);
  if (role !== ROLE_ADMIN) throw new ApiError(403, 'admin_forbidden', '관리자만 볼 수 있어요.');
  return principal;
}

export function createAdminCustomersService({ repo, feedbackRepo, productId, admin, mediaStore = null }) {
  if (!repo || typeof repo.list !== 'function') throw new Error('admin customers repo가 필요합니다');
  if (!feedbackRepo || typeof feedbackRepo.listBySubject !== 'function') throw new Error('feedback repo가 필요합니다');
  if (!admin || typeof admin.roleFor !== 'function') throw new Error('admin roles가 필요합니다');
  if (typeof productId !== 'string' || !productId) throw new Error('productId가 필요합니다');

  return {
    async list(principal) {
      await asAdmin(admin, principal);
      const rows = await repo.list({ productId });
      return rows.map(accountRow);
    },

    async recentViews(principal, { limit } = {}) {
      await asAdmin(admin, principal);
      const rows = await repo.recentViews({ productId, limit });
      return rows.map((row) => ({
        id: row.id,
        adminMasked: maskSubjectId(row.adminSubjectId),
        customerMasked: maskSubjectId(row.customerSubjectId),
        customerEmail: row.email,
        customerName: row.displayName,
        viewedAt: row.viewedAt
      }));
    },

    /** 자세히 판. 여는 것 자체가 열람이므로 여기서 한 줄 기록한다 — 화면이 빼놓을 수 없다.
     *  기록이 실패해도 판은 열어 준다(열람 자체를 막지 않는다. 기록은 운영 문제로 따라잡는다). */
    async detail(principal, subjectId) {
      await asAdmin(admin, principal);
      if (typeof subjectId !== 'string' || !SUBJECT.test(subjectId)) throw new ApiError(400, 'invalid_subject', '고객 계정 식별자가 올바르지 않아요.');
      const entry = await repo.detail({ productId, subjectId });
      if (!entry) throw new ApiError(404, 'customer_not_found', '그 고객 계정을 찾을 수 없어요.');
      const doc = entry.doc && typeof entry.doc === 'object' ? entry.doc : {};
      const trees = (Array.isArray(doc.trees) ? doc.trees : [])
        .map((tree) => treeRow(tree, entry.markers))
        .filter(Boolean);
      const feedback = (await feedbackRepo.listBySubject({ productId, subjectId })).map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title || '',
        displayTitle: row.title || String(row.body || '').split('\n').map((line) => line.trim()).find(Boolean)?.slice(0, 120) || '',
        body: row.body,
        status: row.status,
        score: row.score ?? null,
        journalDate: row.journalDate ?? null,
        createdAt: row.createdAt,
        replyCount: Number(row.replyCount) || 0
      }));
      await repo.recordView({ productId, customerSubjectId: subjectId, adminSubjectId: principal.subjectId }).catch(() => {});
      const media = mediaStore && typeof mediaStore.list === 'function'
        ? await mediaStore.list({ productId, subjectId }).catch(() => ({ items: [] }))
        : { items: [] };
      return {
        ...accountRow(entry),
        ageVerifiedAt: null, // 공용 로그인이 아직 나이 확인 시각을 주지 않는다 — 자리는 둔다(화면은 '—').
        trees,
        media: (media.items ?? []).map((item) => ({
          name: item.name,
          mime: item.mime,
          size: item.size,
          createdAt: item.createdAt,
          path: `/api/admin/customers/${encodeURIComponent(subjectId)}/media/${item.name}`
        })),
        feedback
      };
    },

    /** 올린 사진 내려받기 — 관리자 인증으로만 통과한다. 고객 본인 경로(/api/media)와는 다른 문이다. */
    async media(principal, subjectId, name) {
      await asAdmin(admin, principal);
      if (typeof subjectId !== 'string' || !SUBJECT.test(subjectId)) throw new ApiError(400, 'invalid_subject', '고객 계정 식별자가 올바르지 않아요.');
      if (!mediaStore || typeof mediaStore.get !== 'function') throw new ApiError(503, 'media_unavailable', '파일 보관을 아직 켜지 않았어요.');
      return mediaStore.get({ productId, subjectId }, name);
    }
  };
}

export function createAdminCustomersHandler({ authenticate, service, productId }) {
  if (typeof authenticate !== 'function') throw new Error('authenticate가 필요합니다');
  if (!service) throw new Error('service가 필요합니다');
  if (typeof productId !== 'string' || !productId) throw new Error('productId가 필요합니다');

  async function handle(request) {
    const { method = 'GET', path = '', query } = request ?? {};
    if (!path.startsWith('/api/admin/customers')) throw new ApiError(404, 'not_found', '요청을 찾을 수 없어요.');
    if (method !== 'GET') throw new ApiError(405, 'method_not_allowed', '이 요청은 지원하지 않아요.');
    let verified;
    try { verified = await authenticate(request ?? {}); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, 'auth_unavailable', '로그인 연결에 문제를 만났어요.');
    }
    const principal = parsePrincipal(verified, productId);

    if (path === '/api/admin/customers') {
      return { status: 200, body: { ok: true, customers: await service.list(principal) }, headers: NO_STORE };
    }
    if (path === '/api/admin/customers/views') {
      return { status: 200, body: { ok: true, views: await service.recentViews(principal, { limit: Number(query?.get('limit')) || 20 }) }, headers: NO_STORE };
    }
    const item = path.match(/^\/api\/admin\/customers\/(sub_[A-Za-z0-9_-]{1,128})$/);
    if (item) {
      return { status: 200, body: { ok: true, customer: await service.detail(principal, item[1]) }, headers: NO_STORE };
    }
    const asset = path.match(/^\/api\/admin\/customers\/(sub_[A-Za-z0-9_-]{1,128})\/media\/([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(?:png|jpg|gif|webp|mp4|webm))$/);
    if (asset) {
      const file = await service.media(principal, asset[1], asset[2]);
      return {
        status: 200,
        headers: { 'content-type': file.mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
        binary: file.bytes
      };
    }
    throw new ApiError(404, 'not_found', '요청을 찾을 수 없어요.');
  }

  return async (request) => {
    try { return await handle(request); }
    catch (error) {
      if (error instanceof ApiError) return { status: error.status, body: { error: { code: error.code, message: error.message, ...(error.details || {}) } }, headers: NO_STORE };
      logServerError(error, 'lovetree-admin-customers');
      return { status: 500, body: { error: { code: 'internal_error', message: '서버에서 처리하지 못했어요.' } }, headers: NO_STORE };
    }
  };
}

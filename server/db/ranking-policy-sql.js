import { ROLE_AI_CUSTOMER, ROLE_TESTER } from '../admin-roles.js';

export function hasRealCustomersFromEnv(env = {}) {
  const value = String(env.LOVETREE_HAS_REAL_CUSTOMERS ?? '').trim().toLowerCase();
  return value === '1' || value === 'true';
}

// 공개 무대 소유자에게는 기본 정책을, 인기 트리·무대 소유자에게는 운영 플래그를 적용한다.
export function rankingOwnerSql(hasRealCustomers = false) {
  const visible = `owner_role.role IS DISTINCT FROM '${ROLE_TESTER}'`;
  return hasRealCustomers ? `(${visible} AND owner_role.role IS DISTINCT FROM '${ROLE_AI_CUSTOMER}')` : visible;
}

// 최초 표와 개인 담기 상태는 보존한 채, 같은 제품의 현재 역할로 주간 득표만 거른다.
export function countedVoterSql(hasRealCustomers, voterAlias = 'v') {
  if (!hasRealCustomers) return 'TRUE';
  if (!/^[a-z_][a-z0-9_]*$/i.test(voterAlias)) throw new TypeError('Invalid vote table alias');
  return `NOT EXISTS (
    SELECT 1 FROM lovetree_product_roles voter_role
    WHERE voter_role.product_id = ${voterAlias}.product_id
      AND voter_role.subject_id = ${voterAlias}.subject_id AND voter_role.role = '${ROLE_AI_CUSTOMER}'
  )`;
}

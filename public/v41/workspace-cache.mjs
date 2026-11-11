// #400 2번: 마지막으로 받은 내 기록을 계정별로 localStorage에 저장해 다음 접속에 서버 응답 전 먼저 그린다.
// 서버본이 항상 이긴다(읽기는 시작 화면용일 뿐). 저장본을 보는 동안 편집은 셸의 checking 단계가 잠근다.
// 로그아웃하면 지운다(공용 컴퓨터). 1MB가 넘으면 저장하지 않는다. 읽기·쓰기는 전부 try/catch.
import { validateState } from './domain.mjs';

const KEY_PREFIX = 'lovetree.v41.workspace-cache:';
const LAST_KEY = 'lovetree.v41.workspace-cache:last';
const MAX_BYTES = 1024 * 1024;
const subjectValid = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);

export function readCachedWorkspace(storage) {
  if (!storage) return null;
  let subject = null;
  try {
    subject = storage.getItem(LAST_KEY);
    if (!subjectValid(subject)) return null;
    const raw = storage.getItem(KEY_PREFIX + subject);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry?.version !== 1 || entry.subject !== subject) throw new Error('invalid_cache_entry');
    return { subject, state: validateState(entry.state) };
  } catch {
    // 깨진 저장본은 남기지 않는다(다음 접속에 다시 실패하지 않게).
    try { if (subjectValid(subject)) storage.removeItem(KEY_PREFIX + subject); } catch { /* 저장소 접근 불가 */ }
    return null;
  }
}

export function writeCachedWorkspace(storage, subject, state) {
  if (!storage || !subjectValid(subject)) return false;
  const json = JSON.stringify({ version: 1, subject, state });
  try {
    if (new TextEncoder().encode(json).length > MAX_BYTES) {
      // 너무 크면 저장하지 않는다. 옛 저장본이 남으면 계정 표시가 어긋나므로 함께 지운다.
      storage.removeItem(KEY_PREFIX + subject);
      storage.setItem(LAST_KEY, subject);
      return false;
    }
    storage.setItem(KEY_PREFIX + subject, json);
    storage.setItem(LAST_KEY, subject);
    return true;
  } catch {
    try { storage.removeItem(KEY_PREFIX + subject); } catch { /* 저장소 접근 불가 */ }
    return false;
  }
}

export function clearCachedWorkspace(storage, subject = null) {
  if (!storage) return;
  try {
    const target = subjectValid(subject) ? subject : storage.getItem(LAST_KEY);
    if (!subjectValid(target)) return;
    storage.removeItem(KEY_PREFIX + target);
    if (storage.getItem(LAST_KEY) === target) storage.removeItem(LAST_KEY);
  } catch { /* 저장소 접근 불가 */ }
}
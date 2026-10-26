import { EMPTY_STATE, validateState } from './domain.js';

export const STORAGE_KEY = 'lovetree.v4.workspace.v1';
export const RECOVERY_KEY = 'lovetree.v4.workspace.recovery.v1';
export function loadState(storage) {
  let raw;
  try { raw = storage.getItem(STORAGE_KEY); }
  catch { return { state: EMPTY_STATE(), error: '브라우저 저장소에 접근할 수 없어요. 기록을 파일로 내보내 보관해 주세요.', blocked: true }; }
  if (!raw) return { state: EMPTY_STATE(), error: null, blocked: false };
  try { return { state: validateState(JSON.parse(raw)), error: null, blocked: false }; }
  catch {
    // Never overwrite an unreadable store until a recovery copy exists.
    try {
      if (storage.getItem(RECOVERY_KEY) && storage.getItem(RECOVERY_KEY) !== raw) throw new Error('Existing recovery must be retained');
      storage.setItem(RECOVERY_KEY, raw);
      return { state: EMPTY_STATE(), error: '기존 기록을 읽지 못해 복구용 사본을 보관했어요. 복구 파일을 내보내 확인해 주세요.', blocked: false, recovery: true };
    } catch { return { state: EMPTY_STATE(), error: '기존 기록을 안전하게 복사할 수 없어 저장을 중지했어요. 복구 파일을 먼저 내보내 주세요.', blocked: true, recovery: true }; }
  }
}
export function saveState(storage, state, expectedRaw) {
  const latest = storage.getItem(STORAGE_KEY);
  if (expectedRaw !== undefined && latest !== expectedRaw) throw new Error('다른 탭에서 기록이 바뀌었어요. 입력을 복사한 뒤 새로고침해 주세요.');
  const clean = validateState(state);
  const serialized = JSON.stringify(clean);
  try { storage.setItem(STORAGE_KEY, serialized); }
  catch { throw new Error('브라우저에 저장할 공간이 부족해요. 기존 기록을 파일로 백업한 뒤 다시 시도해 주세요.'); }
  return serialized;
}

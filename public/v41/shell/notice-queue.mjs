// #1103: 첫 화면의 세 안내(첫 트리 안내 판 → 새 소식 띠 → 기록 불러옴 토스트)가
// 한 줄을 차례로 지나가게 한다. 동시에 보이는 안내는 항상 1개 이하.
// 앞의 것이 떠 있는 동안 뒤의 것은 기다리고, ③ 정보 안내는 maxWait가 지나면 건너뛴다.
export const NOTICE_PRIORITY = { tips: 1, updates: 2, toast: 3 };

export function createNoticeQueue({ now = () => Date.now() } = {}) {
  let current = null;
  const pending = new Map();

  function pump() {
    if (current) return;
    const at = now();
    const rows = [...pending.entries()].sort((a, b) =>
      (NOTICE_PRIORITY[a[0]] ?? 9) - (NOTICE_PRIORITY[b[0]] ?? 9) || a[1].queuedAt - b[1].queuedAt);
    while (rows.length) {
      const [id, notice] = rows.shift();
      pending.delete(id);
      if (notice.maxWait && at - notice.queuedAt > notice.maxWait) continue;
      current = { id, ...notice };
      current.show();
      return;
    }
  }

  return {
    request(id, notice) {
      if (current?.id === id || pending.has(id)) return false;
      const entry = { queuedAt: now(), ...notice };
      // 우선순위가 앞서는 안내가 나중에 와도 먼저 뜬다 — 떠 있던 낮은 안내는 다시 줄에 선다.
      if (current && (NOTICE_PRIORITY[id] ?? 9) < (NOTICE_PRIORITY[current.id] ?? 9)) {
        const held = current;
        current = null;
        held.hide();
        pending.set(held.id, held);
        pending.set(id, entry);
        pump();
        return true;
      }
      pending.set(id, entry);
      pump();
      return true;
    },
    release(id) {
      if (current?.id !== id) { pending.delete(id); return false; }
      const held = current;
      current = null;
      held.hide();
      pump();
      return true;
    },
    currentId: () => current?.id ?? null,
    pendingIds: () => [...pending.keys()],
    visibleCount: () => (current ? 1 : 0)
  };
}

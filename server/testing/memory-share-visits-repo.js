export function createMemoryShareVisitsRepo() {
  const counts = new Map(), recent = new Map();
  const key = ({ productId, shareId }) => JSON.stringify([productId, shareId]);
  return {
    async record(scope) {
      const k = key(scope), now = scope.now.getTime();
      const windowMs = scope.expiresAt.getTime() - now;
      const hashes = recent.get(k) || new Map();
      if (scope.hashes.some(hash => {
        const expiresAt = hashes.get(hash);
        return expiresAt !== undefined && Math.abs(expiresAt - windowMs - now) < windowMs;
      })) return counts.get(k) || 0;
      hashes.set(scope.hashes[0], Math.max(hashes.get(scope.hashes[0]) || 0, scope.expiresAt.getTime()));
      recent.set(k, hashes);
      const count = (counts.get(k) || 0) + 1;
      counts.set(k, count);
      return count;
    },
    async count(scope) { return counts.get(key(scope)) || 0; },
    async prune(now = new Date()) {
      let removed = 0;
      for (const [k, hashes] of recent) {
        for (const [hash, expires] of hashes) if (expires <= now.getTime()) { hashes.delete(hash); removed++; }
        if (!hashes.size) recent.delete(k);
      }
      return removed;
    }
  };
}

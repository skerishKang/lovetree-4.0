// systemd EnvironmentFile 과 같은 모양의 .env 를 키·값 객체로 옮긴다(값은 절대 출력하지 않는다).
// #1073 B-18: AI 고객 내보내기 도구를 정리하며 export-ai-customer-db.mjs에서 옮겨 왔다 —
// 남는 운영 도구(admin-role·ops-reply·relink-opinion-author)가 같은 .env 읽기를 계속 쓴다.
export function parseEnvFile(text) {
  const out = {};
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

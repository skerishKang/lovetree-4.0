# LoveTree 4.0 access and audit log retention

## Classification

| Surface | Examples | Rule |
| --- | --- | --- |
| Database request metadata | `lovetree_request_claims` idempotency key/hash/result metadata | Delete at 90 days using a bounded cleanup batch. |
| Database audit logs | `lovetree_product_role_audit`, `lovetree_community_moderation_audit` | Delete at 90 days using the same bounded cleanup. |
| API application logs | `server/index.js`, `server/http.js`, share/community handlers write startup warnings and failures to stdout/stderr; the systemd unit sends both to journald. Current messages include route/method for failures, not request bodies or credentials. There is no successful-request access log stream. | Example host-wide journald retention is 90 days; review before applying. No application log files or logrotate target exist. |
| Pages Functions/platform logs | `functions/` proxies requests and currently emits no application log calls. Cloudflare Pages/Workers observability is controlled in the Cloudflare dashboard/account. | No code setting is available here to retain these logs for 90 days. Dashboard/log export and destination retention are separate operator settings. |
| Preserve | `lovetree_workspaces`, `lovetree_shares`, `lovetree_community_favorites`, `lovetree_community_reactions`, `lovetree_community_comments`, `lovetree_community_reports`, `lovetree_community_blocks`, `lovetree_community_hidden_shares`, `lovetree_product_roles`, `lovetree_account_deletions`, and any payment records | Excluded from the 90-day cleanup. Payment storage is not implemented in this repository; a future payment table must receive its own policy. |
| Separate expiry | `lovetree_login_states` and `lovetree_account_delete_rpc_requests` | Keep their existing short expiry behavior; they are not part of access-log retention. |

`lovetree_request_claims` is request-idempotency metadata. Removing an old claim ends replay lookup for that client key after the retention window; the normal workspace revision check still guards stale writes. Account deletion may remove a user's request claims earlier through its existing deletion path, while its hashed deletion record is preserved.

## Cleanup and schedule

`server/db/access-log-retention-postgres.js` deletes rows at or before the UTC cutoff (`now - 90 days`) from the three allow-listed operational tables. Each statement uses an ordered `FOR UPDATE SKIP LOCKED` batch. Defaults cap a run at 500 rows × 4 batches per table. The systemd timer (`deploy/host-com2/lovetree-api/lovetree-log-retention.timer`) fires daily at `03:17:00` with `RandomizedDelaySec=15m` and `Persistent=true`, adding a randomized delay and persistent catch-up. The result log contains only cutoff time and deleted row counts.

The deployment installer places the oneshot and timer units after an explicitly requested install, and does not start or enable them. The timer must be enabled by a separately authorized server operator. `journald-retention.conf.example` is host-wide and is not installed by the Lovetree installer. Nothing in this change has been applied to a server or Cloudflare account.

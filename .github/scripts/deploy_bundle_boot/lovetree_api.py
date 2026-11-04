"""Bundle-only boot test for the lovetree-api deploy unit (#6855 item 3).

Mirrors ai-revenue-lab's .github/scripts/deploy_bundle_boot/: this runs only on
a disposable CI runner, never deploys, never contacts Cloudflare, and never
reads a real credential — every secret-looking value is generated inside the
job and passed in through arguments/env of this run. deploy/host-com2/
lovetree-api/install.sh and autodeploy.sh keep their exact bytes; this helper
only starts the installed tree the way the systemd unit would (same service
user, same loopback listen) and checks the health read autodeploy uses.

Positive control: install.sh --apply from a umask-077 clone replica, then the
service user must reach GET /api/community/shares -> 200 (#170 regression).
Rollback control: the autodeploy rollback sequence (backup tar -> extract ->
npm ci -> permission normalization) must end healthy again.
Negative controls: a missing module and the original root-0600/0700 tree must
both refuse to boot.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import pwd
import subprocess
import sys
import time
import urllib.error
import urllib.request

HEALTH_PATH = "/api/community/shares"
STATE_KEYS = ("pid", "port")
SERVICE_USER = "lovetree-api"


def run(cmd, *, check=True, capture=False, cwd=None):
    printable = " ".join(str(part) for part in cmd)
    print("+ " + printable, flush=True)
    done = subprocess.run(
        [str(part) for part in cmd], cwd=cwd, text=True,
        capture_output=capture, check=False,
    )
    if check and done.returncode != 0:
        if capture:
            sys.stdout.write(done.stdout or "")
            sys.stderr.write(done.stderr or "")
        raise SystemExit(f"COMMAND=FAIL exit={done.returncode} cmd={printable}")
    return done


def redact(text: str, secrets: list[str]) -> str:
    for value in secrets:
        if value:
            text = text.replace(value, "[redacted]")
    return text


def service_env(args) -> dict[str, str]:
    return {
        "NODE_ENV": "production",
        "LOVETREE_HOST": "127.0.0.1",
        "PORT": str(args.port),
        "LOVETREE_PRODUCT_ID": "lovetree-bundle-boot",
        "LOVETREE_DATABASE_URL": args.database_url,
        "LOVETREE_MAX_BODY_BYTES": "1048576",
        "LOVETREE_SESSION_SOURCE": "cookie",
        "LOVETREE_SESSION_COOKIE": "lovetree_session",
        "LOVETREE_SESSION_SECRET": args.session_secret,
        "LOVETREE_SESSION_MAX_AGE_SECONDS": "3600",
        "LOVETREE_COOKIE_SECURE": "false",
        "LOVETREE_STATE_STORE": "memory",
        "LOVETREE_MEDIA_DIR": args.media_dir,
        "LOVETREE_ACCOUNT_DELETE_RPC_SECRET": args.account_delete_secret,
        "LOVETREE_IDENTITY_RPC_URL": args.identity_rpc_url,
        "LOVETREE_IDENTITY_RPC_SECRET": args.identity_rpc_secret,
    }


def secrets_of(args) -> list[str]:
    env = service_env(args)
    return [args.database_url, env["LOVETREE_SESSION_SECRET"],
            env["LOVETREE_ACCOUNT_DELETE_RPC_SECRET"], env["LOVETREE_IDENTITY_RPC_SECRET"]]


def drop_to_service_user():
    record = pwd.getpwnam(SERVICE_USER)
    os.setgid(record.pw_gid)
    os.initgroups(SERVICE_USER, record.pw_gid)
    os.setuid(record.pw_uid)


def start_node(args, *, capture_log: pathlib.Path | None):
    app = pathlib.Path(args.app)
    log_handle = open(capture_log, "wb") if capture_log else subprocess.DEVNULL
    return subprocess.Popen(
        [args.node_bin, "server/index.js"], cwd=str(app),
        env=service_env(args), stdout=log_handle, stderr=log_handle,
        preexec_fn=drop_to_service_user,
    )


def health_once(port: int) -> int | None:
    request = urllib.request.Request(f"http://127.0.0.1:{port}{HEALTH_PATH}")
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except Exception:
        return None


def dump_log_tail(path: pathlib.Path, secrets: list[str], lines: int = 15) -> None:
    try:
        tail = path.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:]
    except OSError:
        return
    for line in tail:
        print("  node| " + redact(line, secrets), flush=True)


def cmd_check_config(args) -> None:
    """The unit's ExecCondition: LOVETREE_CONFIG_READY=1 or the boot fails."""
    app = pathlib.Path(args.app)
    log_path = pathlib.Path(args.log)
    done = subprocess.run(
        [args.node_bin, "check_config.mjs"], cwd=str(app),
        env=service_env(args), text=True, capture_output=True,
        preexec_fn=drop_to_service_user,
    )
    output = redact((done.stdout or "") + (done.stderr or ""), secrets_of(args))
    sys.stdout.write(output)
    if done.returncode != 0 or "LOVETREE_CONFIG_READY=1" not in output:
        raise SystemExit("CHECK_CONFIG=FAIL (the unit would refuse to start)")


def cmd_boot(args) -> None:
    app = pathlib.Path(args.app)
    log_path = pathlib.Path(args.log)
    process = start_node(args, capture_log=log_path)
    deadline = time.monotonic() + args.timeout_seconds
    port = args.port
    while time.monotonic() < deadline:
        if process.poll() is not None and process.returncode != 0:
            dump_log_tail(log_path, secrets_of(args))
            raise SystemExit(f"BOOT=FAIL reason=node_exited code={process.returncode}")
        code = health_once(port)
        if code == 200:
            pathlib.Path(args.state).write_text(json.dumps({"pid": process.pid, "port": port}) + "\n")
            print(f"BOOT=OK pid={process.pid} port={port} health=200")
            return
        time.sleep(1)
    process.kill()
    dump_log_tail(log_path, secrets_of(args))
    raise SystemExit(f"BOOT=FAIL reason=health_never_200 last_code={code}")


def cmd_expect_fail(args) -> None:
    """Negative control: the boot MUST NOT become healthy."""
    app = pathlib.Path(args.app)
    log_path = pathlib.Path(args.log)
    process = start_node(args, capture_log=log_path)
    deadline = time.monotonic() + args.timeout_seconds
    while time.monotonic() < deadline:
        if process.poll() is not None and process.returncode != 0:
            print(f"NEGATIVE_CONTROL=OK reason=node_exited code={process.returncode}")
            dump_log_tail(log_path, secrets_of(args))
            return
        if health_once(args.port) == 200:
            process.kill()
            raise SystemExit("NEGATIVE_CONTROL=FAIL reason=became_healthy")
        time.sleep(1)
    process.kill()
    print("NEGATIVE_CONTROL=OK reason=health_never_200")
    dump_log_tail(log_path, secrets_of(args))


def cmd_stop(args) -> None:
    state = pathlib.Path(args.state)
    try:
        recorded = json.loads(state.read_text())
    except (OSError, ValueError):
        return
    try:
        os.kill(int(recorded["pid"]), 15)
    except (ProcessLookupError, PermissionError):
        pass
    for _ in range(20):
        try:
            os.kill(int(recorded["pid"]), 0)
        except (ProcessLookupError, PermissionError):
            break
        time.sleep(0.2)


def main() -> None:
    # The workflow passes the shared options after the subcommand, so they
    # belong to every subparser (argparse parents pattern).
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--app", default="/opt/padiem/lovetree-api")
    common.add_argument("--node-bin", default="/usr/local/bin/node")
    common.add_argument("--port", type=int, default=8790)
    common.add_argument("--database-url", default="")
    common.add_argument("--media-dir", default="/tmp/lovetree-boot-media")
    common.add_argument("--session-secret", default="")
    common.add_argument("--account-delete-secret", default="")
    common.add_argument("--identity-rpc-url", default="https://identity.bundle-boot.invalid")
    common.add_argument("--identity-rpc-secret", default="")
    common.add_argument("--state", default="/tmp/lovetree-boot-state.json")
    common.add_argument("--log", default="/tmp/lovetree-boot-node.log")
    common.add_argument("--timeout-seconds", type=int, default=40)
    parser = argparse.ArgumentParser(description=__doc__, parents=[common])
    command = parser.add_subparsers(dest="command", required=True)
    for name in ("check-config", "boot", "expect-fail", "stop"):
        command.add_parser(name, parents=[common])
    args = parser.parse_args()
    if args.command == "stop":
        cmd_stop(args)
        return
    if os.geteuid() != 0:
        raise SystemExit("BOOT_TEST=FAIL reason=root_required")
    pathlib.Path(args.media_dir).mkdir(parents=True, exist_ok=True)
    run(["chown", f"{SERVICE_USER}:{SERVICE_USER}", args.media_dir])
    {"check-config": cmd_check_config, "boot": cmd_boot, "expect-fail": cmd_expect_fail}[args.command](args)


if __name__ == "__main__":
    main()

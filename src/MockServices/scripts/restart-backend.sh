#!/usr/bin/env bash
# (Re)starts the SF backend for the mock system — the one safe way to do it.
#
# Why this exists: the backend often runs as the apphost binary
# ("…/bin/Debug/net10.0/SIL.XForge.Scripture --start-ng-serve listen"), so killing it by a
# name pattern like 'dotnet' or '.dll' can MISS it. The old process then keeps serving port
# 5000 with stale code while every newly started backend crashes on a port conflict (which
# surfaces as an unrelated-looking "Attempt to connect to Node timed out" startup error).
# This script kills whatever actually LISTENS on the port, starts a fresh backend, and then
# verifies the process serving the port is the one it just started.
#
# Usage: scripts/restart-backend.sh          (logs to <repo>/.sf-local-data/backend.log)
set -uo pipefail

port=5000
package_root="$(cd "$(dirname "$0")/.." && pwd)"
repo_root="$(cd "$package_root/../.." && pwd)"
log_dir="$repo_root/.sf-local-data"
log="$log_dir/backend.log"
mkdir -p "$log_dir"

command -v dotnet >/dev/null || export PATH="$HOME/.dotnet:$PATH"
command -v dotnet >/dev/null || { echo "FAIL: dotnet not found (looked in PATH and ~/.dotnet)"; exit 1; }

# Pids listening on $port. Tries ss, then falls back to matching socket inodes from
# /proc/net/tcp{,6} against /proc/*/fd — ss is missing or hides pids in some sandboxes.
listener_pids() {
  local pids
  pids="$(ss -tlnpH "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)"
  if [ -n "$pids" ]; then
    echo "$pids"
    return
  fi
  local port_hex inodes dir pid fd target ino
  port_hex="$(printf '%04X' "$port")"
  inodes="$(awk -v p=":$port_hex" '$4 == "0A" && $2 ~ p"$" {print $10}' /proc/net/tcp /proc/net/tcp6 2>/dev/null | sort -u)"
  [ -z "$inodes" ] && return 0
  for dir in /proc/[0-9]*; do
    pid="${dir#/proc/}"
    for fd in "$dir"/fd/*; do
      target="$(readlink "$fd" 2>/dev/null)" || continue
      for ino in $inodes; do
        if [ "$target" = "socket:[$ino]" ]; then
          echo "$pid"
          continue 3
        fi
      done
    done
  done | sort -u
}

# 1. Stop whatever owns the port (and any stray backend binaries that lost the port race).
old_pids="$(listener_pids)"
stray_pids="$(pgrep -f 'SIL\.XForge\.Scripture/bin/.*SIL\.XForge\.Scripture' || true)"
for pid in $(printf '%s\n' $old_pids $stray_pids | sort -u); do
  kill "$pid" 2>/dev/null && echo "stopped pid $pid ($(cat /proc/$pid/comm 2>/dev/null || echo gone))"
done
for i in $(seq 1 30); do
  [ -z "$(listener_pids)" ] && break
  sleep 1
done
if [ -n "$(listener_pids)" ]; then
  echo "FAIL: port $port still owned by pid(s) $(listener_pids) after SIGTERM; run: kill -9 $(listener_pids)"
  exit 1
fi

# 2. Start a fresh backend (dotnet run rebuilds if sources changed).
cd "$repo_root/src/SIL.XForge.Scripture"
SF_MOCK_SERVICES=true nohup dotnet run --start-ng-serve listen > "$log" 2>&1 &
started_pid=$!
echo "starting backend (pid $started_pid, log $log) — first build can take a few minutes…"

# 3. Wait for it to serve, then verify the listener is OUR process (not some survivor).
is_descendant_of() { # $1 candidate, $2 ancestor
  local p="$1"
  for _ in $(seq 1 15); do
    [ "$p" = "$2" ] && return 0
    p="$(awk '/^PPid:/{print $2}' "/proc/$p/status" 2>/dev/null)" || return 1
    [ -z "$p" ] || [ "$p" = "0" ] && return 1
  done
  return 1
}

for i in $(seq 1 120); do
  if ! kill -0 "$started_pid" 2>/dev/null; then
    echo "FAIL: backend process exited during startup. Last log lines:"
    tail -15 "$log"
    exit 1
  fi
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:$port/" 2>/dev/null || true)"
  [ "$code" = "200" ] && break
  sleep 5
done
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:$port/" 2>/dev/null || true)"
if [ "$code" != "200" ]; then
  echo "FAIL: backend did not answer 200 on port $port within 10 minutes. Last log lines:"
  tail -15 "$log"
  exit 1
fi

serving="$(listener_pids | head -1)"
if [ -n "$serving" ] && is_descendant_of "$serving" "$started_pid"; then
  echo "OK: backend up — port $port served by pid $serving (started by this script)."
else
  echo "FAIL: port $port answers but is served by pid ${serving:-unknown}, which is NOT the"
  echo "      backend this script started (pid $started_pid) — a survivor from before."
  echo "      Fix: kill $serving   then re-run this script."
  exit 1
fi

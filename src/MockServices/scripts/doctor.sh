#!/usr/bin/env bash
# Diagnoses the mock-services stack: reports what is up/down and prints the exact command to fix
# each problem. Run this first when anything misbehaves (or before starting work).
set -uo pipefail

package_root="$(cd "$(dirname "$0")/.." && pwd)"
repo_root="$(cd "$package_root/../.." && pwd)"
problems=0

pass() { echo "  [ok]   $1"; }
warn() {
  echo "  [warn] $1"
  echo "         fix: $2"
}
fail() {
  echo "  [FAIL] $1"
  echo "         fix: $2"
  problems=$((problems + 1))
}

http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$1" 2>/dev/null; }

echo "== prerequisites =="
if command -v dotnet >/dev/null; then
  pass "dotnet on PATH ($(command -v dotnet))"
elif [ -x "$HOME/.dotnet/dotnet" ]; then
  fail "dotnet not on PATH but found at ~/.dotnet/dotnet" \
    'export PATH="$HOME/.dotnet:$PATH"  (and set MOCK_DOTNET_EXE="$HOME/.dotnet/dotnet")'
else
  fail "dotnet SDK not found" "install the dotnet SDK (see repo README)"
fi
if command -v hg >/dev/null; then pass "hg on PATH"; else fail "hg (Mercurial) not found" "install mercurial"; fi

echo "== MongoDB (localhost:27017) =="
mongosh_exe="$(command -v mongosh || echo "$HOME/mongosh/bin/mongosh")"
if [ -x "$mongosh_exe" ] || command -v mongosh >/dev/null; then
  rs_state="$("$mongosh_exe" --quiet --eval 'try { print(rs.status().members[0].stateStr) } catch (e) { print("NO_RS:" + e.codeName) }' 2>/dev/null)"
  case "$rs_state" in
    PRIMARY) pass "mongod running as replica-set PRIMARY" ;;
    NO_RS:NotYetInitialized)
      warn "mongod running but replica set not initiated (only Serval drafting needs it; SF works without)" \
        "$mongosh_exe --quiet --eval 'rs.initiate()'" ;;
    NO_RS:*)
      warn "mongod running but not started with --replSet (only Serval drafting needs it; SF works without)" \
        "restart mongod with: mongod --dbpath <dir> --replSet rs0  then: mongosh --eval 'rs.initiate()'" ;;
    *)
      fail "mongod not reachable on 27017" \
        "start it, e.g.: mongod --dbpath <data-dir> --replSet rs0 --fork --logpath <log>  then: mongosh --eval 'rs.initiate()'" ;;
  esac
else
  if [ "$(http_code http://localhost:27017)" = "000" ]; then
    fail "cannot check mongod (mongosh not found) and port 27017 not answering" "start mongod on 27017"
  else
    pass "something is listening on 27017 (mongosh not found to verify replica set)"
  fi
fi

echo "== mock-services (this package) =="
if [ "$(http_code http://localhost:5100/)" = "200" ]; then
  pass "mock-services on http://localhost:5100"
else
  fail "mock-services not running" "cd $package_root && npm install && npm start   (background it)"
fi
if [ "$(http_code --insecure https://localhost:5101/ 2>/dev/null)" = "200" ] || curl -sk -o /dev/null --max-time 5 https://localhost:5101/; then
  pass "TLS listener on https://localhost:5101 (needed only for local Serval)"
else
  echo "  [info] TLS listener (5101) not answering — comes up with npm start"
fi

echo "== SF backend (http://localhost:5000) =="
if [ "$(http_code http://localhost:5000/)" = "200" ]; then
  pass "backend answering on 5000"
  login_code="$(http_code http://localhost:5000/login)"
  if [ "$login_code" = "200" ]; then
    pass "/login proxies to the Angular dev server"
  else
    fail "/login returns $login_code — the backend cannot reach the Angular dev server" \
      "run ng separately and use listen mode: (cd $repo_root/src/SIL.XForge.Scripture/ClientApp && npm run start:mock &) then restart the backend with: SF_MOCK_SERVICES=true dotnet run --start-ng-serve listen"
  fi
else
  fail "backend not running" \
    "cd $repo_root/src/SIL.XForge.Scripture && SF_MOCK_SERVICES=true dotnet run --start-ng-serve listen   (with ng running separately: cd ClientApp && npm run start:mock). Both in the background."
fi

echo "== Angular dev server (http://localhost:4200) =="
if [ "$(http_code http://localhost:4200/)" = "200" ]; then
  pass "ng serve (mock configuration) on 4200"
else
  fail "Angular dev server not running" \
    "cd $repo_root/src/SIL.XForge.Scripture/ClientApp && npm run start:mock   (background it; first build takes a few minutes)"
fi

echo "== local Serval (http://localhost:5150, optional — only for draft generation) =="
if [ "$(http_code http://localhost:5150/api/v1/status)" != "000" ]; then
  pass "Serval answering on 5150"
else
  echo "  [info] Serval not running — only needed for pre-translation drafting: cd $package_root && npm run serval"
fi

echo
if [ "$problems" = 0 ]; then
  echo "All good. Log in: node $package_root/client/cli.mjs next-login 'oauth2|paratext|mock-admin' then open http://localhost:5000 and click Log In."
else
  echo "$problems problem(s) found — apply the fixes above, then re-run this script."
fi

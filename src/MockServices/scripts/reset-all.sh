#!/usr/bin/env bash
# Fully resets the mock universe: mock-services state + repos (via the control API), the SF mock
# databases, and the backend's on-disk sync clones. Without the last two, re-connecting a project
# after a mock reset fails with "A directory for this project already exists".
#
# The backend caches realtime documents in memory — restart it after running this.
#
# Usage: scripts/reset-all.sh [seed]   (default seed: "default")
set -euo pipefail

package_root="$(cd "$(dirname "$0")/.." && pwd)"
repo_root="$(cd "$package_root/../.." && pwd)"
seed="${1:-default}"

echo "1/3 mock-services reset (seed: $seed)"
node "$package_root/client/cli.mjs" reset "$seed" >/dev/null

echo "2/3 dropping SF mock databases (xforge_mock, sf_mock_jobs)"
mongosh_exe="$(command -v mongosh || echo "$HOME/mongosh/bin/mongosh")"
if [ -x "$mongosh_exe" ] || command -v mongosh >/dev/null; then
  "$mongosh_exe" --quiet --eval 'db.getSiblingDB("xforge_mock").dropDatabase(); db.getSiblingDB("sf_mock_jobs").dropDatabase(); db.getSiblingDB("serval_mock").dropDatabase(); db.getSiblingDB("serval_mock_jobs").dropDatabase()' >/dev/null
else
  echo "  warning: mongosh not found — drop xforge_mock and sf_mock_jobs manually"
fi

echo "3/3 removing the backend's local project clones (.sf-local-data sync/training data)"
rm -rf "$repo_root/.sf-local-data/scriptureforge/sync" "$repo_root/.sf-local-data/scriptureforge/training-data"

echo
echo "Done. Now RESTART the SF backend (it caches realtime docs in memory):"
echo "  kill the 'dotnet run' process, then:"
echo "  cd $repo_root/src/SIL.XForge.Scripture && SF_MOCK_SERVICES=true dotnet run --start-ng-serve listen"

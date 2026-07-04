#!/usr/bin/env bash
# Runs a real Serval (API server with its in-process Echo engine) locally, configured to work
# with mock-services: tokens are minted by the fake Auth0, and Serval validates them against the
# mock's HTTPS listener (Serval's auth authority scheme is hardcoded https).
#
# Not a mock: this is the actual Serval application, cloned from sillsdev/serval and pinned to
# the release matching the Serval.Client package the SF backend uses. The Echo engine makes
# pre-translation drafting work end to end without ClearML/GPU infrastructure; NMT/SMT builds
# are not available locally.
#
# Prerequisites:
#   - mock-services running (npm start) — it generates .data/mock-tls-cert.pem on first start
#   - MongoDB running as a (single-node) replica set — Serval's build long-polling uses change
#     streams, which standalone mongod does not support
#   - dotnet SDK (same as the SF backend)
#
# Environment overrides: SERVAL_PORT (5150), SERVAL_REF (pinned tag), SERVAL_SRC (checkout dir),
# SERVAL_MONGO (mongodb://localhost:27017), MOCK_TLS_PORT (5101), MOCK_DOTNET_EXE (dotnet).
set -euo pipefail

package_root="$(cd "$(dirname "$0")/.." && pwd)"
data_dir="$package_root/.data"
serval_src="${SERVAL_SRC:-$package_root/.serval}"
# Keep in lockstep with the Serval.Client version in SIL.XForge.Scripture.csproj.
serval_ref="${SERVAL_REF:-docker_1.18.0}"
serval_data="$data_dir/serval"
port="${SERVAL_PORT:-5150}"
tls_port="${MOCK_TLS_PORT:-5101}"
mongo_base="${SERVAL_MONGO:-mongodb://localhost:27017}"
dotnet_exe="${MOCK_DOTNET_EXE:-dotnet}"

cert="$data_dir/mock-tls-cert.pem"
if [ ! -f "$cert" ]; then
  echo "error: $cert not found — start mock-services once first (npm start) to generate it" >&2
  exit 1
fi

if [ ! -d "$serval_src/.git" ]; then
  echo "[serval] cloning sillsdev/serval @ $serval_ref into $serval_src"
  git clone --depth 1 --branch "$serval_ref" https://github.com/sillsdev/serval "$serval_src"
fi

mkdir -p "$serval_data/files" "$serval_data/engines"

export ASPNETCORE_ENVIRONMENT=Development
export ASPNETCORE_URLS="http://localhost:$port"
# Separate databases from both real Serval conventions and SF's mock databases.
export ConnectionStrings__Mongo="$mongo_base/serval_mock"
export ConnectionStrings__Hangfire="$mongo_base/serval_mock_jobs"
# Serval builds its authority as https://{Auth:Domain}/ — this resolves to the mock's TLS
# listener, and SSL_CERT_FILE makes dotnet trust the self-signed certificate.
export Auth__Domain="localhost:$tls_port/auth0"
export Auth__Audience="https://serval-api.org/"
export SSL_CERT_FILE="$cert"
export DataFile__FilesDirectory="$serval_data/files"
export SmtTransferEngine__EnginesDir="$serval_data/engines"
export StatisticalEngine__EnginesDir="$serval_data/engines"
# No ClearML locally: echo builds run in-process; do not poll the (unreachable) ClearML API.
export ClearML__BuildPollingEnabled=false

echo "[serval] starting Serval.ApiServer on http://localhost:$port (echo engine in-process)"
exec "$dotnet_exe" run --project "$serval_src/src/Serval/src/Serval.ApiServer" -c Release --no-launch-profile

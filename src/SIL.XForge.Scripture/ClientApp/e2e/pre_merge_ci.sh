#!/bin/bash
set -xueo pipefail

SCRIPT_DIR="$(dirname "$(readlink --canonicalize "$0")")"

function shutDownServer() {
  echo "Shutting down server with PID: $SERVER_PID"

  kill $SERVER_PID
  sleep 3s
  ps $SERVER_PID || :

  kill -5 $SERVER_PID || :
  sleep 3s
  ps $SERVER_PID || :

  kill -9 $SERVER_PID || :
  sleep 3s
  ps $SERVER_PID || :
}

trap 'shutDownServer' EXIT

cd "${SCRIPT_DIR}"
cd "../.."

DOTNET_LOG=$(mktemp)
echo "Logging dotnet to ${DOTNET_LOG}"
nohup dotnet run &>${DOTNET_LOG} &
SERVER_PID=$!
echo "Server started with PID: $SERVER_PID"

sleep 10s
max_retries=10
attempt=1
until nc -z localhost 5000 || ((attempt > max_retries)); do
  echo "Waiting for dotnet server to start... (attempt $attempt)"
  sleep 10s
  attempt=$((attempt + 1))
done
if ((attempt > max_retries)); then
  echo "dotnet server failed to start after $max_retries attempts."
  echo "Log output:"
  cat "${DOTNET_LOG}"
  exit 1
fi
echo "dotnet server is up and running."

sleep 10s
attempt=1
until nc -z localhost 4200 || ((attempt > max_retries)); do
  echo "Waiting for ng server to start... (attempt $attempt)"
  sleep 10s
  attempt=$((attempt + 1))
done
if ((attempt > max_retries)); then
  echo "ng server failed to start after $max_retries attempts."
  exit 1
fi
echo "ng server is up and running."

sleep 5s
cd "${SCRIPT_DIR}"
./e2e.mts pre_merge_ci

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

nohup dotnet run &
SERVER_PID=$!
echo "Server started with PID: $SERVER_PID"

max_retries=30
attempt=1
until nc -z localhost 5000 || ((attempt > max_retries)); do
  echo "Waiting for server to start... (attempt $attempt)"
  sleep 1
  attempt=$((attempt + 1))
done
echo "Server is up and running."

cd "${SCRIPT_DIR}"
./e2e.mts pre_merge_ci

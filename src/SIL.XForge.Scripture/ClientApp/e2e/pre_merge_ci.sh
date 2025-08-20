#!/bin/bash
set -ueo pipefail

SCRIPT_DIR="$(dirname "$(readlink --canonicalize "$0")")"
PROGRAM_NAME="E2ELauncher"

function output() {
  echo "${PROGRAM_NAME}:" "$@"
}

function reportElapsedTime() {
  local elapsed="${SECONDS}"
  local minutes="$((elapsed / 60))"
  local seconds="$((elapsed % 60))"
  output "Elapsed time: ${minutes}m ${seconds}s"
}

function shutDownServer() {
  local pid="$1"
  reportElapsedTime
  output "Shutting down server with PID ${pid}."

  kill -TERM "${pid}" 2>/dev/null || {
    output "Error sending SIGTERM."
    exit 1
  }

  local timeout="35"
  for ((i = 0; i < timeout; i++)); do
    if ! kill -0 "${pid}" 2>/dev/null; then
      output "Server shut down."
      return
    fi
    sleep 1s
  done

  # If still running, send SIGKILL
  output "Timeout. Sending SIGKILL."
  kill -KILL "${pid}" 2>/dev/null
}

function startServer() {
  cd "${SCRIPT_DIR}/../.."
  mkdir -p ./ClientApp/e2e/test_output/ci_e2e_test_results
  DOTNET_LOG="./ClientApp/e2e/test_output/ci_e2e_test_results/dotnet.txt"
  output "Logging dotnet output to ${DOTNET_LOG}"
  export ASPNETCORE_ENVIRONMENT="Development"
  nohup dotnet run &>"${DOTNET_LOG}" &
  local SERVER_PID="$!"
  trap "shutDownServer ${SERVER_PID}" EXIT
  output "Server started with PID ${SERVER_PID}"
  output "Awaiting application startup before running tests"
  cd "${SCRIPT_DIR}"
  ./await-application-startup.mts
}

output "$(date -Is) Starting."
startServer
cd "${SCRIPT_DIR}"
./e2e.mts pre_merge_ci

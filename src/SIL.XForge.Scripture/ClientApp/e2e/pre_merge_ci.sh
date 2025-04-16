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
  local DOTNET_LOG="$(mktemp)"
  output "Logging dotnet output to ${DOTNET_LOG}"
  nohup dotnet run &>"${DOTNET_LOG}" &
  local SERVER_PID="$!"
  trap "shutDownServer ${SERVER_PID}" EXIT
  output "Server started with PID ${SERVER_PID}"

  sleep 20s
  local max_retries=10
  local attempt=1
  until nc -z localhost 5000 &>/dev/null || ((attempt > max_retries)); do
    output "Waiting for dotnet server to be ready. (Attempt ${attempt}/${max_retries})"
    sleep 10s
    attempt=$((attempt + 1))
  done
  if ((attempt > max_retries)); then
    output "dotnet server failed to be ready after ${max_retries} attempts."
    output "dotnet output:"
    cat "${DOTNET_LOG}"
    exit 1
  fi
  output "dotnet server is up and running."

  sleep 10s
  attempt=1
  until nc -z localhost 4200 &>/dev/null || ((attempt > max_retries)); do
    output "Waiting for ng server to be ready. (Attempt ${attempt}/${max_retries})"
    sleep 10s
    attempt=$((attempt + 1))
  done
  if ((attempt > max_retries)); then
    output "ng server failed to be ready after ${max_retries} attempts."
    output "dotnet output:"
    cat "${DOTNET_LOG}"
    exit 1
  fi
  output "ng server is up and running."

  sleep 5s
}

output "$(date -Is) Starting."
startServer
cd "${SCRIPT_DIR}"
./e2e.mts pre_merge_ci

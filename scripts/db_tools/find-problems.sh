#!/usr/bin/env bash

# Usage: ./find-problems.sh [port] [ssh-config]
# Example: ./find-problems.sh 3017 sf-live-forward-mongo
# mongosh command needs to support --file option. 0.8.2 is known to not support it. 1.2.3 is known to support it.
# Run mongosh --version to check version  number

# make bash exit on failures
set -eu

if [[ ($# -ne 1) && ($# -ne 2) ]] ; then
  echo "Usage: find-problems.sh [port number] [ssh-config?]"
  exit 1
fi

integer_regex='^[0-9]+$'
if ! [[ $1 =~ $integer_regex ]] ; then
   echo "First argument must be a port number"
   exit 1
fi

PORT_NUMBER="$1"

function forwardPorts() {
  echo "Port forwarding using ssh config $1"
  ssh -o ExitOnForwardFailure=yes -f "$1" sleep 15
}

function runChecks() {
  echo PROJECTS IN SYNC STATE
  # mongosh is the replacement for the deprecated mongo shell
  mongosh --port "$1" --file ../../mongodb/Projects/ProjectsInSyncState.mongodb --quiet
  echo
  echo PROJECTS WERE LAST SYNC FAILED
  mongosh --port "$1" --file ../../mongodb/Projects/ProjectsWhereLastSyncFailed.mongodb --quiet
  echo
  echo CORRUPTED TEXTS
  mongosh --port "$1" --file ../../mongodb/Texts/CorruptedTexts.mongodb --quiet
}

# establish background ssh connection that can be used by following commands
([[ $# -eq 2 ]] && forwardPorts "$2") & (sleep 2 && runChecks "$PORT_NUMBER")

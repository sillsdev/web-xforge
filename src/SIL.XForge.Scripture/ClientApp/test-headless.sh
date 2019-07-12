#!/bin/bash
# Run tests in terminal.
# Usage:
#   src/SIL.XForge.Scripture/ClientApp/test-headless.sh [spec filenames to restrict to ...]
# Example:
#   src/SIL.XForge.Scripture/ClientApp/test-headless.sh foo.spec.ts baz.spec.ts

set -u -e -o pipefail

readonly ROOT_PATH="$(dirname "$0")"
readonly SETTINGS_FILE="${ROOT_PATH}/src/test.ts"
SPEC_FILES="$@"

# Re-write test.ts 'require.context' line to only use specific tests, rather than all spec.ts files.
filter_tests() {
  [[ -n ${SPEC_FILES} ]] || return 0

  for spec in ${SPEC_FILES}; do
    find -name "${spec}" | grep -q . || echo -e "\033[1;31mWarning: ${spec} not found.\033[0m"
  done

  SPEC_FILES="${SPEC_FILES// /|}"
  perl -pi -e "s:(require.context.*\, /).*(/\);)(.*$):\$1${SPEC_FILES}\$2 // Temporarily modified by test runner. Can revert.:" "${SETTINGS_FILE}"
}

cleanup() {
  date +"%F %T"
  [[ -n ${SPEC_FILES} ]] || return 0
  # Restore filter less bluntly than `git checkout`. May need to update if test.ts changes.
  readonly FILTER='\\.spec\\.ts\$'
  perl -pi -e "s:(require.context.*\, /).*(/\);)(.*$):\$1${FILTER}\$2:" "${SETTINGS_FILE}"
}

run() {
  LEFT_POINTING_MAGNIFYING_GLASS="\xF0\x9F\x94\x8D"
  HEAVY_BALLOT_X="\xE2\x9C\x98"
  WAVING_BLACK_FLAG="\xF0\x9F\x8F\xB4"
  NO_ENTRY="\xE2\x9B\x94"

  echo -e "\033[1;34m${LEFT_POINTING_MAGNIFYING_GLASS}  Checking against spec\033[0m"
  date +"%F %T"
  cd "$ROOT_PATH" &&
    /usr/bin/time --quiet -f 'Duration %E' ng test --browsers ChromeHeadless --watch false --sourceMap=true |&
      # Slim the output
      grep -v '^.#' |
      grep -v '^Headless.*LOG' |
      grep -v ':INFO \[' |
      perl -p -e "s/HeadlessChrome .*\)/${HEAVY_BALLOT_X} /" |
      perl -p -e "s/(TOTAL:.*)/${WAVING_BLACK_FLAG}  \1/" |
      perl -p -e "s/(ERROR)/${NO_ENTRY}  \1/" |
      # Highlight select text, and use |$ to make otherwise not-matching output come thru.
      grep --color -E '(.*FAILED|[^/]+ts:[[:digit:]]+|.*TOTAL.*$|^[[:blank:]]*Error:|.  ERROR |$)'
}

trap cleanup EXIT
filter_tests
run

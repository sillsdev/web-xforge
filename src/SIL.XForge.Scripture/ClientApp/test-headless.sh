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

# Set 256-based color.
# The first argument is the foreground color.
# The second argument is an optional background color.
color() {
  echo -en "\\033[38;5;$1m"
  if [[ -n ${2-} ]]; then
    echo -en "\\033[48;5;$2m"
  fi
}
RED="196"
GREEN="046"
BLUE="012"
ORANGE="208"
YELLOW="226"

color_end() {
  echo -en "\\033[0m"
}

# Re-write test.ts 'require.context' line to only use specific tests, rather than all spec.ts files.
filter_tests() {
  [[ -n ${SPEC_FILES} ]] || return 0

  for spec in ${SPEC_FILES}; do
    find -name "${spec}" | grep -q . || echo -e "$(color ${RED})Warning: ${spec} not found.$(color_end)"
  done

  SPEC_FILES="${SPEC_FILES// /|}"
  perl -pi -e "s:(require.context.*\, /).*(/\);)(.*$):\$1${SPEC_FILES}\$2 // Temporarily modified by test runner. Can revert.:" "${SETTINGS_FILE}"
}

finish() {
  date +"%F %T"
  cleanup
}

cleanup() {
  [[ -n ${SPEC_FILES} ]] || return 0
  # Restore filter less bluntly than `git checkout`. May need to update if test.ts changes.
  readonly FILTER='\\.spec\\.ts\$'
  perl -pi -e "s:(require.context.*\, /).*(/\);)(.*$):\$1${FILTER}\$2:" "${SETTINGS_FILE}"
}

run() {
  LEFT_POINTING_MAGNIFYING_GLASS="\xF0\x9F\x94\x8D"
  HEAVY_BALLOT_X="\xE2\x9C\x98"
  WAVING_BLACK_FLAG="$(echo -en "\xF0\x9F\x8F\xB4")"
  NO_ENTRY="\xE2\x9B\x94"

  echo -e "$(color ${BLUE})${LEFT_POINTING_MAGNIFYING_GLASS}  Checking against spec$(color_end)"
  date +"%F %T"

  # Early cleanup of modified test.ts for cleaner git status.
  (sleep 10s; cleanup) &

  cd "$ROOT_PATH" &&
    /usr/bin/time --quiet -f "$(color ${ORANGE})${WAVING_BLACK_FLAG}  Duration %E$(color_end)" ng test --browsers ChromeHeadless --watch false --sourceMap=true |&
      # Slim the output
      grep -v '^.#' |
      grep -v '^Headless.*LOG' |
      grep -v ':INFO \[' |
      # Reduce indentation
      perl -p -e 's/(\t| {4})/  /g' |
      # Highlight. Add icons.
      perl -p -e "s/HeadlessChrome .*\)(.*FAILED)$/$(color ${RED})${HEAVY_BALLOT_X} \1$(color_end)/" |
      perl -p -e "s/^(ERROR[ :])/$(color ${RED})${NO_ENTRY}  \1$(color_end)/" |
      perl -p -e "s/(ERROR[ :])/$(color ${RED})\1$(color_end)/" |
      perl -p -e "s/^(TOTAL:.*FAILED.*)/$(color ${RED})\1$(color_end)/" |
      perl -p -e "s/^(TOTAL:[^F]+$)/$(color ${GREEN})\1$(color_end)/" |
      perl -p -e "s/([^ ]*Error:)/$(color ${RED})\1$(color_end)/" |
      # Highlight filename and line number of foo.ts:123 and foo.ts(123)
      perl -p -e 's#([^/]+\.ts)([:\(])(\d+\)?)'"#$(color ${YELLOW})\1$(color_end)\2$(color ${YELLOW})\3$(color_end)#g"
}

trap finish EXIT
filter_tests
run

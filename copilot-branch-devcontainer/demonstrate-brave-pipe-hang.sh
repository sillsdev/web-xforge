#!/usr/bin/env bash
#
# demonstrate-brave-pipe-hang.sh
#
# Demonstrates that invoking a browser through a shell wrapper that uses
#   exec > >(exec cat)
#   exec 2> >(exec cat >&2)
# causes a pipe to hang open indefinitely when the browser is killed.
# A wrapper that instead uses plain 'exec $binary "$@"' does NOT hang.
#
# Tested wrappers
# ────────────────────────────────────────────────────────────────
# /usr/bin/brave-browser   (shell wrapper — HANGS)
#   Uses exec > >(exec cat); creates orphaned 'cat' helper processes that hold
#   the pipe's write end open after Brave's children are orphaned.
#
# /opt/brave.com/brave/brave   (direct binary — does NOT hang)
#   No wrapper; the binary itself redirects stdout to /dev/null early.
#
# /usr/bin/chromium-browser   (direct symlink or binary — does NOT hang)
#   Many environments (CI runners, custom installs) make this a direct symlink
#   to the real Chromium binary with no wrapper at all.
#
# Debian 'chromium' apt/deb wrapper   (shell wrapper — does NOT hang)
#   The Debian package's /usr/bin/chromium wrapper uses plain
#   'exec $LIBDIR/chromium $CHROMIUM_FLAGS "$@"' which replaces the shell
#   directly.  No 'cat' helpers, no orphaned processes.
#
# This bug is the root cause of the karma test runner hanging when
# CHROMIUM_BIN=/usr/bin/brave-browser.  The fix is to set
# CHROMIUM_BIN=/opt/brave.com/brave/brave (see Dockerfile in this directory).
#
# ────────────────────────────────────────────────────────────────
# WHY THE BUG EXISTS
# ────────────────────────────────────────────────────────────────
# /usr/bin/brave-browser is a bash script.  Before launching the real
# binary it "sanitizes" stdio with these two lines:
#
#   exec > >(exec cat)
#   exec 2> >(exec cat >&2)
#
# Each of those spawns a background 'cat' helper whose job is to relay
# the browser's output to the caller.  The caller's pipe write-end is the
# 'cat' helper's stdout.
#
# When karma (Node.js) spawns the browser, it creates a pipe for the
# subprocess's stdout and waits (event-loop style) for that pipe to close.
# The sequence with the shell wrapper is:
#
#   karma (Node.js event loop)
#      └─ [PIPE] ─← cat (wrapper helper, writes to PIPE)
#                        └─ [INNER PIPE] ─← brave (shell wrapper)
#                                                └─ brave children (renderer,
#                                                   crashpad-handler, zygote …)
#
# When karma sends SIGTERM to the shell-wrapper process to stop it:
#   • The shell script exits, closing its own copy of INNER PIPE's write end.
#   • Brave's child processes were already spawned; they are now orphaned
#     (PPID=1) but still hold their copies of INNER PIPE's write end.
#   • 'cat' reads from INNER PIPE — it cannot see EOF while brave's
#     children hold it open, so 'cat' keeps running.
#   • 'cat' holds PIPE's write end open.
#   • Node.js's event loop cannot exit while PIPE has open write ends.
#   • Result: karma hangs.
#
# The Debian chromium wrapper avoids this because it uses plain 'exec':
#   exec $LIBDIR/$APPNAME $CHROMIUM_FLAGS "$@"
# This REPLACES the shell process with the browser binary.  There are no
# background 'cat' helpers and no intermediate pipe.  When the browser binary
# exits, the caller's pipe closes immediately.
#
# With /opt/brave.com/brave/brave directly:
#   • There are no 'cat' helpers — PIPE's write end belongs only to the
#     brave binary itself.
#   • The brave binary redirects its own stdout to /dev/null early, before
#     forking long-lived child processes; those children inherit /dev/null,
#     not PIPE.
#   • When brave exits, PIPE's write end is closed.
#   • Node.js's event loop exits cleanly.
#
# ────────────────────────────────────────────────────────────────
# HOW THIS SCRIPT TESTS THE BUG (without Node.js, karma, or Scripture Forge)
# ────────────────────────────────────────────────────────────────
# We replicate karma's pattern using only bash/coreutils:
#
#   1. Create a named FIFO (a named pipe).
#   2. Start a 'reader' process that reads from the FIFO (simulating
#      Node.js's event loop waiting for the subprocess's stdout pipe to close).
#   3. Launch the browser with its stdout directed to the FIFO (simulating
#      karma's Node.js spawn()).
#   4. Let the browser warm up for a few seconds so it spawns its child
#      processes (renderer, crashpad-handler, zygote, etc.)
#   5. Kill just the top-level browser process (simulating karma's singleRun
#      shutdown, which calls process.kill() on the PID it spawned).
#   6. Check whether the reader is still alive:
#        still alive  → HANG  (pipe write end held open by orphaned processes)
#        already dead → OK    (pipe write end closed; Node.js would exit)

set -uo pipefail

readonly BRAVE_WRAPPER="/usr/bin/brave-browser"
readonly BRAVE_BINARY="/opt/brave.com/brave/brave"

# Chromium paths (optional — tests are skipped if the paths don't exist).
#
# CHROMIUM_BINARY: a direct path or symlink to the Chromium binary.  Many CI
# environments and custom installs use a direct symlink at /usr/bin/chromium-browser.
readonly CHROMIUM_BINARY="/usr/bin/chromium-browser"
#
# CHROMIUM_DEBIAN_WRAPPER: the wrapper script shipped in Debian's 'chromium'
# apt/deb package (not the Ubuntu 'chromium-browser' snap-wrapper package).
# The Debian wrapper uses plain 'exec $binary "$@"' which replaces the shell
# and does NOT create orphaned 'cat' helper processes.
# To set this up without installing the whole Debian package:
#   1. Download the Debian chromium deb from http://deb.debian.org/debian/pool/main/c/chromium/
#   2. Extract: ar x chromium_*.deb && tar -xJf data.tar.xz ./usr/bin/chromium
#   3. sudo mkdir -p /usr/lib/chromium /etc/chromium.d
#      sudo ln -sf /usr/local/share/chromium/chrome-linux/chrome /usr/lib/chromium/chromium
#      printf '# placeholder\n' | sudo tee /etc/chromium.d/README
#      sudo cp usr/bin/chromium /usr/local/bin/chromium-debian-wrapper
#      sudo chmod +x /usr/local/bin/chromium-debian-wrapper
readonly CHROMIUM_DEBIAN_WRAPPER="/usr/local/bin/chromium-debian-wrapper"

# Seconds the browser is allowed to run before being killed (let it spawn children).
readonly BROWSER_RUN_SECS=3
# Seconds to wait after killing the browser before checking whether the pipe closed.
readonly SETTLE_SECS=2

PASS_COUNT=0
FAIL_COUNT=0

# ──────────────────────────────────────────────────────────────────────────────
check_prereqs() {
    # Brave is required — the script cannot demonstrate anything without it.
    local ok=true
    for path in "$BRAVE_WRAPPER" "$BRAVE_BINARY"; do
        if [[ ! -x "$path" ]]; then
            echo "ERROR: required Brave executable not found: $path" >&2
            ok=false
        fi
    done
    if [[ "$ok" == "false" ]]; then
        exit 1
    fi

    # Chromium is optional — tests are skipped if none of the paths exist.
    local chromium_found=false
    for path in "$CHROMIUM_BINARY" "$CHROMIUM_DEBIAN_WRAPPER"; do
        if [[ -x "$path" ]]; then
            chromium_found=true
        fi
    done
    if [[ "$chromium_found" == "false" ]]; then
        echo "NOTE: No Chromium executable found at any of the expected paths:"
        echo "      CHROMIUM_BINARY         = $CHROMIUM_BINARY"
        echo "      CHROMIUM_DEBIAN_WRAPPER = $CHROMIUM_DEBIAN_WRAPPER"
        echo "  Chromium tests will be skipped."
        echo "  To include Chromium tests, install Chromium via snap:"
        echo "      sudo snap install chromium"
        echo "  Or install the Debian 'chromium' apt/deb package (not the Ubuntu"
        echo "  snap-wrapper package) and run:"
        echo "      sudo mkdir -p /usr/lib/chromium /etc/chromium.d"
        echo "      sudo ln -sf /path/to/chromium/binary /usr/lib/chromium/chromium"
        echo "      sudo echo '# placeholder' | sudo tee /etc/chromium.d/README"
        echo "      sudo cp /path/to/debian/usr/bin/chromium $CHROMIUM_DEBIAN_WRAPPER"
        echo "      sudo chmod +x $CHROMIUM_DEBIAN_WRAPPER"
        echo ""
    fi
}

# cleanup_leftovers — kill any browser / orphaned cat processes left by a test
cleanup_leftovers() {
    # Orphaned Brave sub-processes
    ps ax -o pid=,args= | grep '/opt/brave.com/brave' | grep -v grep | \
        awk '{print $1}' | while read -r p; do kill "$p" 2>/dev/null || true; done
    # Orphaned Chromium sub-processes
    ps ax -o pid=,args= | grep -E '/usr/lib/chromium|/usr/local/share/chromium|/snap/chromium' | grep -v grep | \
        awk '{print $1}' | while read -r p; do kill "$p" 2>/dev/null || true; done
    # Orphaned cat processes that were spawned by any shell wrapper
    ps ax -o pid=,ppid=,args= | awk '$2=="1" && $3=="cat"{print $1}' | \
        while read -r p; do kill "$p" 2>/dev/null || true; done
}

# ──────────────────────────────────────────────────────────────────────────────
# run_pipe_test BROWSER_CMD PROFILE_DIR BROWSER_PATTERN
#   Runs the FIFO-based test for the given browser invocation.
#   BROWSER_PATTERN is a grep -E pattern to identify this browser's processes.
#   Prints diagnostic output.
#   Returns:  0 if the pipe closed cleanly (no hang — reader already gone)
#             1 if the pipe hung (reader still alive after settle time)
run_pipe_test() {
    local browser_cmd="$1"
    local profile_dir="$2"
    local browser_pattern="$3"

    local tmpdir
    tmpdir=$(mktemp -d)
    local fifo="$tmpdir/stdout.pipe"
    mkfifo "$fifo"

    # Simulate karma / Node.js: read the browser's stdout through a pipe.
    # This reader can only exit when ALL writers to the FIFO have closed it.
    cat "$fifo" > /dev/null &
    local reader_pid=$!

    # Launch the browser with stdout going to the FIFO (simulating karma's spawn()).
    # --user-data-dir isolates each test run's profile so they don't conflict.
    # stderr is sent to /dev/null so test output stays clean.
    "$browser_cmd" --headless --no-sandbox --disable-gpu \
        --user-data-dir="$profile_dir" \
        --remote-debugging-port=0 > "$fifo" 2>/dev/null &
    local browser_pid=$!

    # Let the browser warm up and spawn its child processes
    # (renderer, crashpad-handler, zygote, network-service, etc.).
    sleep "$BROWSER_RUN_SECS"

    # Kill the top-level browser process — this is exactly what karma's singleRun
    # mode does: it calls process.kill() on the PID it spawned, which sends
    # SIGTERM to only that process.  The browser's already-spawned child processes
    # are NOT killed; they become orphaned.
    kill "$browser_pid" 2>/dev/null || true

    # Wait for processes to react.
    sleep "$SETTLE_SECS"

    # ── Diagnostic: show orphaned cat and browser processes ─────────────────
    local orphaned_cats
    orphaned_cats=$(ps ax -o pid=,ppid=,args= | awk '$2=="1" && $3=="cat"{print $1}' | wc -l)
    local orphaned_browsers
    orphaned_browsers=$(ps ax -o pid=,args= | grep -E "$browser_pattern" | grep -v grep | wc -l)

    echo "  Orphaned 'cat' processes  : $orphaned_cats  (these hold the pipe write end open)"
    echo "  Orphaned browser processes: $orphaned_browsers"

    # ── Determine result ────────────────────────────────────────────────────
    # pipe_is_open=1 means the pipe write end is still held open (hang detected).
    # We return this value as the exit code: 0 = no hang (success), 1 = hang.
    local pipe_is_open=0
    if kill -0 "$reader_pid" 2>/dev/null; then
        pipe_is_open=1
        echo "  Pipe status               : OPEN (reader still alive → would cause karma hang)"
    else
        echo "  Pipe status               : CLOSED (reader exited → karma would exit cleanly)"
    fi

    # Cleanup
    kill "$reader_pid" 2>/dev/null || true
    wait "$reader_pid" 2>/dev/null || true
    cleanup_leftovers
    rm -rf "$tmpdir"

    return "$pipe_is_open"
}

# ──────────────────────────────────────────────────────────────────────────────
run_test() {
    local browser_cmd="$1"
    local label="$2"
    local expect_hang="$3"    # "yes" or "no"
    local profile_dir="$4"
    local browser_pattern="$5"  # grep -E pattern identifying this browser's processes

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Command       : $browser_cmd"
    echo "  Description   : $label"
    echo "  Expected hang : $expect_hang"
    echo ""

    local actual_hang="no"
    if run_pipe_test "$browser_cmd" "$profile_dir" "$browser_pattern"; then
        : # pipe closed cleanly, no hang
    else
        actual_hang="yes"
    fi

    echo ""
    echo "  Actual hang   : $actual_hang"

    if [[ "$actual_hang" == "$expect_hang" ]]; then
        echo "  Result        : PASS ✔"
        PASS_COUNT=$(( PASS_COUNT + 1 ))
    else
        echo "  Result        : FAIL ✗"
        FAIL_COUNT=$(( FAIL_COUNT + 1 ))
    fi
    echo ""
}

# ──────────────────────────────────────────────────────────────────────────────
main() {
    echo "════════════════════════════════════════════════════════════════════════"
    echo "  Browser pipe-hang demonstration (Brave + Chromium)"
    echo ""
    echo "  Each test runs the browser for ${BROWSER_RUN_SECS}s then kills the"
    echo "  top-level process and checks whether a pipe reader (simulating"
    echo "  Node.js / karma) is still blocked."
    echo "════════════════════════════════════════════════════════════════════════"
    echo ""

    check_prereqs

    local profile1 profile2
    profile1=$(mktemp -d)
    profile2=$(mktemp -d)

    # ── Brave tests ──────────────────────────────────────────────────────────

    # Test 1: Brave shell wrapper — expected to leave orphaned 'cat' processes
    # that hold the pipe open, causing a hang.
    # The wrapper runs:
    #   exec > >(exec cat)          # creates cat#1 that holds PIPE open
    #   exec 2> >(exec cat >&2)     # creates cat#2 (stderr relay)
    #   "$HERE/brave" "$@" || true  # brave and its children inherit INNER PIPE
    # When brave is killed, its orphaned children keep INNER PIPE open → cat
    # keeps running → PIPE stays open → karma event loop hangs.
    run_test "$BRAVE_WRAPPER" \
        "Brave shell wrapper (/usr/bin/brave-browser): exec > >(exec cat) creates orphaned 'cat' processes" \
        "yes" \
        "$profile1" \
        "/opt/brave.com/brave"

    # Test 2: Brave direct binary — expected to close the pipe cleanly.
    # The binary redirects its own stdout to /dev/null early, before forking
    # long-lived children.  Those children inherit /dev/null, not PIPE.
    run_test "$BRAVE_BINARY" \
        "Brave direct binary (/opt/brave.com/brave/brave): no shell wrapper, no orphaned processes" \
        "no" \
        "$profile2" \
        "/opt/brave.com/brave"

    rm -rf "$profile1" "$profile2"

    # ── Chromium tests ───────────────────────────────────────────────────────
    # Run chromium tests only if at least one chromium path is available.

    if [[ -x "$CHROMIUM_BINARY" ]] || [[ -x "$CHROMIUM_DEBIAN_WRAPPER" ]]; then
        echo ""
        echo "  ── Chromium tests ───────────────────────────────────────────────────"
        echo ""
        echo "  NOTE: The speculation that the Debian apt/deb chromium wrapper might"
        echo "  have the same exec > >(exec cat) problem as brave-browser was tested."
        echo "  The Debian wrapper (/usr/bin/chromium from the 'chromium' deb) uses:"
        echo "      exec \$LIBDIR/chromium \$CHROMIUM_FLAGS \"\$@\""
        echo "  This 'exec' replaces the shell with the browser binary directly —"
        echo "  no background 'cat' helpers, no orphaned processes, no hang."
        echo ""
    fi

    if [[ -x "$CHROMIUM_BINARY" ]]; then
        local profile3
        profile3=$(mktemp -d)
        # Test 3: Chromium direct binary (or direct symlink to binary).
        # In many environments /usr/bin/chromium-browser is a symlink directly
        # to the real browser binary, so there is no wrapper at all.
        run_test "$CHROMIUM_BINARY" \
            "Chromium direct binary/symlink (/usr/bin/chromium-browser): no wrapper, pipe closes cleanly" \
            "no" \
            "$profile3" \
            "/usr/local/share/chromium|/usr/lib/chromium|/snap/chromium"
        rm -rf "$profile3"
    fi

    if [[ -x "$CHROMIUM_DEBIAN_WRAPPER" ]]; then
        local profile4
        profile4=$(mktemp -d)
        # Test 4: Debian apt/deb chromium wrapper.
        # The Debian package's /usr/bin/chromium wrapper uses a plain 'exec' to
        # replace the shell with the browser binary.  Unlike brave-browser's
        # exec > >(exec cat) approach, there are no background helper processes.
        # When the browser exits, the pipe closes immediately.
        run_test "$CHROMIUM_DEBIAN_WRAPPER" \
            "Debian apt/deb chromium wrapper: uses plain 'exec \$binary \$@', no orphaned processes" \
            "no" \
            "$profile4" \
            "/usr/local/share/chromium|/usr/lib/chromium"
        rm -rf "$profile4"
    fi

    echo "════════════════════════════════════════════════════════════════════════"
    printf "  Tests passed: %d\n" "$PASS_COUNT"
    printf "  Tests failed: %d\n" "$FAIL_COUNT"
    echo "════════════════════════════════════════════════════════════════════════"

    if (( FAIL_COUNT > 0 )); then
        exit 1
    fi
}

main

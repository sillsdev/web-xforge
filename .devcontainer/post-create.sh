#!/bin/bash
# Post-create setup script for the Scripture Forge devcontainer.
# This runs after the container is created and sets up the development environment.
set -euo pipefail

echo "=== Restoring .NET tools ==="
sudo dotnet workload update
dotnet tool restore

echo "=== Restoring .NET packages ==="
dotnet restore

echo "=== Installing RealtimeServer pnpm packages ==="
cd src/RealtimeServer
pnpm ci

echo "=== Installing ClientApp pnpm packages ==="
cd ../SIL.XForge.Scripture/ClientApp
pnpm ci

echo "=== Installing Deno ==="
cd $(mktemp --directory)
curl -fsSLO https://github.com/denoland/deno/releases/download/v2.7.7/deno-x86_64-unknown-linux-gnu.zip
sha256sum --check <<< "0cd918870657ccc3d96ac682290e894dda374e2a742424aae9118b258a6cf7a3  deno-x86_64-unknown-linux-gnu.zip"
unzip deno-x86_64-unknown-linux-gnu.zip
mkdir --parents ~/.local/bin
mv deno ~/.local/bin/
"${HOME}"/.local/bin/deno upgrade

tee >/dev/null --append "${HOME}/.bashrc" <<'END'
export PATH="${HOME}/.local/bin:${PATH}"
export SF_REPO="/workspaces/web-xforge"
# Help unit tests not hang by going directly to this.
export CHROMIUM_BIN="/opt/brave.com/brave/brave"
END

echo "=== Post-create setup complete ==="

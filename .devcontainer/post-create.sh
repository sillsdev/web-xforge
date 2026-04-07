#!/bin/bash
# Post-create setup script for the Scripture Forge devcontainer.
# This runs after the container is created and sets up the development environment.
set -euo pipefail

echo "=== Restoring .NET tools ==="
sudo dotnet workload update
dotnet tool restore

echo "=== Restoring .NET packages ==="
dotnet restore

echo "=== Installing RealtimeServer npm packages ==="
cd src/RealtimeServer
npm ci

echo "=== Installing ClientApp npm packages ==="
cd ../SIL.XForge.Scripture/ClientApp
npm ci

echo "=== Post-create setup complete ==="

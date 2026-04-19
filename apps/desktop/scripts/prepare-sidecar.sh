#!/usr/bin/env bash
# prepare-sidecar.sh — Download Node.js + install OpenClaw for Desktop sidecar
# Usage: bash apps/desktop/scripts/prepare-sidecar.sh [win-x64|darwin-arm64|darwin-x64]

set -euo pipefail

PLATFORM="${1:-win-x64}"
NODE_VERSION="v22.22.2"
OPENCLAW_VERSION="2026.4.2"
SIDECAR_DIR="apps/desktop/sidecar/${PLATFORM}"

echo "=== Preparing sidecar for ${PLATFORM} ==="

# Create directory
mkdir -p "${SIDECAR_DIR}"
cd "${SIDECAR_DIR}"

# Install OpenClaw
if [ ! -d "node_modules/openclaw" ]; then
  echo "[1/2] Installing openclaw@${OPENCLAW_VERSION}..."
  npm init -y 2>/dev/null
  npm install "openclaw@${OPENCLAW_VERSION}" --omit=dev --no-save
else
  echo "[1/2] openclaw already installed, skipping"
fi

# Download Node.js standalone binary
if [ "${PLATFORM}" = "win-x64" ]; then
  NODE_BIN="node.exe"
  NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/win-x64/node.exe"
elif [ "${PLATFORM}" = "darwin-arm64" ]; then
  NODE_BIN="node"
  NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/darwin-arm64/bin/node"
elif [ "${PLATFORM}" = "darwin-x64" ]; then
  NODE_BIN="node"
  NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/darwin-x64/bin/node"
else
  echo "Unknown platform: ${PLATFORM}"
  exit 1
fi

if [ ! -f "${NODE_BIN}" ]; then
  echo "[2/2] Downloading Node.js ${NODE_VERSION} for ${PLATFORM}..."
  curl -L -o "${NODE_BIN}" "${NODE_URL}"
  if [ "${PLATFORM}" != "win-x64" ]; then
    chmod +x "${NODE_BIN}"
  fi
else
  echo "[2/2] ${NODE_BIN} already exists, skipping"
fi

echo ""
echo "=== Sidecar ready ==="
echo "  Node.js: ${NODE_BIN} (${NODE_VERSION})"
echo "  OpenClaw: node_modules/openclaw (${OPENCLAW_VERSION})"
echo "  Location: ${SIDECAR_DIR}/"

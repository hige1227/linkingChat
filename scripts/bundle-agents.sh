#!/usr/bin/env bash
# Run by CI / electron-builder beforeBuild hook.
# Requires: curl, node/npm available in CI environment.
set -euo pipefail

RESOURCES_DIR="${RESOURCES_DIR:-apps/desktop/resources}"
PLATFORM="${TARGET_PLATFORM:-$(uname -s | tr '[:upper:]' '[:lower:]')}"
ARCH="${TARGET_ARCH:-$(uname -m)}"

echo "==> Bundling OpenClaw sidecar..."
mkdir -p "${RESOURCES_DIR}/openclaw-sidecar"
npm install openclaw@2.0.0 --prefix "${RESOURCES_DIR}/openclaw-sidecar" --no-save
echo "    OpenClaw done."

echo "==> Downloading Python runtime (${PLATFORM}/${ARCH})..."
case "${PLATFORM}-${ARCH}" in
  darwin-arm64|darwin-aarch64)
    PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.11.10+20241016-aarch64-apple-darwin-install_only.tar.gz"
    ;;
  darwin-x86_64)
    PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.11.10+20241016-x86_64-apple-darwin-install_only.tar.gz"
    ;;
  windows-x86_64|mingw*-x86_64|msys*-x86_64)
    PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.11.10+20241016-x86_64-pc-windows-msvc-install_only.tar.gz"
    ;;
  linux-x86_64)
    PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.11.10+20241016-x86_64-unknown-linux-gnu-install_only.tar.gz"
    ;;
  linux-aarch64|linux-arm64)
    PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.11.10+20241016-aarch64-unknown-linux-gnu-install_only.tar.gz"
    ;;
  *)
    echo "Unsupported platform: ${PLATFORM}-${ARCH}" >&2; exit 1 ;;
esac

mkdir -p "${RESOURCES_DIR}/hermes-env"
curl -L "$PYTHON_URL" | tar -xz -C "${RESOURCES_DIR}/hermes-env/" --strip-components=1

if [[ "$PLATFORM" == "windows"* ]] || [[ "$PLATFORM" == "mingw"* ]] || [[ "$PLATFORM" == "msys"* ]]; then
  PYTHON_BIN="${RESOURCES_DIR}/hermes-env/python.exe"
  PIP_BIN="${RESOURCES_DIR}/hermes-env/lib/Scripts/pip"
else
  PYTHON_BIN="${RESOURCES_DIR}/hermes-env/bin/python3.11"
  PIP_BIN="${RESOURCES_DIR}/hermes-env/lib/bin/pip"
fi

echo "==> Creating Hermes venv (offline)..."
"$PYTHON_BIN" -m venv "${RESOURCES_DIR}/hermes-env/lib"
"$PIP_BIN" install hermes-agent --no-index --find-links vendor/hermes-wheels/

echo "==> Bundle complete. Total size:"
du -sh "${RESOURCES_DIR}/"

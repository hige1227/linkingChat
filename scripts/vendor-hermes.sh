#!/usr/bin/env bash
# Run once by a maintainer when pinning a new hermes-agent version.
# Commit the resulting vendor/hermes-wheels/ directory to the repo.
set -euo pipefail

VENDOR_DIR="vendor/hermes-wheels"
HERMES_VERSION="${1:-0.1.0}"

mkdir -p "$VENDOR_DIR"
pip download "hermes-agent==${HERMES_VERSION}" -d "$VENDOR_DIR"
echo "Done. Commit ${VENDOR_DIR}/ to the repo."

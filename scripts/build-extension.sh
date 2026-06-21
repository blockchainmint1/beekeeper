#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public
rm -f public/honest-money-extension.zip
test -f extension/shared/protocol.js
(cd extension && nix run nixpkgs#zip -- -r ../public/honest-money-extension.zip . \
  -x '*.DS_Store' '*/node_modules/*')
echo "Built: public/honest-money-extension.zip"
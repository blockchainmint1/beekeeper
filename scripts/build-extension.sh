#!/usr/bin/env bash
# Packages extension/ into public/honest-money-extension.zip.
#
# The checked-in manifest keeps http://localhost:8080 in externally_connectable
# so the extension can talk to the dev server. That entry must never ship: any
# local process able to bind :8080 could otherwise drive the signing popup.
# Pass --dev to keep it.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public
rm -f public/honest-money-extension.zip
test -f extension/shared/protocol.js

KEEP_LOCALHOST=0
if [[ "${1:-}" == "--dev" ]]; then KEEP_LOCALHOST=1; fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R extension/. "$STAGE/"

if [[ "$KEEP_LOCALHOST" -eq 0 ]]; then
  node -e '
    const fs = require("fs");
    const p = process.argv[1] + "/manifest.json";
    const m = JSON.parse(fs.readFileSync(p, "utf8"));
    const before = m.externally_connectable?.matches ?? [];
    const after = before.filter((x) => !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(x));
    if (after.length !== before.length) {
      m.externally_connectable.matches = after;
      fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
      console.log("Stripped dev origins:", before.filter((x) => !after.includes(x)).join(", "));
    }
    if (after.length === 0) throw new Error("manifest has no externally_connectable origins left");
  ' "$STAGE"
else
  echo "WARNING: --dev build keeps localhost in externally_connectable. Do not publish."
fi

(cd "$STAGE" && nix run nixpkgs#zip -- -r "$OLDPWD/public/honest-money-extension.zip" . \
  -x '*.DS_Store' '*/node_modules/*')
echo "Built: public/honest-money-extension.zip"

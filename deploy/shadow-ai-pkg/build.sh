#!/bin/bash
# Builds Governly-ShadowAI.pkg for Jamf: a standalone universal scanner (no Python needed on the Mac)
# plus a LaunchAgent that scans at login and daily. Run on a Mac with python.org's universal Python.
#   SIGN_APP="Developer ID Application: ..." SIGN_PKG="Developer ID Installer: ..." ./build.sh   # signed
#   ./build.sh                                                                                 # unsigned
set -euo pipefail
cd "$(dirname "$0")"
VERSION=${VERSION:-1.0.0}
WORK=$(mktemp -d)
OUT=../../apps/web/public/downloads/Governly-ShadowAI.pkg

python3 -m venv "$WORK/venv"
"$WORK/venv/bin/pip" -q install pyinstaller==6.11.1
"$WORK/venv/bin/pyinstaller" --log-level WARN --onefile --target-arch universal2 --name shadow-ai-scan \
  --distpath "$WORK/dist" --workpath "$WORK/build" --specpath "$WORK" \
  ${SIGN_APP:+--codesign-identity "$SIGN_APP"} ../../apps/web/public/shadow-ai-scan.py

ROOT="$WORK/root"
mkdir -p "$ROOT/Library/Application Support/Governly" "$ROOT/Library/LaunchAgents"
cp "$WORK/dist/shadow-ai-scan" "$ROOT/Library/Application Support/Governly/"
cp ai.kentron.shadow-ai.plist "$ROOT/Library/LaunchAgents/"

mkdir -p "$(dirname "$OUT")"
pkgbuild --root "$ROOT" --scripts scripts --identifier ai.kentron.shadow-ai --version "$VERSION" \
  --install-location / ${SIGN_PKG:+--sign "$SIGN_PKG"} "$OUT"
rm -rf "$WORK"
echo "Built $OUT"
# ponytail: notarization (xcrun notarytool submit ... --wait && xcrun stapler staple) once there's a Developer ID.

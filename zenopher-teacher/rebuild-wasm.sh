#!/bin/sh
# Rebuilds the teacher WASM from zenopher-teacher into the frontend's generated/ dir.
# Run from the repo root:  sh zenopher-teacher/rebuild-wasm.sh
# Requires: rustup target wasm32-unknown-unknown + wasm-pack.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEACHER="$ROOT/zenopher-teacher"
OUT="$ROOT/frontend/src/teacher/generated"
TMP="$TEACHER/target/tmp-wasm-pkg"

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "wasm-pack not found. Install: cargo install wasm-pack" >&2
  exit 1
fi

rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true

rm -rf "$TMP"
mkdir -p "$TMP"
(cd "$TEACHER" && wasm-pack build --target web --features wasm --out-dir "$TMP" --out-name zenopher_teacher)

mkdir -p "$OUT"
cp "$TMP/zenopher_teacher.js" "$TMP/zenopher_teacher.d.ts" "$OUT/"
cp "$TMP/zenopher_teacher_bg.wasm" "$OUT/"
cp "$TMP/zenopher_teacher_bg.wasm.d.ts" "$OUT/" 2>/dev/null || true
rm -rf "$TMP"

echo "WASM rebuilt -> $OUT"
ls -lh "$OUT" | head -n 10

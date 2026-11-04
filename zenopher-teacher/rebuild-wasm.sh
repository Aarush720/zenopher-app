#!/bin/sh
# Rebuilds the teacher WASM from zenopher-teacher into the frontend's generated/ dir.
# Run from the repo root:  sh zenopher-teacher/rebuild-wasm.sh
# Requires the wasm32 target plus wasm-pack, or cargo and a matching wasm-bindgen CLI.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEACHER="$ROOT/zenopher-teacher"
OUT="$ROOT/frontend/src/teacher/generated"
mkdir -p "$TEACHER/target"
TMP="$(mktemp -d "$TEACHER/target/teacher-wasm.XXXXXX")"
trap 'rm -rf -- "$TMP"' EXIT HUP INT TERM

if command -v wasm-pack >/dev/null 2>&1; then
  (cd "$TEACHER" && wasm-pack build --release --locked --target web --features wasm --out-dir "$TMP" --out-name zenopher_teacher)
elif command -v wasm-bindgen >/dev/null 2>&1; then
  (cd "$TEACHER" && cargo build --release --locked --features wasm --target wasm32-unknown-unknown)
  wasm-bindgen --target web --out-dir "$TMP" --out-name zenopher_teacher "$TEACHER/target/wasm32-unknown-unknown/release/zenopher_teacher.wasm"
else
  echo "Install wasm-pack or wasm-bindgen-cli (matching Cargo.lock), and the wasm32-unknown-unknown target." >&2
  exit 1
fi

mkdir -p "$OUT"
cp "$TMP/zenopher_teacher.js" "$TMP/zenopher_teacher.d.ts" "$OUT/"
cp "$TMP/zenopher_teacher_bg.wasm" "$OUT/"
cp "$TMP/zenopher_teacher_bg.wasm.d.ts" "$OUT/" 2>/dev/null || true

echo "WASM rebuilt -> $OUT"
ls -lh "$OUT" | head -n 10

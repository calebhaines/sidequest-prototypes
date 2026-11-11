#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo "Native VST3/AU builds require macOS and its SDK. Portable runtime tests can run on Linux." >&2
  exit 2
fi
node plugins/scripts/generate.mjs
kitchen_arch="${KITCHEN_ARCHITECTURES:-arm64}"
kitchen_build="${KITCHEN_BUILD_DIRECTORY:-plugins/build}"
cmake -S plugins -B "$kitchen_build" -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES="$kitchen_arch" -DKITCHEN_BUILD_AU="${KITCHEN_BUILD_AU:-ON}" -DKITCHEN_PRODUCTS="${KITCHEN_PRODUCTS:-}"
cmake --build "$kitchen_build" --config Release --parallel "${KITCHEN_BUILD_JOBS:-3}"
ctest --test-dir "$kitchen_build" --output-on-failure

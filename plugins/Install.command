#!/bin/bash
set -euo pipefail
if [[ "$(uname -s)" != Darwin ]]; then
  echo "These plugins require an Apple Silicon Mac."
  exit 1
fi
if [[ "$(uname -m)" != arm64 ]]; then
  echo "This package contains arm64 plugins. Run this installer natively on Apple Silicon."
  exit 1
fi
kitchen_package="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
kitchen_installed=0
shopt -s nullglob
for kitchen_format in VST3 Components; do
  kitchen_destination="$HOME/Library/Audio/Plug-Ins/$kitchen_format"
  mkdir -p "$kitchen_destination"
  for kitchen_bundle in "$kitchen_package/$kitchen_format/"*; do
    [[ -d "$kitchen_bundle" ]] || continue
    kitchen_name="$(basename -- "$kitchen_bundle")"
    [[ "$kitchen_name" == Kitchen\ *.vst3 || "$kitchen_name" == Kitchen\ *.component ]] || continue
    /usr/bin/codesign --verify --deep --strict "$kitchen_bundle"
    /usr/bin/ditto "$kitchen_bundle" "$kitchen_destination/$kitchen_name"
    # The preview is ad-hoc signed. Remove quarantine only from these verified
    # Kitchen bundles, so a DAW can load them without a notarization ticket.
    /usr/bin/xattr -dr com.apple.quarantine "$kitchen_destination/$kitchen_name" 2>/dev/null || true
    kitchen_installed=$((kitchen_installed + 1))
    echo "Installed $kitchen_name"
  done
done
if [[ "$kitchen_installed" -eq 0 ]]; then
  echo "No Kitchen bundles found. Keep this installer beside VST3 and Components."
  exit 1
fi
echo "Installed $kitchen_installed bundles. Restart or rescan plugins in your DAW."
echo "The README includes MIDI mappings, DAW pattern sync and compatibility notes."

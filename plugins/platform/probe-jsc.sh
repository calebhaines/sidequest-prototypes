#!/bin/bash
set -euo pipefail
kitchen_probe_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
clang++ -std=c++17 "$kitchen_probe_root/Source/JSCProbe.cpp" -framework JavaScriptCore -o /tmp/kitchen-jsc-probe-base
for kitchen_probe_kind in unsigned hardened-strict hardened-unsigned hardened-jit signed; do
    kitchen_probe_binary="/tmp/kitchen-jsc-probe-$kitchen_probe_kind"
    cp /tmp/kitchen-jsc-probe-base "$kitchen_probe_binary"
    case "$kitchen_probe_kind" in
        hardened-strict) codesign --force --sign - --options runtime --entitlements "$kitchen_probe_root/platform/JitStrict.entitlements" "$kitchen_probe_binary" ;;
        hardened-unsigned) codesign --force --sign - --options runtime --entitlements "$kitchen_probe_root/platform/JitUnsignedMemory.entitlements" "$kitchen_probe_binary" ;;
        hardened-jit) codesign --force --sign - --options runtime --entitlements "$kitchen_probe_root/platform/Jit.entitlements" "$kitchen_probe_binary" ;;
        signed) codesign --force --sign - --entitlements "$kitchen_probe_root/platform/Jit.entitlements" "$kitchen_probe_binary" ;;
    esac
    JSC_dumpOptions=2 "$kitchen_probe_binary" > "/tmp/kitchen-jsc-$kitchen_probe_kind.json" 2> "/tmp/kitchen-jsc-$kitchen_probe_kind-options.log"
done
cp /tmp/kitchen-jsc-signed.json /tmp/kitchen-jsc-capabilities.json
python3 - <<'PY'
import pathlib,json,re
for kind in ['unsigned','hardened-strict','hardened-unsigned','hardened-jit','signed']:
    data=json.loads(pathlib.Path('/tmp/kitchen-jsc-'+kind+'.json').read_text())
    options=pathlib.Path('/tmp/kitchen-jsc-'+kind+'-options.log').read_text()
    data['signing']=kind
    data['jitOptions']={name:re.findall(r'\b'+name+r'\s*=\s*([^\s;]+)',options) for name in ['useJIT','useBaselineJIT','useDFGJIT','useFTLJIT']}
    pathlib.Path('/tmp/kitchen-jsc-'+kind+'.json').write_text(json.dumps(data,indent=2)+'\n')
    print(json.dumps(data))
    print('::notice title=JavaScriptCore '+kind+'::'+json.dumps(data))
PY

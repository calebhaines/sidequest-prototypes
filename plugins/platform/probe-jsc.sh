#!/bin/bash
set -euo pipefail
kitchen_probe_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
clang++ -std=c++17 "$kitchen_probe_root/Source/JSCProbe.cpp" -framework JavaScriptCore -o /tmp/kitchen-jsc-probe
JSC_dumpOptions=2 /tmp/kitchen-jsc-probe > /tmp/kitchen-jsc-unsigned.json 2> /tmp/kitchen-jsc-unsigned-options.log
codesign --force --sign - --entitlements "$kitchen_probe_root/platform/Jit.entitlements" /tmp/kitchen-jsc-probe
JSC_dumpOptions=2 /tmp/kitchen-jsc-probe > /tmp/kitchen-jsc-signed.json 2> /tmp/kitchen-jsc-signed-options.log
cp /tmp/kitchen-jsc-signed.json /tmp/kitchen-jsc-capabilities.json
python3 - <<'PY'
import pathlib,json,re
for kind in ['unsigned','signed']:
    data=json.loads(pathlib.Path('/tmp/kitchen-jsc-'+kind+'.json').read_text())
    options=pathlib.Path('/tmp/kitchen-jsc-'+kind+'-options.log').read_text()
    data['signing']=kind
    data['jitOptions']={name:re.findall(r'\b'+name+r'\s*=\s*([^\s;]+)',options) for name in ['useJIT','useBaselineJIT','useDFGJIT','useFTLJIT']}
    pathlib.Path('/tmp/kitchen-jsc-'+kind+'.json').write_text(json.dumps(data,indent=2)+'\n')
    print(json.dumps(data))
PY

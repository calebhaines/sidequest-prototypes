"""Validate playable WAV data, provenance, dynamic layers, bundle sizes and kit references."""
from pathlib import Path
import base64, hashlib, io, json, wave, collections
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
factory=json.loads((ROOT/'factory-samples.json').read_text())
paths=[ROOT/'factory-samples.json']+[ROOT/b['url'] for b in factory['bundles']]
all_samples={};summary=[];origin_counts=collections.Counter()
for path in paths:
 m=json.loads(path.read_text());assert m['format']=='kitchen-batter-library' and m['version']==1
 ids=set();decoded=0;peaks=[]
 assert m['licenseText'] and m['licenseUrl'] and m['attribution']
 if path.name!='factory-samples.json':assert path.stat().st_size<50_000_000
 for s in m['samples']:
  assert s['id'] not in ids;ids.add(s['id'])
  assert s['source'].startswith('https://') and s['licenseUrl'].startswith('https://') and s['attribution'] and s['originalPath']
  assert 0<=s['velocity']<=1 and s['roundRobin']>=1
  raw=base64.b64decode(s['base64'],validate=True)
  assert hashlib.sha256(raw).hexdigest()==s['sha256']
  with wave.open(io.BytesIO(raw),'rb') as w:
   assert w.getsampwidth()==2 and w.getframerate()==s['sampleRate'] and w.getnchannels()==s['channels'] and w.getnframes()==s['frames']
   pcm=w.readframes(w.getnframes())
  x=np.frombuffer(pcm,dtype='<i2').astype(np.int32)
  peak=int(np.max(np.abs(x)));assert peak>0,'Silent factory sample: '+s['id']
  peaks.append(peak/32768);decoded+=s['frames']*s['channels']*4
  if s['id'] in all_samples:assert all_samples[s['id']]['sha256']==s['sha256']
  else:all_samples[s['id']]=s;origin_counts[s['kit']]+=1
  if s['kit']=='rope-tension':assert s['musicLicenseException'] is False and s['channels']==2
  else:assert s['musicLicenseException'] is True
 if path.name=='factory-samples.json':
  assert len(ids)==84 and all(s['kit']!='rope-tension' for s in m['samples'])
  assert len(m['kits'])==3
  for kit in m['kits']:
   assert len(kit['lanes'])==12 and kit['musicLicenseException'] is True
   for lane in kit['lanes']:assert lane['sampleId'] in lane['sampleIds'] and set(lane['sampleIds'])<=ids
 summary.append({'file':path.name,'samples':len(ids),'jsonBytes':path.stat().st_size,'decodedFloat32BytesAt44100':decoded,'maxSamplePeak':round(max(peaks),6)})
for path in paths:
 m=json.loads(path.read_text())
 for kit in m['kits']:
  assert len(kit['lanes'])==12
  for lane in kit['lanes']:
   assert lane['sampleId'] in lane['sampleIds'] and set(lane['sampleIds'])<=set(all_samples)
   values=[all_samples[i] for i in lane['sampleIds']]
   if kit['id']=='rope-tension' and lane['type'] in ['kick','snare','rim','closedHat','tomLow','tomMid','percussion']:
    counts=collections.Counter(v['velocity'] for v in values);assert max(counts.values())>=3
for b in factory['bundles']:
 assert (ROOT/b['url']).stat().st_size==b['bytes']
 assert len(json.loads((ROOT/b['url']).read_text())['samples'])==b['sampleCount']
assert len(all_samples)==641
print(json.dumps({'passed':True,'recordedEntries':len(all_samples),'byteDistinctWavEntries':len({s['sha256'] for s in all_samples.values()}),'kits':dict(origin_counts),'collections':summary},indent=2))

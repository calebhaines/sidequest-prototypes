from pathlib import Path
import os,tempfile
import tarfile,re,json,struct,io,wave,base64,hashlib,math
import numpy as np
from scipy.signal import resample_poly
ROOT=Path(__file__).resolve().parents[2];ACQ=Path(os.environ.get('BATTER_SAMPLE_WORKSPACE',str(Path(tempfile.gettempdir())/'kitchen-batter-sources')))
SOURCE='https://archive.org/details/SalamanderDrumkit'
LIC='CC BY-SA 3.0';LURL='https://creativecommons.org/licenses/by-sa/3.0/'
ATTR='Salamander Drumkit recordings: Alexander Holm. BATTER Rope tension adaptation: Kitchen.'
# Distinct strikes in several original dynamic layers. Long cymbal recordings retain their full tails.
CFG={'kick2':('kick',['P','F','FF'],3),'snare2':('snare',['Ghost','MP','F','FF'],3),'snareStick':('rim',['F'],3),'hihatClosed':('closedHat',['P','F'],4),'hihatOpen':('openHat',['P','F','FF'],1),'ride1':('ride',['MP','FF'],1),'crash3':('crash',['FF'],3),'loTom':('tomLow',['PP','MP','FF'],3),'hiTom':('tomMid',['P','F','FF'],3),'snareOFF':('snare',['F'],3),'cowbell':('percussion',['P','MP','FF'],3)}
# Read the original SFZ mapping to preserve dynamic ranges and original per-articulation gain information.
mapdata={};group={}
for line in (ACQ/'salamander-ALL.sfz').read_text().splitlines():
 line=line.split('//',1)[0]
 if '<group>' in line:group=dict(re.findall(r'(\w+)=([^\s]+)',line))
 if '<region>' in line:
  r=dict(re.findall(r'(\w+)=([^\s]+)',line));p=r.get('sample','').replace('\\','/')
  if p:mapdata[p]=dict(group,**r)
selected={}
for m in json.loads((ACQ/'salamander-members.json').read_text()):
 match=re.match(r'(.+?)_(?:OH_)?(Ghost|FF|MP|PP|F|P)_(\d+)\.wav$',Path(m['name']).name)
 if not match:continue
 art,dyn,num=match.groups()
 if art in CFG and dyn in CFG[art][1] and int(num)<=CFG[art][2]:selected[m['name']]=(art,dyn,int(num))
print('SELECTED',len(selected),flush=True)

def wav_pcm24(data):
 fmt=None;pcm=None;o=12
 while o+8<=len(data):
  tag,n=struct.unpack_from('<4sI',data,o);p=o+8
  if tag==b'fmt ':fmt=struct.unpack_from('<HHIIHH',data,p)
  if tag==b'data':pcm=data[p:p+n]
  o=p+n+(n%2)
 assert fmt and pcm and fmt[0]==1 and fmt[5]==24,(fmt,len(data))
 channels,rate=fmt[1],fmt[2]
 b=np.frombuffer(pcm,dtype=np.uint8).reshape(-1,3)
 x=b[:,0].astype(np.int32)|(b[:,1].astype(np.int32)<<8)|(b[:,2].astype(np.int32)<<16)
 x=np.where(x&0x800000,x-0x1000000,x).astype(np.float64)/8388608
 return x.reshape(-1,channels),rate,channels
samples=[]
with tarfile.open(ACQ/'salamanderDrumkit.tar.bz2','r|bz2') as tar:
 for member in tar:
  if not member.isfile() or member.name not in selected:continue
  # Archive paths are never extracted. Only preselected audio byte streams are decoded.
  original=tar.extractfile(member).read();art,dyn,rr=selected[member.name]
  x,rate,channels=wav_pcm24(original)
  divisor=math.gcd(44100,rate)
  y=resample_poly(x,44100//divisor,rate//divisor,axis=0,window=('kaiser',8.6))
  # Deterministic triangular dither before 24-to-16-bit conversion.
  seed=int(hashlib.sha256(member.name.encode()).hexdigest()[:16],16)
  rng=np.random.default_rng(seed);dither=(rng.random(y.shape)-rng.random(y.shape))/32768
  pcm=np.clip(np.round((y+dither)*32768),-32768,32767).astype('<i2').tobytes()
  target=io.BytesIO()
  with wave.open(target,'wb') as w:w.setnchannels(channels);w.setsampwidth(2);w.setframerate(44100);w.writeframes(pcm)
  wb=target.getvalue();sfz=mapdata.get(member.name,{})
  lo=int(sfz.get('lovel',1));hi=int(sfz.get('hivel',127));v=(lo+hi)/2/127
  pretty={'kick2':'Kick · damped','snare2':'Snare · dry head','snareStick':'Side stick','hihatClosed':'Closed hat','hihatOpen':'Open hat','ride1':'Ride','crash3':'Crash · Stagg','loTom':'Floor tom','hiTom':'Rack tom','snareOFF':'Snare · wires off','cowbell':'Cowbell'}[art]
  sample=dict(id=f'rope-tension-{art.lower()}-{dyn.lower()}-{rr:02d}',name=f'{pretty} · {dyn} · RR{rr}',type=CFG[art][0],kit='rope-tension',articulation=art,velocity=round(v,6),velocityRange=[round(lo/127,6),round(hi/127,6)],originalVelocityRange=[lo,hi],roundRobin=rr,sampleRate=44100,channels=channels,frames=len(y),duration=round(len(y)/44100,4),base64=base64.b64encode(wb).decode(),mime='audio/wav',license=LIC,licenseUrl=LURL,source=SOURCE,originalPath=member.name,attribution=ATTR,musicLicenseException=False,sourceGainDb=float(sfz.get('volume',0)),modifications='Converted original recorded stereo 48 kHz PCM24 overhead-microphone WAV to stereo 44.1 kHz PCM16 using polyphase resampling and deterministic triangular dither; full original recording tail retained.',sha256=hashlib.sha256(wb).hexdigest(),originalSha256=hashlib.sha256(original).hexdigest())
  samples.append(sample)
  print('CONVERTED',member.name,len(wb),flush=True)
samples.sort(key=lambda s:(list(CFG).index(s['articulation']),s['velocity'],s['roundRobin']))
assert len(samples)==len(selected)
lanemap=[('kick','kick2','Kick'),('snare','snare2','Snare'),('rim','snareStick','Side stick'),('closedHat','hihatClosed','Closed hat'),('openHat','hihatOpen','Open hat'),('ride','ride1','Ride'),('crash','crash3','Crash'),('tomLow','loTom','Floor tom'),('tomMid','hiTom','Rack tom'),('tomHigh','snareOFF','Snare wires off'),('clap',None,'Hand clap · Iron service'),('percussion','cowbell','Cowbell')]
lanes=[]
for typ,art,name in lanemap:
 ids=[s['id'] for s in samples if s['articulation']==art] if art else ['iron-service-39-05']
 lanes.append(dict(type=typ,name=name,sampleIds=ids,sampleId=ids[-1]))
notes='CC BY-SA 3.0 applies to this sample pack. Unlike the AVL factory collections, the original Salamander notice provides no separate produced-music exception. Keep attribution and follow the source license when creating or distributing adaptations.'
kit=dict(id='rope-tension',name='Rope tension',origin='Salamander Drumkit',author='Alexander Holm',license=LIC,licenseUrl=LURL,source=SOURCE,attribution=ATTR,musicLicenseException=False,licenseNotes=notes,lanes=lanes,description='Recorded handmade birch-stave drum kit, stereo overhead microphones, real alternate strikes at several dynamics. The clap lane uses an AVL starter sample, credited separately.')
manifest=dict(conversionToolVersions={'numpy':'2.3.5','scipy':'1.17.0'},licenseText=(ACQ/'Salamander-REAMDE.txt').read_text(),format='kitchen-batter-library',version=1,samples=samples,kits=[kit],bundles=[],license=LIC,licenseUrl=LURL,attribution=ATTR,musicLicenseException=False,licenseNotes=notes)
out=ROOT/'samples/kit-rope-tension.json';out.write_text(json.dumps(manifest,separators=(',',':'),ensure_ascii=False,sort_keys=True)+'\n')
(ROOT/'samples/Salamander-original-REAMDE.txt').write_text((ACQ/'Salamander-REAMDE.txt').read_text())
size=out.stat().st_size;assert size<50000000,(size,'Must stay below50 MB')
factory_path=ROOT/'factory-samples.json';factory=json.loads(factory_path.read_text());factory['bundles']=[b for b in factory['bundles'] if b['id']!='rope-tension']
factory['bundles'].append(dict(id='rope-tension',name='Rope tension · optional RR',kitId='rope-tension',url='samples/kit-rope-tension.json',sampleCount=len(samples),bytes=size,license=LIC,licenseUrl=LURL,source=SOURCE,origin='Salamander Drumkit',author='Alexander Holm',attribution=ATTR,musicLicenseException=False,licenseNotes=notes,optional=True,description='Recorded stereo acoustic kit. Real alternate strikes per dynamic layer for kick/snare/hats/toms/percussion; original cymbal tails preserved. Plain CC BY-SA3, without the AVL music exception.'))
factory_path.write_text(json.dumps(factory,separators=(',',':'),ensure_ascii=False,sort_keys=True)+'\n')
summary=dict(samples=len(samples),bytes=size,decodedBytes=sum(s['frames']*s['channels']*4 for s in samples),uniqueAudio=len({s['sha256'] for s in samples}),stereoSamples=sum(s['channels']==2 for s in samples),minDuration=min(s['duration'] for s in samples),maxDuration=max(s['duration'] for s in samples),sampleRates=sorted({s['sampleRate'] for s in samples}))
(ACQ/'salamander-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print('FINISHED',json.dumps(summary),flush=True)

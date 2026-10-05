from pathlib import Path
import os,tempfile
import sys,struct,base64,wave,io,json,hashlib,contextlib,re,math
import numpy as np
sys.path.insert(0,str(Path(__file__).parent))
from inspect_sf2 import read
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'samples'
OUT.mkdir(parents=True,exist_ok=True)
ACQ=Path(os.environ.get('BATTER_SAMPLE_WORKSPACE',str(Path(tempfile.gettempdir())/'kitchen-batter-sources')))
LICENSE='CC BY-SA 3.0'
LICENSE_URL='https://creativecommons.org/licenses/by-sa/3.0/'
AVL_ATTRIBUTION='AVL-Drumkits recordings: Glen MacArthur, 2015. SF2 adaptation: Robin Gareus / x42 contributors. BATTER sample-library adaptation: Kitchen.'
BASE='https://raw.githubusercontent.com/x42/avldrums.lv2/9389f16f139410d9a55f9006976bd54cbd8b7806/sf2/'
LANES=[('kick','36-Kick','Kick'),('snare','38-Snare','Snare'),('rim','37-SideStick','Side stick'),('closedHat','42-HatClosed','Closed hat'),('openHat','46-HatSemi','Half-open hat'),('ride','51-RideTip','Ride tip'),('crash','49-Crash1','Crash'),('tomLow','41-FloorTom','Floor tom'),('tomMid','45-Tom','Rack tom'),('tomHigh','47-TomEdge','Tom rim'),('clap','39-HandClap','Hand clap'),('percussion','54-Tambourine','Tambourine')]
TYPE_BY_MIDI={35:'rim',36:'kick',37:'rim',38:'snare',39:'clap',40:'snare',41:'tomLow',42:'closedHat',43:'tomLow',44:'closedHat',45:'tomMid',46:'openHat',47:'tomHigh',48:'openHat',49:'crash',50:'crash',51:'ride',52:'ride',53:'ride',54:'percussion',55:'crash',56:'percussion',57:'crash',58:'crash',59:'ride',60:'crash',61:'percussion'}
CONFIG=[('iron-service','Iron service','Black Pearl 4','Black_Pearl_4_LV2.sf2',{1,3,5}),('red-service','Red service','Red Zeppelin 4','Red_Zeppelin_4_LV2.sf2',{2,5}),('late-lunch','Late lunch','Blonde Bop','Blonde_Bop_LV2.sf2',{2,5}),('pantry-percussion','Pantry percussion',"Buskman’s Holiday",'Buskmans_Holiday_LV2.sf2',set())]

def wave_bytes(pcm,rate,channels=1):
 o=io.BytesIO()
 with wave.open(o,'wb') as w:w.setnchannels(channels);w.setsampwidth(2);w.setframerate(rate);w.writeframes(pcm)
 return o.getvalue()

def write_manifest(path,m):
 path.write_text(json.dumps(m,separators=(',',':'),ensure_ascii=False,sort_keys=True)+'\n')
 return path.stat().st_size

def base_manifest():return dict(licenseText=(ACQ/'AVL-README.txt').read_text(),sourceRevision='9389f16f139410d9a55f9006976bd54cbd8b7806',format='kitchen-batter-library',version=1,samples=[],kits=[],bundles=[],license=LICENSE,licenseUrl=LICENSE_URL,attribution=AVL_ATTRIBUTION,musicLicenseException='AVL-Drumkits: produced music and other non-sample-library works can be licensed freely. Modified samples and new sample libraries remain CC BY-SA 3.0.')

def kit_definition(kid,name,origin,filename,samples):
 lanes=[]
 if kid!='pantry-percussion':
  for typ,prefix,label in LANES:
   ids=[s['id'] for s in samples if s['originalPath'].rsplit('-',1)[0].lower()==prefix.lower()]
   if not ids:raise ValueError((kid,prefix))
   lanes.append(dict(type=typ,name=label,sampleIds=ids,sampleId=ids[-1]))
 else:
  bm=[('kick','36-CajonThump','Cajon thump'),('snare','38-CajonSlap-L','Cajon slap · left'),('rim','35-StickClick','Stick click'),('closedHat','42-Shakers','Shakers'),('openHat','44-ShakeTamb','Shaken tambourine'),('ride','50-CymbalBell','Cymbal bell'),('crash','49-Cymbal','Cymbal'),('tomLow','41-CongaLg-L','Large conga · left'),('tomMid','45-CongaSm-L','Small conga · left'),('tomHigh','47-CongaSm-R','Small conga · right'),('clap','39-HandClaps','Hand claps'),('percussion','51-Cowbell','Cowbell')]
  for typ,prefix,label in bm:
   ids=[s['id'] for s in samples if s['originalPath'].rsplit('-',1)[0]==prefix]
   if ids:lanes.append(dict(type=typ,name=label,sampleIds=ids,sampleId=ids[-1]))
 return dict(id=kid,name=name,origin=origin,author='Glen MacArthur',license=LICENSE,licenseUrl=LICENSE_URL,source=BASE+filename,attribution=AVL_ATTRIBUTION,musicLicenseException=True,lanes=lanes)

starter=base_manifest(); summary=[]
for kid,name,origin,filename,starter_layers in CONFIG:
 with contextlib.redirect_stdout(io.StringIO()):tables,hdrs,inst,bags,gens=read(ACQ/filename)
 velranges={}
 for i,(iname,start) in enumerate(inst):
  end=inst[i+1][1] if i+1<len(inst) else len(bags)-1
  for b in range(start,end):
   z=dict(gens[bags[b][0]:bags[b+1][0]])
   if 53 in z:
    v=z.get(44,127<<8);velranges[z[53]]=(v&255,v>>8)
 samples=[]
 for i,h in enumerate(hdrs):
  if h['kind']==2:continue
  if h['kind'] not in (1,4):raise ValueError('Unexpected ROM SF2 sample')
  channels=1
  pcm=tables['smpl'][h['start']*2:h['end']*2]
  if h['kind']==4:
   right=hdrs[h['link']];channels=2
   assert right['kind']==2 and right['rate']==h['rate'] and right['end']-right['start']==h['end']-h['start']
   rpcm=tables['smpl'][right['start']*2:right['end']*2]
   pcm=np.column_stack((np.frombuffer(pcm,dtype='<i2'),np.frombuffer(rpcm,dtype='<i2'))).astype('<i2').tobytes()
  wb=wave_bytes(pcm,h['rate'],channels);lo,hi=velranges[i]
  mid=(lo+hi)/2/127
  original=h['name'];num=int(re.sub('[LR]$','',original.rsplit('-',1)[1])); midi=int(original.split('-',1)[0]);art=original.split('-',1)[1].rsplit('-',1)[0]
  pretty=re.sub(r'(?<=[a-z])(?=[A-Z])',' ',art).replace('HatSemi','Half-open hat').replace('HatClosed','Closed hat').replace('SideStick','Side stick')
  typ=TYPE_BY_MIDI[midi]
  if kid=='pantry-percussion':
   busk={35:'rim',36:'kick',37:'rim',38:'snare',39:'clap',40:'snare',41:'tomLow',42:'closedHat',43:'tomLow',44:'openHat',45:'tomMid',46:'percussion',47:'tomHigh',48:'percussion',49:'crash',50:'ride',51:'percussion',52:'kick',53:'percussion',54:'percussion',55:'percussion'}
   typ=busk[midi]
  s=dict(id=f'{kid}-{midi}-{num:02d}',name=f'{pretty} · V{num:02d}',type=typ,kit=kid,articulation=art,velocity=round(mid,6),velocityRange=[round(lo/127,6),round(hi/127,6)],originalVelocityRange=[lo,hi],roundRobin=1,sampleRate=h['rate'],channels=channels,frames=h['end']-h['start'],duration=round((h['end']-h['start'])/h['rate'],4),base64=base64.b64encode(wb).decode(),mime='audio/wav',license=LICENSE,licenseUrl=LICENSE_URL,source=BASE+filename,originalPath=original,attribution=AVL_ATTRIBUTION,musicLicenseException=True,modifications='Extracted original PCM sample from SF2 into a WAV container; sample rate and audio samples unchanged.',sha256=hashlib.sha256(wb).hexdigest())
  samples.append(s)
 selected=[s for s in samples if s['originalPath'].rsplit('-',1)[0].lower() in {p.lower() for _,p,_ in LANES} and int(s['originalPath'].rsplit('-',1)[1]) in starter_layers]
 if kid=='pantry-percussion':
  # Embed five real dynamics for short percussion, three for extra articulations,
  # and one full-tail mid-dynamic cymbal/bell. This keeps the starter under 29 MiB.
  pantry_short={35,36,38,39,41,42,44,45,47,51}
  pantry_extra={37,48,52,53}
  selected=[]
  for sample in samples:
   midi,layer=map(int,sample['id'].split('-')[-2:])
   if (midi in pantry_short and layer in {1,3,5,7,10}) or (midi in {49,50} and layer==5) or (midi in pantry_extra and layer in {3,7,10}):selected.append(sample)
  assert len(selected)==64
 if selected:
  starter['samples']+=selected
  starter['kits'].append(kit_definition(kid,name,origin,filename,selected))
 # Split hand percussion by articulation to keep every JSON comfortably below 50 MB.
 groups=[samples] if kid!='pantry-percussion' else [[s for s in samples if int(s['originalPath'].split('-')[0])<=47],[s for s in samples if int(s['originalPath'].split('-')[0])>47]]
 for gi,group in enumerate(groups):
  bundle_id=kid if len(groups)==1 else kid+('-hands' if gi==0 else '-metal')
  bundle_name=name if len(groups)==1 else name+(' · hands' if gi==0 else ' · metal')
  m=base_manifest();m['samples']=group;m['kits']=[kit_definition(kid,name,origin,filename,samples)]
  if len(groups)>1:m['requires']=['pantry-percussion-hands','pantry-percussion-metal']
  path=OUT/f'kit-{bundle_id}.json';size=write_manifest(path,m)
  bundle=dict(id=bundle_id,name=bundle_name,url=f'samples/{path.name}',sampleCount=len(group),bytes=size,license=LICENSE,licenseUrl=LICENSE_URL,source=BASE+filename,origin=origin,attribution=AVL_ATTRIBUTION,kitId=kid,musicLicenseException=True,description='Recorded acoustic drums and percussion. '+('Five' if kid!='pantry-percussion' else 'Ten')+' real dynamic layers. Native 44.1 kHz PCM16 mono.')
  if len(groups)>1:bundle['requires']=['pantry-percussion-hands','pantry-percussion-metal']
  starter['bundles'].append(bundle);summary.append(dict(id=bundle_id,samples=len(group),bytes=size,decodedBytes=sum(s['frames']*s['channels']*4 for s in group),uniqueAudio=len({s['sha256'] for s in group})))
  print(bundle_id,len(group),size,flush=True)
assert len(starter['samples'])==148 and len(starter['kits'])==4
assert len((json.dumps(starter,separators=(',',':'),ensure_ascii=False,sort_keys=True)+'\n').encode())<=29*1024*1024
write_manifest(ROOT/'factory-samples.json',starter)
(OUT/'AVL-Drumkits-original-README.txt').write_text((ACQ/'AVL-README.txt').read_text())
(ACQ/'library-summary.json').write_text(json.dumps(dict(starterSamples=len(starter['samples']),starterBytes=(ROOT/'factory-samples.json').stat().st_size,bundles=summary),indent=2)+'\n')
print('STARTER',len(starter['samples']),(ROOT/'factory-samples.json').stat().st_size,flush=True)

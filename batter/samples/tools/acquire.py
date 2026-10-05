"""Download verified openly licensed source recordings; no sources are saved in the repository."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import os, tempfile, urllib.request, json, hashlib, tarfile
BASE=Path(os.environ.get('BATTER_SAMPLE_WORKSPACE',str(Path(tempfile.gettempdir())/'kitchen-batter-sources')))
BASE.mkdir(parents=True,exist_ok=True)
REV='9389f16f139410d9a55f9006976bd54cbd8b7806'
SF2='https://raw.githubusercontent.com/x42/avldrums.lv2/'+REV+'/sf2/'
FILES={
 'Black_Pearl_4_LV2.sf2':(SF2+'Black_Pearl_4_LV2.sf2','e0542ec19f2816ef4e0d00aeb087e7aa311e888d6f4805f971688bb267c6d405'),
 'Red_Zeppelin_4_LV2.sf2':(SF2+'Red_Zeppelin_4_LV2.sf2','289fc3e30a4859eb74ae14eb08ddef453e8bf8eab3e501772dcf96fd8328a71a'),
 'Blonde_Bop_LV2.sf2':(SF2+'Blonde_Bop_LV2.sf2','7fdb2ab1810604127f06e27f45669e0ed4ffd8d997f1929c0cad5b96a940b979'),
 'Buskmans_Holiday_LV2.sf2':(SF2+'Buskmans_Holiday_LV2.sf2','868a67ff7ce85308d9a5cbbb20fad94a7d8da643a19c7f8e44e0117af6d7cf74'),
 'AVL-README.txt':(SF2+'README','e0b45c42de317438df75da911253669b441f4b0cb0d43f6796d171074aefccd9'),
 'salamanderDrumkit.tar.bz2':('https://archive.org/download/SalamanderDrumkit/salamanderDrumkit.tar.bz2','34e746ec1721bb530b1caf5b17443ae3cde45a2cce1a80e2637e4c11d6f1e3f5')
}
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def download(item):
 name,(url,expected)=item;p=BASE/name
 if p.exists() and digest(p)==expected:return name,'verified cached'
 tmp=p.with_suffix(p.suffix+'.part')
 request=urllib.request.Request(url,headers={'User-Agent':'Kitchen-Batter/1.0 sample-library-acquisition'})
 try:
  with urllib.request.urlopen(request,timeout=60) as response,tmp.open('wb') as target:
   while True:
    b=response.read(1024*1024)
    if not b:break
    target.write(b)
  if digest(tmp)!=expected:raise ValueError('Unexpected source checksum for '+name)
  tmp.replace(p)
 except BaseException:
  tmp.unlink(missing_ok=True);raise
 return name,p.stat().st_size
with ThreadPoolExecutor(max_workers=4) as pool:
 for future in as_completed([pool.submit(download,item) for item in FILES.items()]):print(future.result(),flush=True)
# Stream and validate only known text files. No archive path is extracted to disk.
members=[]
with tarfile.open(BASE/'salamanderDrumkit.tar.bz2','r|bz2') as tar:
 for member in tar:
  if not member.isfile():continue
  if member.name.startswith('/') or '..' in Path(member.name).parts:raise ValueError('Unsafe archive member path')
  members.append({'name':member.name,'size':member.size})
  if member.name=='REAMDE':(BASE/'Salamander-REAMDE.txt').write_bytes(tar.extractfile(member).read())
  if member.name=='ALL.sfz':(BASE/'salamander-ALL.sfz').write_bytes(tar.extractfile(member).read())
(BASE/'salamander-members.json').write_text(json.dumps(members,indent=2)+'\n')
(BASE/'sources.json').write_text(json.dumps({name:url for name,(url,_) in FILES.items()},indent=2)+'\n')
print('Verified source workspace:',BASE)

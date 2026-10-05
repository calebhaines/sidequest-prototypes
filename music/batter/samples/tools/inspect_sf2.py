import struct,sys,pathlib

def chunks(data,start=0,end=None):
 end=end or len(data)
 while start+8<=end:
  tag,size=struct.unpack_from('<4sI',data,start);body=start+8
  yield tag,data[body:body+size]
  start=body+size+(size%2)

def read(path):
 data=pathlib.Path(path).read_bytes();tables={}
 for tag,body in chunks(data,12):
  if tag==b'LIST':
   for k,v in chunks(body,4):tables[k.decode()]=v
 hdrs=[]
 for i in range(0,len(tables['shdr'])-46,46):
  name,s,e,ls,le,rate,pitch,corr,link,kind=struct.unpack_from('<20sIIIIIBbHH',tables['shdr'],i)
  hdrs.append(dict(name=name.split(b'\0')[0].decode(),start=s,end=e,rate=rate,link=link,kind=kind))
 inst=[]
 for i in range(0,len(tables['inst'])-22,22):
  name,bag=struct.unpack_from('<20sH',tables['inst'],i);inst.append((name.split(b'\0')[0].decode(),bag))
 bags=[struct.unpack_from('<HH',tables['ibag'],i) for i in range(0,len(tables['ibag']),4)]
 gens=[struct.unpack_from('<HH',tables['igen'],i) for i in range(0,len(tables['igen']),4)]
 print(path,'SAMPLES',len(hdrs),'INST',len(inst))
 for j,(iname,bstart) in enumerate(inst):
  bend=inst[j+1][1] if j+1<len(inst) else len(bags)-1
  for ib in range(bstart,bend):
   z=dict(gens[bags[ib][0]:bags[ib+1][0]])
   if 53 in z:
    h=hdrs[z[53]]; kr=z.get(43,127<<8);vr=z.get(44,127<<8)
    print(iname, 'key',(kr&255,kr>>8),'vel',(vr&255,vr>>8),'sample',z[53],h)
 return tables,hdrs,inst,bags,gens
if __name__=='__main__':
 for p in sys.argv[1:]:read(p)

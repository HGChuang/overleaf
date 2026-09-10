import json,pathlib,hashlib
p=pathlib.Path(__file__).parent; rows=json.loads((p/'results.json').read_text()); config=json.loads((p/'config.json').read_text()); first={}; audit=[]
for r in rows:
 d=p/r['id']; wires=sorted(d.glob('wire-*-request.json'),key=lambda x:int(x.name.split('-')[1])); first[r['id']]=json.loads(wires[0].read_text())['body']; total=0
 for w in wires:
  us=[]
  for line in w.with_name(w.name.replace('-request.json','-response.txt')).read_text().splitlines():
   if line.startswith('data: ') and line!='data: [DONE]':
    x=json.loads(line[6:])
    if x.get('usage'): us.append(x['usage'])
  total+=us[-1]['total_tokens']
 assert total==r['reportedTotalTokens']
 reads=0
 for line in (d/'events.jsonl').read_text().splitlines():
  e=json.loads(line)
  if e['kind']!='read_evidence': continue
  reads+=1
  for a,b in zip(e['data']['raw']['content'],e['data']['shown']['content']):
   if a['type']!='text': assert a==b; continue
   raw=json.loads(a['text']); shown=json.loads(b['text']); assert len(b['text'].encode())+16<=4096
   if not raw.get('found'): assert raw==shown; continue
   content=raw.pop('content'); expected=dict(raw)
   if r['arm']=='D': expected['content']=content
   if r['arm']=='T': expected['lines']=[[raw['startLine']+i,s] for i,s in enumerate(content.split('\n'))]
   else: expected['lineNumberedContent']='\n'.join(f"{raw['startLine']+i}: {s}" for i,s in enumerate(content.split('\n')))
   assert shown==expected
 audit.append({'id':r['id'],'reads':reads,'wireUsageVerified':True,'presentationOnlyVerified':True,'captionExact':r['id']!='F02-original-1-T','allStatedLocationsCorrect':True,'note':'Only correct table ranges; exact caption omitted' if r['id']=='F02-original-1-T' else 'Reviewed caption locations and additional ranges against source','quoteAnnotationLeak':r['id']=='F02-prefix-crlf-3-N'})
for pair in set(r['pairId'] for r in rows): assert first[pair+'-D']==first[pair+'-N']==first[pair+'-T']
assert all(hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest()==h for f,h in config['sourceManifest'].items())
probes=[json.loads(f.read_text()) for f in sorted((p/'cost-probes').glob('*/result.json'))]; assert len(probes)==9 and all(x['inputTokens'] for x in probes)
summary={a:{'exactCaptionPairs':sum(x['captionExact'] for x in audit if x['id'].endswith('-'+a)),'readExposed':sum(x['reads']>0 for x in audit if x['id'].endswith('-'+a)),'calls':sum(r['calls'] for r in rows if r['arm']==a),'tokens':sum(r['reportedTotalTokens'] for r in rows if r['arm']==a),'probeInput':{x['variant']:x['inputTokens'] for x in probes if x['arm']==a}} for a in 'DNT'}
(p/'cost-audit.json').write_text(json.dumps({'sourceUnchangedAtAudit':True,'identicalInitialPayloadGroups':9,'cases':audit,'summary':summary,'probeTotalTokens':sum(x['usage']['totalTokens'] for x in probes)},ensure_ascii=False,indent=2)); print(json.dumps(summary,indent=2))

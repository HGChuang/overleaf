"""Independent byte/receipt/usage audit; run from repository root after completion."""
import json,pathlib,hashlib
p=pathlib.Path(__file__).parent
load=lambda f:json.loads((p/f).read_text())
rows=load('results.json'); cases={c['id']:c for c in load('dataset.json')}
assert len(rows)==len(cases)==16
sha=lambda b:hashlib.sha256(b).hexdigest()
assert all(sha(pathlib.Path(f).read_bytes())==h for f,h in load('config.json')['sourceManifest'].items())
checks=[]
for r in rows:
 c=cases[r['id']]; directory=p/r['id']; history=load(r['id']+'/history.json')['messages']; reads=[]; errors=[]
 for m in history:
  if m.get('role')!='toolResult': continue
  if m.get('isError'): errors.append({'tool':m.get('toolName'),'content':m['content']})
  if m.get('toolName') not in ('read_file','read_file_fragment') or m.get('isError'): continue
  view=json.loads(m['content'][0]['text'])
  if not view.get('found'): continue
  assert 'content' not in view and 'lines' not in view
  assert len(m['content'][0]['text'].encode())+16<=4096
  content=[]
  for i,line in enumerate(view['lineNumberedContent'].split('\n')):
   prefix=str(view['startLine']+i)+': '; assert line.startswith(prefix);content.append(line[len(prefix):])
  decoded='\n'.join(content).encode(); source=c['files'][view['path']].encode()
  assert decoded==source[view['startByte']:view['endByte']]
  assert view['sourceHash']==sha(source)
  assert view['startLine']==source[:view['startByte']].decode().count('\n')+1
  assert view['nextOffsetBytes'] is None or view['nextOffsetBytes']>view['startByte']
  reads.append({'path':view['path'],'startLine':view['startLine'],'startByte':view['startByte'],'endByte':view['endByte'],'nextOffsetBytes':view['nextOffsetBytes']})
 receipts=[]
 for proposal in load(r['id']+'/backend-records.json')['proposals']:
  for h in proposal['hunks']:
   source=c['files'][h['file']]
   if h['oldText']:
    assert source.count(h['oldText'])==1
    line=source[:source.index(h['oldText'])].count('\n')+1
    assert line==h['line'],(r['id'],h['line'],line)
   else:
    line=h['line'];assert 1<=line<=len(source.split('\n'))+1
   receipts.append({'file':h['file'],'line':line,'insertion':not h['oldText']})
 total=0; requests=list(directory.glob('wire-*-request.json'))
 for w in requests:
  usage=[]
  for line in w.with_name(w.name.replace('-request.json','-response.txt')).read_text().splitlines():
   if not line.startswith('data: ') or line=='data: [DONE]':continue
   data=json.loads(line[6:])
   if data.get('usage'):usage.append(data['usage'])
  assert usage
  total+=usage[-1]['total_tokens']
 assert total==r['reportedTotalTokens']
 checks.append({'id':r['id'],'automaticPassed':r['checksPassed'],'wireRequests':len(requests),'calls':r['calls'],'tokens':total,'sourcePages':reads,'canonicalHunks':receipts,'toolErrors':errors,'answer':r['answer'],'expectedLocations':c.get('expectedLocations')})
summary={'cases':len(rows),'automaticPassed':sum(r['checksPassed'] for r in rows),'calls':sum(r['calls'] for r in rows),'tokens':sum(r['reportedTotalTokens'] for r in rows),'sourcePages':sum(len(c['sourcePages']) for c in checks),'canonicalHunks':sum(len(c['canonicalHunks']) for c in checks),'sourceUnchangedAtAudit':True,'semanticReview':'pending'}
(p/'production-audit.json').write_text(json.dumps({'summary':summary,'cases':checks},ensure_ascii=False,indent=2))
print(json.dumps(summary,indent=2))

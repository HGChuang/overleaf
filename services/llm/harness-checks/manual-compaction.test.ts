import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import mongoose from 'mongoose';
import {ContextStore} from '../app/agent/context/context-store.js';
import {fixture,assistant,userId,projectId} from './helpers.js';

before(async()=>{
  assert.equal(process.env.L0_MONGO_URL,'mongodb://127.0.0.1:27017/copilot_l0?replicaSet=l0');
  await mongoose.connect(process.env.L0_MONGO_URL!,{serverSelectionTimeoutMS:10000});
});
beforeEach(async()=>{await mongoose.connection.db!.dropDatabase();});
after(async()=>{await mongoose.disconnect();});
async function setup(step:any){
  const store=new ContextStore();const f=fixture([step],{contextStore:store});
  const scope={userId,projectId,conversationId:'manual-compact-regression',source:'panel' as const};
  const session=await store.open(scope);
  await session.append({role:'user',timestamp:0,content:JSON.stringify({MESSAGE:'Only change Hello to Greetings; preserve all other bytes.',PROJECT:{projectId,sourceSnapshot:{id:f.snapshot.id}}})} as any);
  for(let i=0;i<8;i++)await session.append(assistant([{type:'text',text:'Historical progress without new author constraints. '.repeat(60)}]));
  await session.close();return {f,store,scope};
}
const summary=()=>assistant([{type:'text',text:'{"observations":[],"pending":[]}'}]);
test('F-L1-36-01: manual compaction renews the real Mongo lease during a slow summary',{timeout:45000},async()=>{
  const {f,store,scope}=await setup(async()=>{await delay(31000);return summary();});
  const result=await f.service.compact(userId,scope.conversationId,projectId);
  assert.equal(result.generation,1);
  const diagnostics=await store.diagnostics(userId,scope.conversationId,projectId);
  assert.ok(diagnostics!.coveredThroughSeq>=0);
});
test('F-L1-36-01: summary deadline degrades safely while retaining author constraints',async(t)=>{
  const realTimeout=AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal,'timeout',(ms:number)=>{assert.equal(ms,45000);return realTimeout(20);});
  let aborted=false;
  const {f,store,scope}=await setup(async(_ctx:any,options:any)=>{
    assert.ok(options.signal instanceof AbortSignal);
    await new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(options.signal.reason);},{once:true}));
    return summary();
  });
  const result=await f.service.compact(userId,scope.conversationId,projectId);
  assert.ok(aborted);assert.equal(result.generation,1);
  const diagnostics=await store.diagnostics(userId,scope.conversationId,projectId);
  assert.equal(diagnostics!.checkpoint!.authorRequests[0].text,'Only change Hello to Greetings; preserve all other bytes.');
});
test('F-L1-36-01: renewal loss aborts summary and cannot publish a degraded epoch',async(t)=>{
  const {f,store,scope}=await setup(async(_ctx:any,options:any)=>{
    await new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));
    return summary();
  });
  const open=store.open.bind(store);
  store.open=async(scope)=>{const session=await open(scope);return {...session,renew:async()=>{throw new Error('simulated renewal loss');}};};
  const realInterval=globalThis.setInterval;
  t.mock.method(globalThis,'setInterval',((fn:any,ms:any,...args:any[])=>realInterval(fn,ms===10000?10:ms,...args)) as any);
  await assert.rejects(f.service.compact(userId,scope.conversationId,projectId),/simulated renewal loss/);
  assert.equal((await store.diagnostics(userId,scope.conversationId,projectId))!.generation,0);
  const reopened=await store.open(scope);await reopened.close();
});

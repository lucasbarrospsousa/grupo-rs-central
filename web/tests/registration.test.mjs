import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeBulk} from '../public/bulk-page.js';
import {SqlRepository} from '../public/sql-repository.js';
import {businessMutation} from '../backend/business.mjs';
import {permitted} from '../backend/user-access.mjs';
const branches=['imperatriz','araguaina','acailandia','maraba'];
for(const branch of branches)test('single and bulk registration keep the reviewed branch: '+branch,async()=>{
 const repo=new SqlRepository(),calls=[];repo.currentBranch='another';repo.request=async(path,args)=>{calls.push({path,...args});return {ok:true,count:1}};repo.load=async b=>{assert.equal(b,branch)};
 await repo.saveDevice(branch,{serial:'024000001',status:'Estoque'},null,{key:'single-key'});
 await repo.addBulk([{serial:'024000002',plate:'',carrier:'Claro'}],{branch,key:'bulk-key'});
 assert.equal(calls[0].path,'devices?branch='+branch);assert.equal(calls[0].key,'single-key');assert.equal(calls[1].path,'bulk?branch='+branch);assert.equal(calls[1].key,'bulk-key');
 const inserted=[];const c={query:async(sql,args)=>{inserted.push(args);return {rows:[]}}};
 const result=await businessMutation(c,{path:'/api/bulk',method:'POST',branch,role:'admin',user:{},body:{rows:[{serial:'024000002',plate:'ARG-021',carrier:'Claro'}]}});
 assert.equal(result.response.count,1);assert.equal(inserted[0][1],branch);assert.equal(inserted[0][2],'024000002');assert.equal(inserted[0][3].status,'Estoque');
});
test('bulk identifies existing serials in the selected branch and enforces the server limit',()=>{
 const r=analyzeBulk('024000001\n024000002','Claro',['024000001']);assert.deepEqual(r.registered,['024000001']);assert.match(r.errors[0],/Já cadastradas/);assert.equal(analyzeBulk('024000002','Claro',['024000001']).errors.length,0);
 const text=Array.from({length:501},(_,i)=>String(24000000+i).padStart(9,'0')).join('\n');assert.match(analyzeBulk(text).errors[0],/500/);assert.equal(analyzeBulk(text.split('\n').slice(0,500).join('\n')).errors.length,0);
});
test('successful writes remain successful when refresh fails and retries preserve operation key',async()=>{
 const r=new SqlRepository();const keys=[];r.request=async(path,args)=>{keys.push(args.key);return {ok:true,count:1}};r.load=async()=>{throw Error('offline')};
 assert.equal((await r.saveDevice('maraba',{serial:'024000001'},null,{key:'same'})).refreshPending,true);
 assert.equal((await r.addBulk([],{branch:'araguaina',key:'same'})).refreshPending,true);assert.deepEqual(keys,['same','same']);
});
test('registration still requires module write access',()=>{
 for(const path of ['/api/devices','/api/bulk'])assert.equal(permitted({owner:false,views:['stock','bulk'],writes:[]},path,'POST'),false);
 assert.equal(permitted({owner:false,views:['stock'],writes:['stock']},'/api/devices','POST'),true);
 assert.equal(permitted({owner:false,views:['bulk'],writes:['bulk']},'/api/bulk','POST'),true);
});

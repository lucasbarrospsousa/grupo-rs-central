import {Buffer} from 'node:buffer';
export async function restoreBackup(envelope,key){
 if(envelope.format!=='central-paralela-users-v1'||! /^[a-f0-9]{64}$/.test(key||''))throw Error('Invalid backup');
 const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(envelope.iv,'base64'),additionalData:new TextEncoder().encode('central-paralela-users-v1')},await crypto.subtle.importKey('raw',Buffer.from(key,'hex'),'AES-GCM',false,['decrypt']),Buffer.from(envelope.ciphertext,'base64'));
 const result=JSON.parse(new TextDecoder().decode(data));if(result.schemaVersion!==1)throw Error('Unknown backup version');return result;
}

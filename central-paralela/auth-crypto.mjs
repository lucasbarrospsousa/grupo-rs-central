import {scryptSync,createHash,timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
export function passwordMatches(password,stored){
 const dummy='00000000000000000000000000000000:'+ '0'.repeat(128);
 const value=typeof stored==='string'?stored:dummy;
 if(value.startsWith('legacy-sha256:')){
  const parts=value.split(':');scryptSync(password,'parallel-login-timing',64);
  return parts.length===3&&/^[a-f0-9]{64}$/.test(parts[2])&&timingSafeEqual(Buffer.from(digest(parts[1]+':'+password),'hex'),Buffer.from(parts[2],'hex'));
 }
 const [salt,key]=value.split(':');
 if(!salt||salt.length>256||!/^[a-f0-9]{128}$/.test(key||'')){scryptSync(password,'parallel-login-timing',64);return false;}
 return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(key,'hex'));
}
const aad=new TextEncoder().encode('central-paralela-users-v1');
async function key(hex){if(!/^[a-f0-9]{64}$/.test(hex||''))throw Error('AUTH_KEY_INVALID');return crypto.subtle.importKey('raw',Buffer.from(hex,'hex'),'AES-GCM',false,['encrypt','decrypt']);}
export async function encryptUsers(data,secret){const iv=crypto.getRandomValues(new Uint8Array(12));const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await key(secret),new TextEncoder().encode(JSON.stringify(data)));return {format:'central-paralela-users-v1',iv:Buffer.from(iv).toString('base64'),ciphertext:Buffer.from(bytes).toString('base64')};}
export async function decryptUsers(envelope,secret){if(envelope?.format!=='central-paralela-users-v1'||typeof envelope.ciphertext!=='string'||envelope.ciphertext.length>2800000)throw Error('AUTH_FILE_INVALID');const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(envelope.iv,'base64'),additionalData:aad},await key(secret),Buffer.from(envelope.ciphertext,'base64'));const data=JSON.parse(new TextDecoder().decode(bytes));if(data.schemaVersion!==1||!Array.isArray(data.users)||data.users.length>5000)throw Error('AUTH_FILE_INVALID');return data;}

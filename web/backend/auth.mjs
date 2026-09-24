import {Buffer} from 'node:buffer';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
export function passwordHash(password) {
  const salt=randomBytes(16).toString('hex');
  return salt+':'+scryptSync(password,salt,64).toString('hex');
}
export function passwordMatches(password,stored){
  if(String(stored).startsWith('legacy-sha256:')){
    const [,salt,key]=stored.split(':');
    return /^[a-f0-9]{64}$/.test(key||'')&&timingSafeEqual(Buffer.from(hash(salt+':'+password),'hex'),Buffer.from(key,'hex'));
  }
  const [salt,key]=String(stored).split(':');
  if(!salt||!key||key.length!==128)return false;
  return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(key,'hex'));
}
export const token = () => randomBytes(32).toString('hex');
export function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')));}
export async function session(pool,req){
  const value=cookies(req).central_session;
  if(!value||!/^[a-f0-9]{64}$/.test(value))return null;
  return (await pool.query(`select s.user_id,s.csrf_hash,u.username from central_homologacao.sessions s
    join central_homologacao.users u on u.id=s.user_id where token_hash=$1 and expires_at>now() and u.active`,[hash(value)])).rows[0]||null;
}

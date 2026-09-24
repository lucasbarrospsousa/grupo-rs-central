// Run locally after saving a Google OAuth Desktop client to the protected path.
// OAuth consent is performed by the account owner in their browser.
import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {privatePath} from '../backend/database.mjs';
const file=JSON.parse(await readFile(privatePath('google-backup-client.json'),'utf8'));
const client=file.installed;if(!client?.client_id||!client.client_secret)throw Error('Use a Google OAuth Desktop client JSON in google-backup-client.json.');
const state=randomBytes(32).toString('hex'),verifier=randomBytes(48).toString('base64url'),email='lucasbarrospereira13@gmail.com';
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');if(url.pathname!=='/callback'){res.writeHead(404).end();return;}
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
 if(url.searchParams.get('state')!==state){res.writeHead(400).end('Invalid authorization state');return;}
 try{
  if(url.searchParams.has('error'))throw Error('Google authorization was not granted.');
  const code=url.searchParams.get('code');if(!code)throw Error('Missing authorization code');
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client.client_id,client_secret:client.client_secret,code,code_verifier:verifier,grant_type:'authorization_code',redirect_uri:redirect}),signal:AbortSignal.timeout(15000)});
  const tokens=await response.json();if(!response.ok||!tokens.refresh_token)throw Error('Google did not issue offline authorization.');
  const about=await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(15000)});
  if(!about.ok||(await about.json()).user?.emailAddress?.toLowerCase()!==email)throw Error('Wrong Google account; nothing saved.');
  await writeFile(privatePath('backup-google.json'),JSON.stringify({client_id:client.client_id,client_secret:client.client_secret,refresh_token:tokens.refresh_token,email}),{mode:0o600});
  res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'}).end('Conta do Lucas autorizada. Pode voltar ao Codex para concluir o teste do backup.');console.log('Google account confirmed and offline authorization saved privately.');server.close();clearTimeout(timeout);
 }catch{res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'}).end('A conexão não foi concluída. Confira a conta, a autorização e tente novamente.');console.log('Authorization failed; no tokens printed.');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const redirect='http://127.0.0.1:'+server.address().port+'/callback';
const auth=new URL('https://accounts.google.com/o/oauth2/v2/auth');auth.search=new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',scope:'https://www.googleapis.com/auth/drive.file',access_type:'offline',prompt:'consent',login_hint:email,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
console.log(auth.href);const timeout=setTimeout(()=>{server.close();console.log('Authorization window expired. Run again when ready.');},15*60000);

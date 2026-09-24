import {execFileSync} from 'node:child_process';
import {privatePath} from './database.mjs';
let cached;
export function integrationSecrets(){
 if(cached)return cached;
 const file=privatePath('integrations.dpapi').replaceAll("'","''");
 const script=`$ProgressPreference='SilentlyContinue';Add-Type -AssemblyName System.Security;$b=[IO.File]::ReadAllBytes('${file}');$d=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Write([Text.Encoding]::UTF8.GetString($d))`;
 try{cached=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:15000}));return cached;}catch{throw Error('Credenciais das integrações indisponíveis neste servidor.');}
}

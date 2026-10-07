import {readFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {privatePath} from '../backend/database.mjs';
const adb='C:/Users/lugan/AppData/Local/Android/Sdk/platform-tools/adb.exe',pkg='br.com.sideracode.smsgateway';
const config=JSON.parse(await readFile(privatePath('sms-cloud-access.json'),'utf8'));
const enrollment={token:config.token,endpoint:'https://vwiayytzmorcjeaszowg.supabase.co/functions/v1/central-api/internal/sms-gateway'};
execFileSync(adb,['shell','run-as',pkg,'mkdir','-p','files'],{stdio:'pipe'});
execFileSync(adb,['shell','run-as',pkg,'sh','-c',"'cat > files/cloud-enrollment.json'"],{input:JSON.stringify(enrollment),stdio:['pipe','pipe','pipe']});
console.log('Enrollment transferred into app-private storage; token not displayed.');

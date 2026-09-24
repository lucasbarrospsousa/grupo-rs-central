// Browser-only libraries are shipped locally; no third-party script execution.
const pending=new Map();
export function library(path,globalName){if(globalThis[globalName])return Promise.resolve(globalThis[globalName]);if(!pending.has(path))pending.set(path,new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=path;tag.onload=()=>resolve(globalThis[globalName]);tag.onerror=()=>{pending.delete(path);reject(Error('Não foi possível carregar o recurso. Atualize a página.'));};document.head.append(tag);}));return pending.get(path);}
export function download(bytes,type,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

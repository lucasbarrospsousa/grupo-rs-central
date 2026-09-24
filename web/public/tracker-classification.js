// Same classification rules as src/tracker_versions.gd; not measured firmware.
export function trackerClassification(identification, value='') {
 const prefix=String(identification||'').trim().toUpperCase().replace(/[ -]/g,'');
 for(const [key,version] of Object.entries({GRS:'V7.3.2',AAA:'V7.2.2/7.1.6',XRS:'V7.3.5'}))if(prefix.startsWith(key))return version;
 const key=String(value||'').trim().toLowerCase().replace(/[ .\/-]/g,'');
 const aliases={grs:'V7.3.2',rsnovo:'V7.3.2',rsnovos:'V7.3.2',v732:'V7.3.2','732':'V7.3.2',aaa:'V7.2.2/7.1.6',reutilizado:'V7.2.2/7.1.6',reutilizada:'V7.2.2/7.1.6',usado:'V7.2.2/7.1.6',usada:'V7.2.2/7.1.6',v722716:'V7.2.2/7.1.6',v722v716:'V7.2.2/7.1.6',xrs:'V7.3.5',v735:'V7.3.5',v7350:'V7.3.5',v735versao:'V7.3.5',v735version:'V7.3.5','735':'V7.3.5',v722:'V7.2.2','722':'V7.2.2',v716:'V7.1.6','716':'V7.1.6'};
 return aliases[key]||String(value||'').trim();
}

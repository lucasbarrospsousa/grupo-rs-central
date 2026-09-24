import {library,download} from './libraries.js';
export async function makePdf({title,subtitle='',columns,rows,landscape=true},deps){
 const {PDFLib,fontkit,fontBytes}=deps;
 if(!Array.isArray(rows)||rows.length>20000)throw Error('Relatório excede 20.000 linhas. Reduza os filtros.');
 const doc=await PDFLib.PDFDocument.create();doc.registerFontkit(fontkit);const font=await doc.embedFont(fontBytes,{subset:true});
 const {rgb}=PDFLib,blue=rgb(.08,.22,.36),muted=rgb(.35,.44,.54),line=rgb(.82,.88,.94),white=rgb(1,1,1);
 const width=landscape?842:595,height=landscape?595:842,margin=32,usable=width-margin*2,size=8.3,leading=12;
 const weights=columns.map(c=>c.width||1),sum=weights.reduce((a,b)=>a+b,0),widths=weights.map(w=>usable*w/sum);let page,y;
 const clean=v=>String(v??'—').replace(/[\u0000-\u001f]/g,' ').slice(0,4000);
 const charWidths=new Map();const wrap=(v,w)=>{let output=[],part='',used=0;for(const char of clean(v)){if(!charWidths.has(char))charWidths.set(char,font.widthOfTextAtSize(char,size));const cw=charWidths.get(char);if(part&&used+cw>w){output.push(part);part='';used=0;}part+=char;used+=cw;}output.push(part||'—');return output;};
 const addPage=()=>{page=doc.addPage([width,height]);page.drawRectangle({x:0,y:height-76,width,height:76,color:blue});page.drawText('GRUPO RS CENTRAL',{x:margin,y:height-25,size:10,font,color:white});page.drawText(clean(title).slice(0,90),{x:margin,y:height-49,size:16,font,color:white});page.drawText(clean(subtitle).slice(0,140),{x:margin,y:height-93,size:8,font,color:muted});y=height-111;let x=margin;page.drawRectangle({x:margin,y:y-24,width:usable,height:24,color:blue});columns.forEach((c,i)=>{page.drawText(clean(c.label),{x:x+5,y:y-16,size:8,font,color:white});x+=widths[i];});y-=28;};
 addPage();
 for(const row of rows){const cells=columns.map((c,i)=>wrap(Array.isArray(row)?row[i]:row[c.key],widths[i]-10));let offset=0;const n=Math.max(...cells.map(c=>c.length));while(offset<n){if(y<margin+40)addPage();const take=Math.max(1,Math.min(n-offset,Math.floor((y-margin-25)/leading)));let x=margin;cells.forEach((cell,i)=>{cell.slice(offset,offset+take).forEach((text,j)=>page.drawText(text,{x:x+5,y:y-12-j*leading,size,font,color:blue}));x+=widths[i];});y-=take*leading+7;page.drawLine({start:{x:margin,y},end:{x:width-margin,y},thickness:.5,color:line});offset+=take;if(offset<n)addPage();}}
 if(!rows.length)page.drawText('Nenhum registro no recorte selecionado.',{x:margin,y:y-20,size:10,font,color:muted});
 const pages=doc.getPages();pages.forEach((p,i)=>p.drawText(`${i+1} / ${pages.length}  •  ${rows.length} registros`,{x:margin,y:17,size:8,font,color:muted}));return doc.save();
}
export async function exportPdf(options){const [PDFLib,fontkit,res]=await Promise.all([library('/vendor/pdf-lib.min.js','PDFLib'),library('/vendor/fontkit.min.js','fontkit'),fetch('/vendor/NotoSans-Regular.ttf')]);if(!res.ok)throw Error('Fonte do relatório indisponível.');const bytes=await makePdf(options,{PDFLib,fontkit,fontBytes:new Uint8Array(await res.arrayBuffer())});download(bytes,'application/pdf',options.filename||'relatorio-central.pdf');}

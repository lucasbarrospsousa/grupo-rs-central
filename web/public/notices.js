// One persistent, dismissible presentation for application messages.
let noticeHost;
function region(){
 let host=noticeHost||document.querySelector('#notice');
 if(!host){host=document.createElement('div');host.id='notice';}
 noticeHost=host;
 const parent=[...document.querySelectorAll('dialog[open]')].at(-1)||document.body;
 if(host.parentElement!==parent)parent.append(host);
 host.setAttribute('aria-label','Avisos da Central');host.setAttribute('aria-live','polite');
 if(typeof host.showPopover==='function')host.setAttribute('popover','manual');
 return host;
}
function reveal(host){if(host.showPopover&&!host.matches(':popover-open'))host.showPopover();}
export function notify(message,{group='general',action=null}={}){
 const text=String(message??'').trim();if(!text)return;
 const host=region();
 const existing=[...host.children].find(n=>n.dataset.message===text&&n.dataset.group===group);
 if(existing){reveal(host);return existing;}
 const card=document.createElement('div');card.className='central-notice';card.dataset.group=group;card.dataset.message=text;
 const content=document.createElement('span');content.className='central-notice-text';content.textContent=text;card.append(content);
 if(action){const button=document.createElement('button');button.type='button';button.className='central-notice-action';button.textContent=action.label;button.onclick=()=>action.run();card.append(button);}
 const close=document.createElement('button');close.type='button';close.className='central-notice-close';close.textContent='×';close.setAttribute('aria-label','Fechar aviso');
 close.onclick=()=>{const next=card.nextElementSibling||card.previousElementSibling;card.remove();next?.querySelector('.central-notice-close')?.focus();if(!host.children.length&&host.hidePopover)host.hidePopover();};
 card.append(close);host.append(card);reveal(host);return card;
}
export function clearNotices(group){const host=document.querySelector('#notice');if(!host)return;for(const card of [...host.children])if(!group||card.dataset.group===group)card.remove();if(!host.children.length&&host.hidePopover)host.hidePopover();}
export function installNoticeAlerts(){
 // Existing error outlets keep their IDs for handlers; messages move to the shared stack.
 const collect=()=>{const host=region();if(host.children.length)reveal(host);for(const el of document.querySelectorAll('[role="alert"], [data-notice]')){
  if(el.closest('#notice'))continue;
  const text=el.textContent.trim();if(!text)continue;
  notify(text);el.textContent='';
 }};
 const observer=new MutationObserver(collect);observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['open']});collect();
 return ()=>observer.disconnect();
}

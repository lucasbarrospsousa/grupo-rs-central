// Move existing controls instead of recreating them: branch and menu handlers are preserved.
export function unifyPageHeader(title){
 const header=document.querySelector('.content>.top');if(!header)return;
 const toggle=header.querySelector('.sidebar-toggle'),branch=header.querySelector('#branch,#sql-branch'),refresh=header.querySelector('#refresh'),sync=header.querySelector('#visits-sync');
 if(sync)document.querySelector('#page').prepend(sync);
 const heading=document.createElement('div');heading.className='ui-heading';if(toggle)heading.append(toggle);
 const text=document.createElement('div'),label=document.createElement('small'),name=document.createElement('strong');label.textContent='GRUPO RS CENTRAL';name.textContent=title;text.append(label,name);heading.append(text);
 const actions=document.createElement('div');actions.className='ui-header-actions';if(branch){const field=document.createElement('label');field.className='ui-branch';field.append('Filial ',branch);actions.append(field);}if(refresh)actions.append(refresh);const alerts=header.querySelector('#inventory-alert-settings');if(alerts)actions.append(alerts);
 header.replaceChildren(heading,actions);
}

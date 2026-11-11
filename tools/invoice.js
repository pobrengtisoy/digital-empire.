(() => {
  'use strict';
  const KEY = 'de-invoice-maker-v1';
  const $ = id => document.getElementById(id);
  const form = $('invoiceForm');
  const fields = ['businessName','businessContact','businessAddress','clientName','clientContact','invoiceNo','currency','issueDate','dueDate','discount','tax','notes'];
  const today = new Date();
  const localDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const shiftDate = (d,n) => {const copy=new Date(d); copy.setDate(copy.getDate()+n); return localDate(copy);};
  const defaults = {businessName:'RZ STUDIO',businessContact:'',businessAddress:'',clientName:'',clientContact:'',invoiceNo:'INV-001',currency:'PHP',issueDate:localDate(today),dueDate:shiftDate(today,14),discount:'0',tax:'0',notes:'Thank you for your business.',items:[{description:'Website design',quantity:'1',rate:'8500'},{description:'Development',quantity:'1',rate:'4500'}]};
  let state = structuredClone(defaults);
  const safeNum = val => {const n = Number(val);return Number.isFinite(n)&&n>0 ? Math.min(n,1e9) : 0;};
  const pct = val => Math.min(100,safeNum(val));
  const currency = () => ({PHP:'₱',USD:'$',EUR:'€',SGD:'S$'})[state.currency] || '₱';
  const fmt = n => `${currency()}${(Number.isFinite(n)?n:0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const fieldText = (id,value,fallback='—') => {$(id).textContent=String(value||'').trim()||fallback;};
  const dateText = iso => {if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return '—';const [y,m,d]=iso.split('-');return `${d}/${m}/${y}`;};
  const persist = () => {try{localStorage.setItem(KEY,JSON.stringify(state));$('appStatus').textContent='DRAFT SAVED ON THIS DEVICE.';}catch{$('appStatus').textContent='BROWSER STORAGE UNAVAILABLE. EXPORT A DRAFT TO KEEP A COPY.';}};
  const itemEditor = $('itemEditor');
  function drawItems(){
    itemEditor.replaceChildren();
    state.items.forEach((item,index)=>{
      const line=document.createElement('div');line.className='item-line';
      [['description','DESCRIPTION','text','e.g. Design'],['quantity','QTY','number','1'],['rate','RATE','number','0.00']].forEach(([key,label,type,placeholder])=>{
        const lab=document.createElement('label');lab.textContent=label;const input=document.createElement('input');input.type=type;input.value=item[key]??'';input.placeholder=placeholder;input.setAttribute('aria-label',`${label} for item ${index+1}`);
        if(type==='number'){input.min='0';input.step=key==='quantity'?'0.01':'0.01';}
        input.addEventListener('input',()=>{state.items[index][key]=input.value;update();});lab.append(input);line.append(lab);
      });
      const remove=document.createElement('button');remove.type='button';remove.className='remove-line';remove.textContent='×';remove.title=`Remove item ${index+1}`;remove.setAttribute('aria-label',`Remove item ${index+1}`);remove.addEventListener('click',()=>{state.items.splice(index,1);if(!state.items.length)state.items.push({description:'',quantity:'1',rate:'0'});drawItems();update();});line.append(remove);itemEditor.append(line);
    });
  }
  function render(){
    fieldText('pBusinessName',state.businessName,'YOUR BUSINESS');
    fieldText('pBusinessContact',state.businessContact,'');
    fieldText('pBusinessAddress',state.businessAddress,'');
    fieldText('pClientName',state.clientName,'CLIENT NAME');
    fieldText('pClientContact',state.clientContact,'');
    fieldText('pInvoiceNo',state.invoiceNo,'INV-001');
    fieldText('pIssueDate',dateText(state.issueDate));
    fieldText('pDueDate',dateText(state.dueDate));
    fieldText('pNotes',state.notes,'');
    const body=$('previewItems');body.replaceChildren();let subtotal=0;
    state.items.forEach(item=>{
      const amount = safeNum(item.quantity)*safeNum(item.rate); subtotal+=amount;
      const row=document.createElement('tr');
      [item.description||'ITEM',String(safeNum(item.quantity)),fmt(safeNum(item.rate)),fmt(amount)].forEach(val=>{let td=document.createElement('td');td.textContent=val;row.append(td);});body.append(row);
    });
    const discount= subtotal*pct(state.discount)/100;
    const tax=(subtotal-discount)*pct(state.tax)/100;
    const total=subtotal-discount+tax;
    fieldText('pSubtotal',fmt(subtotal));fieldText('pDiscountLabel',`DISCOUNT (${pct(state.discount)}%)`);fieldText('pDiscount',`−${fmt(discount)}`);
    fieldText('pTaxLabel',`TAX (${pct(state.tax)}%)`);fieldText('pTax',fmt(tax));fieldText('pTotal',fmt(total));
  }
  function update(){render();persist();}
  function fill(){fields.forEach(id=>{const control=$(id);control.value=state[id]??defaults[id]??'';});drawItems();render();}
  fields.forEach(id=>$(id).addEventListener('input',()=>{state[id]=$(id).value;update();}));
  $('addItem').addEventListener('click',()=>{if(state.items.length>=50){$('appStatus').textContent='MAXIMUM 50 LINE ITEMS PER INVOICE.';return;}state.items.push({description:'',quantity:'1',rate:'0'});drawItems();update();});
  $('printInvoice').addEventListener('click',()=>window.print());
  $('downloadDraft').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({format:'de-invoice-v1',data:state},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`invoice-${(state.invoiceNo||'draft').replace(/[^a-z0-9-_]/gi,'-')}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);$('appStatus').textContent='DRAFT FILE EXPORTED.';
  });
  $('importDraft').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      if(file.size>200000)throw Error('File too large');
      const obj=JSON.parse(await file.text());
      if(obj.format!=='de-invoice-v1'||!obj.data||!Array.isArray(obj.data.items)||obj.data.items.length>50)throw Error('Unsupported draft');
      const data=obj.data;const next=structuredClone(defaults);
      for(const key of fields){if(typeof data[key]==='string'){next[key]=data[key].slice(0,2000);}}
      if(!['PHP','USD','EUR','SGD'].includes(next.currency))next.currency='PHP';
      next.items=data.items.map(v=>({description:String(v.description??'').slice(0,300),quantity:String(v.quantity??'1').slice(0,24),rate:String(v.rate??'0').slice(0,24)}));
      if(!next.items.length)next.items=[{description:'',quantity:'1',rate:'0'}];state=next;fill();persist();$('appStatus').textContent='DRAFT IMPORTED.';
    }catch{$('appStatus').textContent='COULD NOT IMPORT. SELECT A VALID DE INVOICE DRAFT FILE.';}
    e.target.value='';
  });
  $('resetInvoice').addEventListener('click',()=>{if(!confirm('Clear this locally saved invoice and start again?'))return;state=structuredClone(defaults);state.items=[{description:'',quantity:'1',rate:'0'}];fill();persist();$('appStatus').textContent='DRAFT CLEARED.';});
  try{const saved=localStorage.getItem(KEY);if(saved){const data=JSON.parse(saved);if(data&&Array.isArray(data.items)&&data.items.length<=50){state={...structuredClone(defaults),...data};state.items=data.items;}}}catch{}
  fill();
})();

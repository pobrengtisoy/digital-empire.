(() => {
  const products = window.DECatalog || [];
  const list = document.querySelector('#productList');
  const search = document.querySelector('#catalogSearch');
  const filters = [...document.querySelectorAll('[data-filter]')];
  const productDialog = document.querySelector('#productDialog');
  const dialogContent = document.querySelector('#dialogContent');
  const briefDialog = document.querySelector('#briefDialog');
  const briefForm = document.querySelector('#briefForm');
  const menu = document.querySelector('#mobileNav');
  const menuToggle = document.querySelector('#menuToggle');
  let selectedFilter = 'all';

  const safe = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function draw() {
    const q = search.value.trim().toLocaleLowerCase();
    const found = products.filter(p => (selectedFilter === 'all' || p.category === selectedFilter) && [p.name,p.kind,p.description,...p.tags].join(' ').toLocaleLowerCase().includes(q));
    list.innerHTML = found.length ? found.map(p => `<button type="button" class="product-row" data-product="${p.id}" aria-label="View details for ${safe(p.name)}"><span class="product-ref"><b>${p.id}</b><small>${safe(p.kind)}</small></span><span class="product-main"><strong>${safe(p.name)}</strong><small>${safe(p.description)}</small></span><span class="product-state ${p.status === 'live' ? 'is-live':'is-planned'}"><i></i>${p.status === 'live' ? 'LIVE DEMO' : 'IN DEVELOPMENT'}</span><span class="product-arrow" aria-hidden="true">↗</span></button>`).join('') : `<div class="no-results">NO MATCHES IN THIS EDITION. <button id="resetFilters" type="button">RESET FILTERS ↗</button></div>`;
  }
  filters.forEach(f => f.addEventListener('click', () => { selectedFilter=f.dataset.filter; filters.forEach(btn=>{const active=btn===f;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));}); draw(); }));
  search.addEventListener('input', draw);
  list.addEventListener('click', e => {
    if (e.target.id === 'resetFilters') { selectedFilter='all';search.value='';filters.forEach(b=>{let a=b.dataset.filter==='all';b.classList.toggle('active',a);b.setAttribute('aria-pressed',String(a));});draw();return; }
    const row = e.target.closest('[data-product]'); if(!row)return;
    const p = products.find(item=>item.id===row.dataset.product); if(!p)return;
    dialogContent.innerHTML = `<span class="dialog-kicker">DE—${p.id} / ${safe(p.kind)}</span><span class="dialog-status ${p.status==='live'?'live':''}">${p.status==='live'?'● LIVE DEMO':'○ IN DEVELOPMENT'}</span><h2 id="dialogTitle">${safe(p.name)}<span>.</span></h2><p class="dialog-lede">${safe(p.description)}</p><p class="dialog-detail">${safe(p.detail)}</p><div class="dialog-tags">${p.tags.map(tag=>`<span>${safe(tag)}</span>`).join('')}</div>${p.status==='live'?`<a class="dialog-action" href="${p.href}">OPEN LIVE TOOL ↗</a>`:`<button class="dialog-action muted" type="button" data-dialog-brief>REQUEST A SIMILAR BUILD ↗</button>`}<p class="dialog-note">${p.status==='live'?'Working first release — not yet listed for paid purchase.':'Concept listing — not currently for sale.'}</p>`;
    productDialog.showModal();
  });
  productDialog.addEventListener('click', e => { if(e.target===productDialog || e.target.closest('[data-close-dialog]'))productDialog.close(); if(e.target.closest('[data-dialog-brief]')){productDialog.close();briefDialog.showModal();}});
  document.querySelectorAll('[data-open-brief]').forEach(btn=>btn.addEventListener('click',()=>{menu.hidden=true;menuToggle.setAttribute('aria-expanded','false');briefDialog.showModal();}));
  briefDialog.addEventListener('click', e=>{if(e.target===briefDialog || e.target.closest('[data-close-brief]'))briefDialog.close();});
  menuToggle.addEventListener('click',()=>{menu.hidden=!menu.hidden;menuToggle.setAttribute('aria-expanded',String(!menu.hidden));});
  menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{menu.hidden=true;menuToggle.setAttribute('aria-expanded','false');}));
  briefForm.addEventListener('submit',async e=>{
    e.preventDefault(); const data = new FormData(briefForm);
    const brief = `RZ DIGITAL EMPIRE — PROJECT BRIEF\n\nPROJECT: ${data.get('project')}\nTYPE: ${data.get('category')}\nBUDGET: ${data.get('budget')}\n\nREQUIREMENTS:\n${data.get('description')}\n\nPrepared from RZ Digital Empire prototype.`;
    const status=document.querySelector('#briefStatus');
    try { await navigator.clipboard.writeText(brief); status.textContent='BRIEF COPIED. SAVE OR SEND IT USING YOUR PREFERRED CHANNEL.'; }
    catch { const ta=document.createElement('textarea');ta.value=brief;ta.className='clipboard-fallback';briefForm.append(ta);ta.focus();ta.select();status.textContent='SELECT AND COPY THE TEXT ABOVE TO KEEP YOUR BRIEF.'; }
  });
  document.querySelector('#copyrightYear').textContent = new Date().getFullYear();
  draw();
})();

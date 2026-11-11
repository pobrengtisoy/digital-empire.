/* RZ Digital Empire / Brand Desk — no dependencies, no server uploads. */
(() => {
  "use strict";
  const tool = document.body.dataset.rzDemo;
  if (!["ledger","arena","insight"].includes(tool)) return;
  const themes = {
    ledger: [
      {id:"atelier",label:"01 / STUDIO PAPER",stage:"#e8d8c9",ink:"#2b221f",fore:"#2b221f",accent:"#a3553d"},
      {id:"noir",label:"02 / NOIR EDITION",stage:"#24211d",ink:"#171714",fore:"#f1eadf",accent:"#e4bd78"},
      {id:"folio",label:"03 / BLUE FOLIO",stage:"#dbe2dd",ink:"#1c343d",fore:"#1c343d",accent:"#366b7d"}
    ],
    arena: [
      {id:"voltage",label:"01 / VOLTAGE",stage:"#191921",ink:"#14141b",fore:"#f6f6f0",accent:"#c8fb4d"},
      {id:"redline",label:"02 / REDLINE",stage:"#261b21",ink:"#171016",fore:"#fff4ed",accent:"#ff755c"},
      {id:"champion",label:"03 / CHAMPION",stage:"#e5dbca",ink:"#27231e",fore:"#27231e",accent:"#98723a"}
    ],
    insight: [
      {id:"tide",label:"01 / TIDAL",stage:"#d7e6e4",ink:"#15353c",fore:"#15353c",accent:"#207781"},
      {id:"nightlab",label:"02 / NIGHT LAB",stage:"#192b35",ink:"#101e26",fore:"#eaf6f3",accent:"#70ded3"},
      {id:"solar",label:"03 / SOLAR INDEX",stage:"#f0e8cb",ink:"#302d25",fore:"#302d25",accent:"#a66022"}
    ]
  };
  const meta = {
    ledger: {name:"RZ LEDGER",tagline:"Paperwork, with a point of view.",preset:"atelier"},
    arena: {name:"RZ ARENA",tagline:"Make every match look legendary.",preset:"voltage"},
    insight: {name:"RZ INSIGHT",tagline:"Your numbers. In their best light.",preset:"tide"}
  }[tool];
  const key = "rz-digital-empire-kit-v1-"+tool;
  const $ = id => document.getElementById(id);
  const fileSizeLimit = {logo:350000,background:1050000};
  const cleanText = (s,n) => typeof s === "string" ? s.trim().slice(0,n) : "";
  const validImage = str => typeof str==="string" && str.length<=1450000 && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(str);
  const validHex = s => typeof s==="string" && /^#[0-9a-fA-F]{6}$/.test(s);
  const base = () => ({name:meta.name,tagline:meta.tagline,preset:meta.preset,accent:themes[tool][0].accent,logo:"",background:""});
  function validate(value) {
    const result=base();
    if (!value || typeof value!=="object") return result;
    const p=themes[tool].find(t=>t.id===value.preset);
    if (p) {result.preset=p.id;result.accent=p.accent}
    if (cleanText(value.name,58)) result.name=cleanText(value.name,58);
    if (cleanText(value.tagline,100)) result.tagline=cleanText(value.tagline,100);
    if (validHex(value.accent)) result.accent=value.accent;
    if (validImage(value.logo) && value.logo.length<=fileSizeLimit.logo) result.logo=value.logo;
    if (validImage(value.background) && value.background.length<=fileSizeLimit.background) result.background=value.background;
    return result;
  }
  let kit=base();
  try {kit=validate(JSON.parse(localStorage.getItem(key)||"null"))} catch {}
  function make(tag,cl,text){
    const el=document.createElement(tag);if(cl)el.className=cl;if(text!==undefined)el.textContent=text;return el;
  }
  function downloadFile(name,body){
    const url=URL.createObjectURL(new Blob([body],{type:"application/json"}));
    const a=make("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function apply(){
    const scene=themes[tool].find(t=>t.id===kit.preset)||themes[tool][0];
    for(const [name,val] of Object.entries({
      "--rz-stage":scene.stage,
      "--rz-ink":scene.ink,
      "--rz-fore":scene.fore,
      "--rz-accent":kit.accent,
      "--rz-hero-photo":kit.background?'url("'+kit.background+'")':"none"
    }))document.body.style.setProperty(name,val);
    document.body.dataset.rzPreset=kit.preset;
    const badge=$("rzDemoSample");
    if(badge){
      $("rzSampleName").textContent=kit.name;
      $("rzSampleTagline").textContent=kit.tagline;
      const icon=$("rzSampleIcon");icon.replaceChildren();
      if(kit.logo){const img=make("img");img.src=kit.logo;img.alt="Uploaded demo logo";icon.append(img)}
      else icon.textContent="RZ";
    }
    const logo=$("rzPrintLogo");
    if(logo){logo.replaceChildren();if(kit.logo){const img=make("img");img.src=kit.logo;img.alt="";logo.append(img)}}
    const preview=$("rzKitPreview");
    if(preview){
      preview.querySelector(".rz-preview-name").textContent=kit.name;
      preview.querySelector(".rz-preview-tagline").textContent=kit.tagline;
      const mark=preview.querySelector(".rz-preview-mark");mark.replaceChildren();
      if(kit.logo){const img=make("img");img.src=kit.logo;img.alt="Custom logo preview";mark.append(img)}else mark.textContent="RZ";
      preview.style.setProperty("--rz-preview-stage",scene.stage);
      preview.style.setProperty("--rz-preview-accent",kit.accent);
      preview.style.setProperty("--rz-preview-fore",scene.fore);
    }
    document.dispatchEvent(new CustomEvent("rz:brand-updated",{detail:{tool,name:kit.name}}));
  }
  function persist(){
    try{localStorage.setItem(key,JSON.stringify(kit));return true}
    catch{return false}
  }
  function openOrClose(panel,btn,show){
    if(show&&!panel.open){panel.showModal();btn.setAttribute("aria-expanded","true")}
    else if(!show&&panel.open){panel.close();btn.setAttribute("aria-expanded","false")}
  }
  function showStatus(text,error=false){
    const el=$("rzKitStatus");el.textContent=text;el.dataset.error=error?"true":"false";
  }
  function setForm(){
    $("rzBrandName").value=kit.name;$("rzBrandTagline").value=kit.tagline;
    $("rzAccentInput").value=kit.accent;
    for(const item of document.querySelectorAll("[data-rz-preset]"))item.setAttribute("aria-pressed",String(item.dataset.rzPreset===kit.preset));
    $("rzLogoHint").textContent=kit.logo?"LOGO LOADED — REPLACE OR CLEAR":"PNG / JPG / WEBP • OPTIONAL";
    $("rzBackgroundHint").textContent=kit.background?"BACKGROUND LOADED — REPLACE OR CLEAR":"PNG / JPG / WEBP • OPTIONAL";
    apply();
  }
  function imageToData(file,isLogo){
    const maxBytes=isLogo?8e6:12e6, maxDim=isLogo?440:1500, maxData=isLogo?fileSizeLimit.logo:fileSizeLimit.background;
    return new Promise((resolve,reject)=>{
      if(!file||!["image/jpeg","image/png","image/webp"].includes(file.type))return reject(Error("Choose a PNG, JPG, or WEBP image."));
      if(file.size>maxBytes)return reject(Error("Image too large. Choose one under "+(maxBytes/1e6)+" MB."));
      const url=URL.createObjectURL(file),image=new Image();
      image.onload=()=>{
        URL.revokeObjectURL(url);
        try{
          const ratio=Math.min(1,maxDim/Math.max(image.naturalWidth,image.naturalHeight));
          const w=Math.max(1,Math.round(image.naturalWidth*ratio)),h=Math.max(1,Math.round(image.naturalHeight*ratio));
          const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
          const ctx=canvas.getContext("2d");if(!ctx)throw Error("Image processor unavailable.");
          ctx.drawImage(image,0,0,w,h);
          let out=canvas.toDataURL("image/webp",.77);
          if(!out.startsWith("data:image/webp"))out=canvas.toDataURL("image/jpeg",.73);
          if(out.length>maxData)throw Error("Compressed image is still too large. Try a simpler image.");
          resolve(out);
        }catch(e){reject(e)}
      };
      image.onerror=()=>{URL.revokeObjectURL(url);reject(Error("Could not read that image."))};
      image.src=url;
    });
  }
  function init(){
    const hero=document.querySelector(".tool-hero,.br-hero,.rr-hero");
    if(!hero)return;
    const sample=make("section","rz-brand-sample");sample.id="rzDemoSample";
    const icon=make("div","rz-sample-icon");icon.id="rzSampleIcon";
    const brand=make("div","rz-sample-brand");
    brand.append(make("span","rz-sample-label","RZ DIGITAL EMPIRE / EDITABLE DISPLAY"),make("strong","rz-sample-name",""));brand.lastChild.id="rzSampleName";
    const t=make("p","rz-sample-tagline","");t.id="rzSampleTagline";brand.append(t);
    const action=make("button","rz-sample-action","PERSONALIZE THIS EDITION ↗");action.type="button";action.dataset.rzOpen="true";
    sample.append(icon,brand,action);hero.insertAdjacentElement("afterend",sample);
    if(tool==="ledger"){
      const sheet=document.querySelector(".sheet-top>div:first-child");
      if(sheet){const logo=make("div","rz-print-logo");logo.id="rzPrintLogo";sheet.prepend(logo)}
    }
    const trigger=make("button","rz-lab-trigger","RZ / CUSTOMIZE ↗");trigger.id="rzLabTrigger";trigger.type="button";
    trigger.setAttribute("aria-controls","rzBrandDialog");trigger.setAttribute("aria-expanded","false");document.body.append(trigger);
    const panel=make("dialog","rz-brand-dialog");panel.id="rzBrandDialog";panel.setAttribute("aria-label","RZ Brand Desk");
    panel.innerHTML=`<div class="rz-dialog-top"><span>RZ DIGITAL EMPIRE <b>™</b></span><button type="button" id="rzCloseDesk" aria-label="Close brand editor">×</button></div>
      <div class="rz-dialog-content"><div class="rz-editor-head"><span>DESIGN DESK / PRIVATE LOCAL MODE</span><h2>MAKE IT<br><em>YOURS.</em></h2><p>Replace the demo identity with your own. Your edits stay in this browser. Export a brand kit to keep a backup.</p></div>
      <section class="rz-editor-section" aria-label="Brand details"><div class="rz-step">01 / BRAND IDENTITY</div>
        <label>COMPANY OR PROJECT NAME<input id="rzBrandName" maxlength="58" autocomplete="off" placeholder="Your company name"></label>
        <label>ONE-LINE SIGNATURE<input id="rzBrandTagline" maxlength="100" autocomplete="off" placeholder="Your tagline"></label>
      </section>
      <section class="rz-editor-section" aria-label="Visual treatments"><div class="rz-step">02 / TREATMENT — PICK A DIRECTION</div>
        <div id="rzSceneOptions" class="rz-scene-options"></div>
        <label class="rz-accent-row">PERSONAL ACCENT COLOR <input id="rzAccentInput" type="color" aria-label="Choose your brand accent color"></label>
      </section>
      <section class="rz-editor-section" aria-label="Brand materials"><div class="rz-step">03 / YOUR VISUAL MATERIAL</div>
        <label class="rz-asset-upload">UPLOAD LOGO <small id="rzLogoHint"></small><input type="file" id="rzLogoFile" accept="image/png,image/jpeg,image/webp"></label>
        <button type="button" class="rz-file-clear" id="rzRemoveLogo">REMOVE LOGO ×</button>
        <label class="rz-asset-upload">UPLOAD BACKGROUND <small id="rzBackgroundHint"></small><input type="file" id="rzBackgroundFile" accept="image/png,image/jpeg,image/webp"></label>
        <button type="button" class="rz-file-clear" id="rzRemoveBackground">REMOVE BACKGROUND ×</button>
      </section>
      <section class="rz-editor-section" aria-label="Live brand specimen"><div class="rz-step">04 / PREVIEW — YOUR IDENTITY</div><div class="rz-kit-preview" id="rzKitPreview">
        <div class="rz-preview-mark">RZ</div><div><strong class="rz-preview-name"></strong><p class="rz-preview-tagline"></p></div><span class="rz-preview-index">RZ / LIVE</span>
      </div></section>
      <div class="rz-desk-actions"><button type="button" id="rzSaveKit" class="rz-save-btn">APPLY & SAVE IDENTITY ↗</button><div class="rz-desk-row"><button type="button" id="rzExportKit">EXPORT BRAND KIT ↓</button><label>IMPORT KIT ↑<input id="rzImportKit" type="file" accept=".json,application/json" hidden></label><button type="button" id="rzResetKit">RESET</button></div><p class="rz-desk-status" id="rzKitStatus" role="status">YOUR DESIGN STAYS ON THIS DEVICE.</p></div>
      </div>`;
    document.body.append(panel);
    const scenes=$("rzSceneOptions");
    themes[tool].forEach((sc)=>{
      const button=make("button","rz-scene");button.type="button";button.dataset.rzPreset=sc.id;
      button.append(make("span","rz-scene-color"),make("span","rz-scene-name",sc.label));
      button.firstChild.style.background=sc.stage;button.firstChild.style.borderColor=sc.accent;
      button.addEventListener("click",()=>{kit.preset=sc.id;kit.accent=sc.accent;setForm();showStatus("TREATMENT PREVIEW UPDATED — SAVE TO KEEP IT.")});
      scenes.append(button);
    });
    function doOpen(){setForm();openOrClose(panel,trigger,true)}
    trigger.addEventListener("click",doOpen);action.addEventListener("click",doOpen);
    $("rzCloseDesk").addEventListener("click",()=>openOrClose(panel,trigger,false));
    panel.addEventListener("close",()=>trigger.setAttribute("aria-expanded","false"));
    panel.addEventListener("click",e=>{if(e.target===panel)panel.close()});
    for(const [id,prop,max] of [["rzBrandName","name",58],["rzBrandTagline","tagline",100]]){
      $(id).addEventListener("input",e=>{kit[prop]=e.target.value.slice(0,max);apply()});
    }
    $("rzAccentInput").addEventListener("input",e=>{if(validHex(e.target.value)){kit.accent=e.target.value;apply()}});
    [["rzLogoFile","logo",true],["rzBackgroundFile","background",false]].forEach(([id,prop,isLogo])=>{
      $(id).addEventListener("change",async e=>{
        const file=e.target.files?.[0];if(!file)return;
        showStatus("PREPARING IMAGE LOCALLY…");
        try{kit[prop]=await imageToData(file,isLogo);setForm();showStatus("IMAGE PREVIEW READY — APPLY & SAVE TO KEEP IT.")}
        catch(err){showStatus(err.message||"COULD NOT LOAD IMAGE",true)}
        finally{e.target.value=""}
      });
    });
    $("rzRemoveLogo").addEventListener("click",()=>{kit.logo="";setForm();showStatus("LOGO REMOVED FROM PREVIEW.")});
    $("rzRemoveBackground").addEventListener("click",()=>{kit.background="";setForm();showStatus("BACKGROUND REMOVED FROM PREVIEW.")});
    $("rzSaveKit").addEventListener("click",()=>{
      kit=validate({...kit,name:$("rzBrandName").value,tagline:$("rzBrandTagline").value});
      if(persist()){setForm();showStatus("SAVED ON THIS DEVICE. DOWNLOAD YOUR KIT FOR BACKUP.");setTimeout(()=>panel.close(),550)}
      else showStatus("BROWSER STORAGE IS FULL OR DISABLED. EXPORT THE KIT TO KEEP IT.",true);
    });
    $("rzExportKit").addEventListener("click",()=>{
      downloadFile("rz-"+tool+"-brand-kit.json",JSON.stringify({format:"rz-brand-kit-v1",tool,settings:validate(kit)},null,2));
      showStatus("YOUR BRANDED KIT WAS EXPORTED AS JSON.");
    });
    $("rzImportKit").addEventListener("change",async e=>{
      const file=e.target.files?.[0];if(!file)return;
      try{
        if(file.size>2200000)throw Error("Kit exceeds the 2.2 MB import limit.");
        const item=JSON.parse(await file.text());
        if(item.format!=="rz-brand-kit-v1"||item.tool!==tool||!item.settings||typeof item.settings!=="object")throw Error("This brand kit belongs to a different tool, or has an invalid format.");
        kit=validate(item.settings);setForm();showStatus("BRAND KIT IMPORTED. PRESS APPLY & SAVE TO STORE IT.");
      }catch(err){showStatus(err.message||"COULD NOT IMPORT KIT.",true)}
      finally{e.target.value=""}
    });
    $("rzResetKit").addEventListener("click",()=>{
      if(!confirm("Restore this tool's RZ demo branding?"))return;
      kit=base();persist();setForm();showStatus("RZ DEMO IDENTITY RESTORED.");
    });
    apply();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
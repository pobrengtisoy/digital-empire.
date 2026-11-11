/* RZ FORM 009 / Local-first editable site; no remote upload and no dependencies. */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const MAX_LOGO=360000,MAX_BG=1350000;
const fields={company:48,issue:30,eyebrow:82,headline1:38,headline2:38,intro:220,story1:38,story2:38,about:450,service1:50,service2:50,service3:50,contactNote:160,cta:35,contactLink:250};
const storageKey="rz-form-site-kit-v1";
const defaults=()=>({
 theme:"archive",company:"RZ FORM",issue:"EST. 2026",eyebrow:"INDEPENDENT STUDIO / MADE WITH INTENT",
 headline1:"MAKE IT",headline2:"UNMISTAKABLE.",
 intro:"Design, development and creative direction for businesses ready to look like themselves.",
 story1:"BUILT FOR",story2:"THE PEOPLE.",about:"Every brand has a real story. We shape that story into a space customers remember. No copy-paste identity. No unnecessary noise. Just deliberate work.",
 service1:"WEBSITE DESIGN",service2:"VISUAL IDENTITY",service3:"DIGITAL SYSTEMS",
 contactNote:"Have something worth making? Start with a conversation.",
 cta:"START A CONVERSATION",contactLink:"#contact",logo:"",background:""
});
const validImage=value=>typeof value==="string" && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value);
function cleanConfig(input){
 const d=defaults(),o={...d};
 if(!input||typeof input!=="object")return o;
 if(["archive","blackbook","signal"].includes(input.theme))o.theme=input.theme;
 for(const [key,limit] of Object.entries(fields)) if(typeof input[key]==="string")o[key]=input[key].trim().slice(0,limit);
 if(validImage(input.logo)&&input.logo.length<=MAX_LOGO)o.logo=input.logo;
 if(validImage(input.background)&&input.background.length<=MAX_BG)o.background=input.background;
 return o;
}
function contactHref(link){
 const raw=String(link||"").trim();
 if(raw==="#contact")return "#contact";
 if(/^https:\/\//i.test(raw)){try{const url=new URL(raw);return url.protocol==="https:"?url.href:"#contact"}catch{return "#contact"}}
 if(/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(raw))return raw;
 if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw))return "mailto:"+raw;
 return "#contact";
}
let data=defaults();
try{data=cleanConfig(JSON.parse(localStorage.getItem(storageKey)||"null"))}catch{}
const status=(message,error=false)=>{const el=$("siteEditorStatus");el.textContent=message;el.dataset.error=String(error)};
function setBrandIcon(element){
 element.replaceChildren();
 if(data.logo){
  const img=document.createElement("img");img.src=data.logo;img.alt="";
  img.loading="lazy";element.append(img);
 }else element.textContent="RZ";
}
function render(){
 document.body.dataset.siteTheme=data.theme;
 for(const [name,value] of Object.entries(data)){
  if(!(name in fields))continue;
  document.querySelectorAll('[data-display="'+name+'"]').forEach(el=>{el.textContent=value||" "});
 }
 document.querySelectorAll("[data-logo]").forEach(setBrandIcon);
 const pic=$("sfHeroPhoto");pic.classList.toggle("has-image",Boolean(data.background));
 pic.style.backgroundImage=data.background?'url("'+data.background+'")':"none";
 const link=contactHref(data.contactLink);
 document.querySelectorAll("[data-contact-link]").forEach(el=>{
  el.href=link;
  if(link.startsWith("https://")){el.target="_blank";el.rel="noopener noreferrer"}
  else {el.removeAttribute("target");el.removeAttribute("rel")}
 });
 document.querySelectorAll("[data-theme]").forEach(btn=>btn.setAttribute("aria-pressed",String(btn.dataset.theme===data.theme)));
}
function populate(){
 document.querySelectorAll("[data-input]").forEach(el=>{el.value=data[el.dataset.input]??""});
 render();
}
function save(){try{localStorage.setItem(storageKey,JSON.stringify(data));status("SAVED IN THIS BROWSER. EXPORT JSON TO BACK IT UP.");return true}catch{status("STORAGE UNAVAILABLE OR FULL. EXPORT JSON TO KEEP YOUR WORK.",true);return false}}
function blobDownload(filename,contents){
 const url=URL.createObjectURL(new Blob([contents],{type:"application/json"}));
 const link=document.createElement("a");link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function compressImage(file,maxDim,maxChars){
 return new Promise((resolve,reject)=>{
  if(!file||!["image/jpeg","image/png","image/webp"].includes(file.type))return reject(Error("Choose a PNG, JPG or WEBP image."));
  if(file.size>10*1024*1024)return reject(Error("Maximum source image size is 10 MB."));
  const url=URL.createObjectURL(file);const image=new Image();
  image.onload=()=>{
   URL.revokeObjectURL(url);
   try{
    const scale=Math.min(1,maxDim/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext("2d");if(!ctx)throw Error("Canvas not available in this browser.");
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    let out=canvas.toDataURL("image/webp",.78);
    if(!out.startsWith("data:image/webp"))out=canvas.toDataURL("image/jpeg",.72);
    if(out.length>maxChars)throw Error("This image is still too large after compression. Try a smaller one.");
    resolve(out);
   }catch(error){reject(error)}
  };
  image.onerror=()=>{URL.revokeObjectURL(url);reject(Error("Could not decode this image."))};
  image.src=url;
 });
}
function openEditor(){
 if(!$("siteCustomizer").open)$("siteCustomizer").showModal();
 $("openCustomizer").setAttribute("aria-expanded","true");
 populate();
}
function init(){
 const dlg=$("siteCustomizer");
 $("openCustomizer").addEventListener("click",openEditor);
 $("closeCustomizer").addEventListener("click",()=>dlg.close());
 dlg.addEventListener("close",()=>$("openCustomizer").setAttribute("aria-expanded","false"));
 dlg.addEventListener("click",e=>{if(e.target===dlg)dlg.close()});
 $("sfYear").textContent=String(new Date().getFullYear());
 document.querySelectorAll("[data-input]").forEach(el=>{
  el.addEventListener("input",()=>{const key=el.dataset.input;if(!(key in fields))return;data[key]=el.value.slice(0,fields[key]);render()});
 });
 document.querySelectorAll("[data-theme]").forEach(btn=>btn.addEventListener("click",()=>{
  data.theme=btn.dataset.theme;render();status("THEME PREVIEW UPDATED. SAVE WHEN YOU'RE HAPPY WITH IT.");
 }));
 [["siteLogoFile","logo",520,MAX_LOGO],["siteBgFile","background",1600,MAX_BG]].forEach(([id,key,dim,maxChars])=>{
  $(id).addEventListener("change",async e=>{
   const file=e.target.files?.[0];if(!file)return;
   status("PREPARING YOUR IMAGE LOCALLY…");
   try{data[key]=await compressImage(file,dim,maxChars);render();status("IMAGE ADDED TO THE PREVIEW. SAVE OR EXPORT THE KIT TO KEEP IT.")}
   catch(error){status(error.message||"IMAGE COULD NOT BE PROCESSED.",true)}
   finally{e.target.value=""}
  });
 });
 $("removeSiteLogo").addEventListener("click",()=>{data.logo="";render();status("LOGO REMOVED FROM PREVIEW.")});
 $("removeSiteBg").addEventListener("click",()=>{data.background="";render();status("BACKGROUND REMOVED FROM PREVIEW.")});
 $("saveSiteKit").addEventListener("click",()=>{
  data=cleanConfig(data);populate();if(save())setTimeout(()=>dlg.close(),350);
 });
 $("exportSiteKit").addEventListener("click",()=>{
  const content=JSON.stringify({format:"rz-form-kit-v1",edition:"009",data:cleanConfig(data)},null,2);
  blobDownload("rz-form-website-brand-kit.json",content);
  status("BRAND KIT EXPORTED. THIS IS NOT A SITE SOURCE-CODE PACKAGE.");
 });
 $("importSiteKit").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
   if(file.size>2300000)throw Error("File exceeds 2.3 MB.");
   const input=JSON.parse(await file.text());
   if(input.format!=="rz-form-kit-v1"||input.edition!=="009"||!input.data||typeof input.data!=="object")throw Error("Unsupported brand kit.");
   data=cleanConfig(input.data);populate();status("KIT IMPORTED. PRESS SAVE TO KEEP IT ON THIS DEVICE.");
  }catch(error){status(error.message||"KIT COULD NOT BE IMPORTED.",true)}
  finally{e.target.value=""}
 });
 $("resetSiteKit").addEventListener("click",()=>{
  if(!confirm("Reset this website preview to the original RZ sample?"))return;
  data=defaults();populate();save();status("RESTORED THE ORIGINAL RZ EDITION.");
 });
 populate();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
})();
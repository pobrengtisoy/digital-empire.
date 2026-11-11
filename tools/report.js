function parseDelimited(text, delimiter=","){
  const s=String(text??"").replace(/^\uFEFF/,"");
  const rows=[];let row=[],cell="",quoted=false;
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(quoted){
      if(c==='"'&&s[i+1]==='"'){cell+='"';i++}
      else if(c==='"'){quoted=false}
      else cell+=c;
    }else{
      if(c==='"'&&cell.trim()===""){quoted=true;cell=""}
      else if(c===delimiter){row.push(cell.trim());cell=""}
      else if(c==="\r"||c==="\n"){
        row.push(cell.trim());cell="";
        if(row.some(v=>v.length))rows.push(row);
        row=[];if(c==="\r"&&s[i+1]==="\n")i++;
      }else cell+=c;
    }
  }
  if(quoted)throw new Error("A quoted cell was not closed. Check your CSV file.");
  row.push(cell.trim());if(row.some(v=>v.length))rows.push(row);
  return rows;
}

function guessDelimiter(text){
  const s=String(text??"").replace(/^\uFEFF/,"");let best=",",largest=-1;
  for(const d of [",",";","\t"]){
    const rows=parseDelimited(s.slice(0,Math.min(s.length,16000)),d);
    const counts=rows.slice(0,8).map(r=>r.length).filter(n=>n>1);
    const score=counts.length ? counts.length*10 + Math.min(...counts) : -1;
    if(score>largest){largest=score;best=d}
  }
  return best;
}

function numericValue(value){
  let s=String(value??"").trim();if(!s)return NaN;
  let neg=s.startsWith("(")&&s.endsWith(")");
  if(neg)s=s.slice(1,-1);
  s=s.replace(/[₱$€£,\s]/g,"");
  if(!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(s))return NaN;
  const n=Number(s)*(neg?-1:1);
  return Number.isFinite(n)?n:NaN;
}

function prepareCSV(raw){
  const all=parseDelimited(raw,guessDelimiter(raw));
  if(all.length<2)throw Error("Please provide a header row and at least one data row.");
  if(all.length>10001)throw Error("This demo supports up to 10,000 data rows.");
  const longest=Math.max(...all.map(r=>r.length));
  if(longest>30)throw Error("This demo supports up to 30 columns.");
  const first=all.shift();
  const seen=new Set();
  const headers=Array.from({length:longest},(_,i)=>{
    const base=String(first[i]||"").trim()||`Column ${i+1}`;
    let name=base,n=2;
    while(seen.has(name.toLowerCase()))name=`${base} ${n++}`;
    seen.add(name.toLowerCase());return name;
  });
  const values=all.map(r=>headers.map((_,i)=>r[i]??""));
  const numeric=headers.map((header,i)=>({
    index:i,
    count:values.slice(0,Math.min(400,values.length)).filter(r=>Number.isFinite(numericValue(r[i]))).length
  })).filter(v=>v.count>0).map(v=>v.index);
  return {headers,values,numeric};
}

function makeReport(data,groupIndex,metricIndex){
  const grouped=new Map();let total=0,valid=0;
  data.values.forEach(row=>{
    let label=groupIndex===-1?"ALL RECORDS":String(row[groupIndex]??"").trim()||"(blank)";
    if(label.length>100)label=label.slice(0,97)+"…";
    if(!grouped.has(label))grouped.set(label,{label,rows:0,sum:0,values:0});
    const g=grouped.get(label);g.rows++;
    if(metricIndex>=0){
      const n=numericValue(row[metricIndex]);
      if(Number.isFinite(n)){g.sum+=n;g.values++;total+=n;valid++}
    }
  });
  const entries=[...grouped.values()];
  entries.sort((a,b)=> metricIndex<0?b.rows-a.rows:b.sum-a.sum || b.rows-a.rows);
  return {entries,total,valid,rows:data.values.length,groups:entries.length,metricIndex};
}

function csvEscape(value){const s=String(value??"");return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}

function initApp(){
  const $=id=>document.getElementById(id);
  const MAX_BYTES=2*1024*1024;
  const sample=`Date,Channel,Region,Item,Units,Amount
2026-11-01,Online,Negros,Menu setup,2,2398
2026-11-01,Referral,Manila,Landing page,1,4999
2026-11-02,Online,Cebu,Invoice utility,3,1197
2026-11-03,Walk-in,Negros,QR menu,1,999
2026-11-03,Online,Manila,Booking site,1,5499
2026-11-04,Referral,Negros,Menu setup,2,2398
2026-11-05,Online,Cebu,Invoice utility,5,1995
2026-11-06,Online,Manila,Invoice utility,1,399
2026-11-07,Walk-in,Cebu,QR menu,2,1998
2026-11-08,Online,Negros,Booking site,1,5499
2026-11-09,Referral,Manila,Menu setup,1,1199
2026-11-10,Online,Negros,Invoice utility,4,1596`;
  let data=null;
  let fileName="";let report=null;
  const status=(text,error=false)=>{const el=$("reportStatus");el.textContent=text;el.dataset.error=String(error)};
  const format=(n,dec=2)=>new Intl.NumberFormat("en-PH",{minimumFractionDigits:dec,maximumFractionDigits:dec}).format(n);
  const q=(label)=>{const el=document.createElement("span");el.textContent=label;return el};
  const csvDownload=(name,content,mime)=>{
    const blob=new Blob([content],{type:mime||"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),15000);
  };
  const choose=(select,items,initial)=>{
    select.replaceChildren();
    items.forEach(({value,name})=>{const option=document.createElement("option");option.value=String(value);option.textContent=name;select.append(option)});
    select.value=String(initial);
  };
  function loadCSV(raw,name){
    data=prepareCSV(raw);fileName=name;
    const by=data.headers.map((h,i)=>({value:i,name:h}));
    const metric=[{value:-1,name:"Count records"},...data.numeric.map(i=>({value:i,name:data.headers[i]}))];
    const likelyGroup=data.headers.findIndex(h=>/category|channel|region|status|type|department|item/i.test(h));
    const likelyAmount=data.numeric.find(i=>/amount|revenue|total|sales|price|value/i.test(data.headers[i]));
    choose($("groupBy"),[{value:-1,name:"All records"},...by],likelyGroup===-1?(data.headers.length>0?0:-1):likelyGroup);
    choose($("metricBy"),metric,likelyAmount===undefined?-1:likelyAmount);
    $("groupBy").disabled=false;$("metricBy").disabled=false;
    $("downloadCSV").disabled=false;$("downloadJSON").disabled=false;$("printReport").disabled=false;
    $("fileLabel").textContent=name.toUpperCase();
    status(`${format(data.values.length,0)} RECORDS LOADED LOCALLY. YOUR FILE HAS NOT BEEN UPLOADED.`);
    redraw();
  }
  function setText(id,value){$(id).textContent=value}
  function redraw(){
    if(!data)return;
    const group=Number($("groupBy").value),metric=Number($("metricBy").value);
    report=makeReport(data,group,metric);
    setText("rowCount",format(report.rows,0));
    setText("fieldCount",format(data.headers.length,0));
    setText("groupCount",format(report.groups,0));
    setText("totalCount",metric<0?format(report.rows,0):format(report.total,2));
    setText("totalLabel",metric<0?"TOTAL RECORDS":"TOTAL / "+data.headers[metric].toUpperCase());
    setText("figureLabel",metric<0?"COUNTS BY CATEGORY":"TOTAL "+data.headers[metric].toUpperCase()+" / BY CATEGORY");
    setText("sectionLabel",group===-1?"ENTIRE DATASET":"GROUPED BY "+data.headers[group].toUpperCase());
    const barArea=$("barArea");barArea.replaceChildren();
    const entries=report.entries.slice(0,8);
    const largest=Math.max(1,...entries.map(item=>metric<0?item.rows:Math.max(0,item.sum)));
    entries.forEach((item,i)=>{
      const value=metric<0?item.rows:item.sum;
      const line=document.createElement("div");line.className="rr-bar-row";
      const num=document.createElement("span");num.className="rr-bar-index";num.textContent=String(i+1).padStart(2,"0");
      const label=document.createElement("strong");label.className="rr-bar-label";label.textContent=item.label;
      const track=document.createElement("div");track.className="rr-bar-track";
      const fill=document.createElement("i");fill.style.width=`${Math.max(0,value)/largest*100}%`;track.append(fill);
      const val=document.createElement("b");val.className="rr-bar-value";val.textContent=metric<0?format(value,0):format(value);
      line.append(num,label,track,val);barArea.append(line);
    });
    if(report.entries.length>8){const more=document.createElement("p");more.className="rr-more";more.textContent=`TOP 8 OF ${report.groups} GROUPS DISPLAYED. ALL GROUPS ARE INCLUDED IN EXPORTS.`;barArea.append(more)}
    const table=$("tablePreview");table.replaceChildren();
    const head=document.createElement("tr");
    data.headers.forEach(h=>{const th=document.createElement("th");th.textContent=h;head.append(th)});
    table.append(head);
    const tbody=$("tableRows");tbody.replaceChildren();
    data.values.slice(0,8).forEach(row=>{const tr=document.createElement("tr");row.forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.append(td)});tbody.append(tr)});
    setText("previewNote",`SHOWING FIRST ${Math.min(8,data.values.length)} OF ${format(data.values.length,0)} ROWS / NO CLOUD UPLOAD`);
    const active=metric<0?`${format(report.rows,0)} RECORDS`:`${format(report.valid,0)} NUMERIC ENTRIES COUNTED`;
    setText("dataNote",`${active} / ${format(report.groups,0)} GROUPS`);
  }
  $("sampleBtn").addEventListener("click",()=>{try{loadCSV(sample,"DEMO SALES RECORDS.CSV")}catch(e){status(e.message,true)}});
  $("csvFile").addEventListener("change",async(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    if(file.size>MAX_BYTES){status("FILE TOO LARGE. LIMIT: 2 MB.",true);return}
    try{const raw=await file.text();loadCSV(raw,file.name)}
    catch(err){status(err.message||"COULD NOT READ FILE.",true)}
    finally{e.target.value=""}
  });
  ["groupBy","metricBy"].forEach(id=>$(id).addEventListener("change",redraw));
  $("downloadCSV").addEventListener("click",()=>{
    if(!report)return;
    const metric=Number($("metricBy").value),header=metric<0?"Count":"Sum of "+data.headers[metric];
    const rows=[["Group","Records",header,"Valid numbers"],...report.entries.map(e=>[e.label,e.rows,metric<0?e.rows:e.sum,metric<0?e.rows:e.values])];
    csvDownload("digital-empire-report.csv",rows.map(r=>r.map(csvEscape).join(",")).join("\r\n"),"text/csv;charset=utf-8");
    status("SUMMARY CSV DOWNLOADED. NO DATA WAS SENT TO A SERVER.");
  });
  $("downloadJSON").addEventListener("click",()=>{
    if(!report)return;
    const metric=Number($("metricBy").value);
    const output={source:fileName,generatedAt:new Date().toISOString(),groupedBy:Number($("groupBy").value)===-1?"All records":data.headers[Number($("groupBy").value)],metric:metric<0?"Count":data.headers[metric],totals:{rows:report.rows,columns:data.headers.length,groups:report.groups,total:report.total,validValues:report.valid},groups:report.entries};
    csvDownload("digital-empire-report.json",JSON.stringify(output,null,2),"application/json");
    status("SUMMARY JSON DOWNLOADED. NO DATA WAS SENT TO A SERVER.");
  });
  $("printReport").addEventListener("click",()=>{if(report)window.print()});
  $("resetReport").addEventListener("click",()=>{
    data=null;report=null;fileName="";
    $("groupBy").disabled=true;$("metricBy").disabled=true;
    ["downloadCSV","downloadJSON","printReport"].forEach(id=>$(id).disabled=true);
    $("groupBy").replaceChildren();$("metricBy").replaceChildren();
    $("fileLabel").textContent="NO DATA FILE LOADED";
    ["rowCount","fieldCount","groupCount","totalCount"].forEach(id=>setText(id,"—"));
    setText("totalLabel","TOTAL VALUE");setText("sectionLabel","AWAITING DATA");
    $("barArea").replaceChildren();$("tablePreview").replaceChildren();$("tableRows").replaceChildren();
    setText("previewNote","UPLOAD A CSV OR USE THE SAMPLE DATASET TO BEGIN.");
    setText("dataNote","READY WHEN YOU ARE");
    status("WORKSPACE CLEARED. ALL FILE PROCESSING STAYS IN THIS BROWSER.");
  });
  // A real sample is offered to keep this demo inspectable without a file upload.
  $("sampleBtn").click();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initApp);else initApp();

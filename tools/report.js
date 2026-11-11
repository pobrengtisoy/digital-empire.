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
  const s=String(text??"").replace(/^\uFEFF/,"");
  const totals={",":0,";":0,"\t":0};
  let quoted=false,lines=0;
  for(let i=0;i<s.length&&i<40000;i++){
    const c=s[i];
    if(c==='"'){if(quoted&&s[i+1]==='"'){i++}else quoted=!quoted}
    else if(!quoted){
      if(c===","||c===";"||c==="\t")totals[c]++;
      if(c==="\n"){lines++;if(lines>=12)break}
    }
  }
  return [",",";","\t"].sort((a,b)=>totals[b]-totals[a])[0];
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

function csvEscape(value){
  let s=String(value??"");
  if(typeof value==="string"&&/^\s*[=+@-]/.test(s))s="'"+s;
  return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initApp);else initApp();

const run=$('Build Research Prompt').first().json;
const response=$json.body;
const c=response.candidates?.[0];
if (!c || c.finishReason!=='STOP') throw new Error('Gemini returned no complete answer. Inspect block/finish reason; retry or raise output limit.');
const text=(c.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join('');
const grounding=c.groundingMetadata;
if (!grounding?.webSearchQueries?.length || !grounding?.groundingChunks?.length) throw new Error('No search grounding evidence returned. Do not publish a memory-only answer. Try a supported Gemini model.');
let data;
try {data=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));} catch {throw new Error('Malformed research JSON: fail closed. Inspect Gemini response.');}
if (!Array.isArray(data.items) || !Array.isArray(data.coverage) || data.items.length>run.config.max_items) throw new Error('Invalid evidence schema / item limit.');
const host=u=>{const m=/^https:\/\/([^/:?#]+)(?::443)?(?:[/?#]|$)/i.exec(u||''); if(!m) throw new Error('HTTPS source link required');return m[1].toLowerCase().replace(/^www\./,'');};
const allowed=run.config.sources.map(s=>host(s.url));
const validDate=v=>v===null || (typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v);
const seen=new Set(), rejected=[];
const validationWarnings=[];
for(const [index,support] of (grounding.groundingSupports||[]).entries()) {
 if(!Array.isArray(support.groundingChunkIndices) || support.groundingChunkIndices.some(i=>!Number.isInteger(i)||i<0||i>=grounding.groundingChunks.length)) {
  validationWarnings.push(`Grounding support ${index+1} references a missing source chunk. Grounding metadata is inconsistent; it does not establish item-level support.`);
 }
}
const enums={type:['paper','standard','conference','webinar'],date_type:['published','updated','unknown'],access:['full_text','abstract_only','metadata_only'],publication_status:['preprint','published','draft','approved','announcement','unknown']};
const items=[];
for (const [i, original] of data.items.entries()) {
 const item={...original};
 const reasons=[],normalizations=[];
 for (const key of ['title','source','link','summary','relevance','type','access','publication_status','date_type']) if(typeof item[key]!=='string' || !item[key].trim()) throw new Error(`Item ${i+1}: invalid ${key}`);
 for (const key of ['author','evidence','evidence_location']) if(item[key]!==null && typeof item[key]!=='string') throw new Error(`Item ${i+1}: invalid ${key}`);
 for (const key of ['date','event_date','deadline']) if(!validDate(item[key])) throw new Error(`Item ${i+1}: invalid ${key}`);
 for(const [field,values] of Object.entries(enums)) if(!values.includes(item[field])) reasons.push(`Invalid ${field}: ${JSON.stringify(item[field])}. Allowed: ${values.join(', ')}.`);
 if(item.date && item.date>run.today) throw new Error('Future publication date: distinguish event date.');
 if((item.date===null)!==(item.date_type==='unknown')) throw new Error('Date/date_type mismatch.');
 // Unwrap only an unambiguous Markdown link whose label and target are identical.
 const markdown=/^\[(https:\/\/[^\s]+)\]\((https:\/\/[^\s]+)\)$/.exec(item.link.trim());
 if(markdown && markdown[1]===markdown[2]) {item.link=markdown[2];normalizations.push('Identical Markdown URL wrapper removed');}
 let h;
 try {
  if(/[\s<>\\]/.test(item.link)) throw new Error('Invalid URL characters');
  h=host(item.link);
 } catch {reasons.push('Invalid link: provide one plain HTTPS source URL, without Markdown or placeholders.');}
 if(h) {
  if(!allowed.some(a=>h===a || h.endsWith('.'+a))) reasons.push('Outside configured source domains');
  else if(!run.config.sources.some(s=>{const a=host(s.url);return (h===a || h.endsWith('.'+a)) && s.types.includes(item.type);})) reasons.push('Item type excluded by source configuration');
  if(h==='arxiv.org' || h.endsWith('.arxiv.org')) {
   const arxivPath=item.link.replace(/^https:\/\/[^/]+/,'').split(/[?#]/)[0];
   if(!/^\/(?:abs|pdf)\/(?:\d{2}(?:0[1-9]|1[0-2])\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v[1-9]\d*)?(?:\.pdf)?$/.test(arxivPath)) reasons.push('Invalid arXiv paper identifier: placeholder or non-paper URL; a real abs/pdf identifier is required.');
  }
 }
 if(reasons.length) {rejected.push({input_index:i+1,title:item.title,reason:reasons.join(' '),original});continue;}
 const recent=item.date && item.date>=run.start && item.date<=run.today;
 const upcoming=['conference','webinar'].includes(item.type) && item.event_date && item.event_date>=run.today && item.event_date<=run.until;
 if(!recent && !upcoming) {rejected.push({title:item.title,reason:'Outside window or date unknown'});continue;}
 const key=item.link.replace(/#.*$/,'').replace(/\?.*$/,'').replace(/\/$/,'');
 if(seen.has(key)) {rejected.push({title:item.title,reason:'Duplicate source URL in this run'});continue;}
 seen.add(key);
 items.push({...item,id:'E'+String(items.length+1).padStart(2,'0'),verification:'Human verification required',flags:[...normalizations,...(!item.author?['Author unknown']:[]),...(!item.evidence?['No supporting excerpt']:[]),...(item.access!=='full_text'?['Full text not checked']:[]),...(validationWarnings.length?['Inconsistent grounding metadata; verify original source independently']:[])]});
}
const coverage=run.config.sources.map(s=>{
 const row=data.coverage.find(c=>c.source===s.name);
 return {source:s.name,status:['searched','inaccessible','not_searched'].includes(row?.status)?row.status:'not_searched',note:typeof row?.note==='string'?row.note:'No source coverage report returned'};
});
if(data.items.length && !items.length) validationWarnings.push('All returned candidates were excluded. This is not evidence that no relevant updates exist. Review the rejection reasons and rerun research.');
return [{json:{owner:run.owner,repo:run.repo,branch:run.branch,api:run.api,prefix:run.prefix,sourceRevision:run.sourceRevision,workflowBuild:run.workflowBuild,runId:run.runId,config:run.config,today:run.today,start:run.start,until:run.until,items,coverage,rejected,grounding,validationWarnings,createdAt:new Date().toISOString()}}];

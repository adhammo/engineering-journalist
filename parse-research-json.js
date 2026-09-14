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
const items=[];
for (const [i, item] of data.items.entries()) {
 for (const key of ['title','source','link','summary','relevance','type','access','publication_status','date_type']) if(typeof item[key]!=='string' || !item[key].trim()) throw new Error(`Item ${i+1}: invalid ${key}`);
 for (const key of ['author','evidence','evidence_location']) if(item[key]!==null && typeof item[key]!=='string') throw new Error(`Item ${i+1}: invalid ${key}`);
 for (const key of ['date','event_date','deadline']) if(!validDate(item[key])) throw new Error(`Item ${i+1}: invalid ${key}`);
 if(!['paper','standard','conference','webinar'].includes(item.type) || !['published','updated','unknown'].includes(item.date_type) || !['full_text','abstract_only','metadata_only'].includes(item.access) || !['preprint','published','draft','approved','announcement','unknown'].includes(item.publication_status)) throw new Error('Invalid item enum.');
 if(item.date && item.date>run.today) throw new Error('Future publication date: distinguish event date.');
 if((item.date===null)!==(item.date_type==='unknown')) throw new Error('Date/date_type mismatch.');
 const h=host(item.link);
 if(!allowed.some(a=>h===a || h.endsWith('.'+a))) {rejected.push({title:item.title,reason:'Outside configured source domains'});continue;}
 if(!run.config.sources.some(s=>{const a=host(s.url);return (h===a || h.endsWith('.'+a)) && s.types.includes(item.type);})) {rejected.push({title:item.title,reason:'Item type excluded by source configuration'});continue;}
 const recent=item.date && item.date>=run.start && item.date<=run.today;
 const upcoming=['conference','webinar'].includes(item.type) && item.event_date && item.event_date>=run.today && item.event_date<=run.until;
 if(!recent && !upcoming) {rejected.push({title:item.title,reason:'Outside window or date unknown'});continue;}
 const key=item.link.replace(/#.*$/,'').replace(/\?.*$/,'').replace(/\/$/,'');
 if(seen.has(key)) {rejected.push({title:item.title,reason:'Duplicate source URL in this run'});continue;}
 seen.add(key);
 items.push({...item,id:'E'+String(items.length+1).padStart(2,'0'),verification:'Human verification required',flags:[...(!item.author?['Author unknown']:[]),...(!item.evidence?['No supporting excerpt']:[]),...(item.access!=='full_text'?['Full text not checked']:[])]});
}
const coverage=run.config.sources.map(s=>{
 const row=data.coverage.find(c=>c.source===s.name);
 return {source:s.name,status:['searched','inaccessible','not_searched'].includes(row?.status)?row.status:'not_searched',note:typeof row?.note==='string'?row.note:'No source coverage report returned'};
});
return [{json:{owner:run.owner,repo:run.repo,branch:run.branch,api:run.api,prefix:run.prefix,sourceRevision:run.sourceRevision,workflowBuild:run.workflowBuild,runId:run.runId,config:run.config,today:run.today,start:run.start,until:run.until,items,coverage,rejected,grounding,createdAt:new Date().toISOString()}}];

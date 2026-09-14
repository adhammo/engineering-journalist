const run=$('Build Research Prompt').first().json;
const response=$json.body ?? $json;
const agentEnvelope=typeof response.output==='string';
const searchEvidence=[];
if(agentEnvelope) {
 for(const step of response.intermediateSteps||[]) {
  if(step.action?.tool!=='searxng-search') continue;
  const observation=step.observation;
  let results=[];
  if(typeof observation==='string') {
   try {const parsed=JSON.parse(observation);results=Array.isArray(parsed)?parsed:[parsed];}
   catch {try {results=JSON.parse('['+observation+']');}catch {}}
  }
  searchEvidence.push({query:step.action.toolInput,observation,results:results.filter(r=>typeof r?.link==='string'&&/^https:\/\/\S+$/.test(r.link))});
 }
 if(!searchEvidence.length) throw new Error('Research returned no search tool trace. Connect SearXNG and enable Return Intermediate Steps on Research.');
 response.text=response.output;
}
const c=response.candidates?.[0];
const textEnvelope=!c&&typeof response.text==='string';
if(!c&&!textEnvelope) throw new Error('Unsupported research input format: expected the Research node text field or a raw Gemini candidates array.');
const finishReason=c?c.finishReason:response.finishReason;
if((c||finishReason!==undefined)&&finishReason!=='STOP') throw new Error(`Gemini returned no complete answer (finishReason=${finishReason||'missing'}). Inspect the raw response for a block or truncation; an output-limit increase is relevant only for token-limit truncation.`);
const text=textEnvelope?response.text:(Array.isArray(c.content?.parts)?c.content.parts:[]).filter(p=>p&&!p.thought&&typeof p.text==='string').map(p=>p.text).join('');
if(!text.trim()) throw new Error(`Gemini returned an empty answer (finishReason=${finishReason||'not forwarded'}, responseId=${response.responseId||'unknown'}). Rerun Research; missing text cannot be interpreted as no updates.`);
const grounding=(c?c.groundingMetadata:response.groundingMetadata) ?? {};
const queries=Array.isArray(grounding.webSearchQueries)?grounding.webSearchQueries.filter(q=>typeof q==='string'&&q.trim()):[];
const chunks=Array.isArray(grounding.groundingChunks)?grounding.groundingChunks:[];
const usableChunks=chunks.filter(chunk=>typeof chunk?.web?.uri==='string'&&/^https?:\/\/\S+$/.test(chunk.web.uri));
let data;
try {data=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));} catch {throw new Error('Malformed research JSON: fail closed. Inspect Gemini response.');}
if (!Array.isArray(data.items) || !Array.isArray(data.coverage)) throw new Error('Invalid evidence schema.');
// Search activity and returned source evidence are different conditions.
// A search with zero candidates can legitimately have no groundingChunks.
const unverifiedText=textEnvelope&&!usableChunks.length&&!agentEnvelope;
if(!textEnvelope&&!queries.length && !usableChunks.length) {
 throw new Error(`No search activity or source evidence in Gemini metadata (queries=0, usable_sources=0, items=${data.items.length}). Check Gemini Research sends tools: [{google_search:{}}], then rerun that node. Search-suggestion HTML alone is not source evidence.`);
}
if(!textEnvelope&&data.items.length && !usableChunks.length) throw new Error(`Gemini returned ${data.items.length} candidate(s) but no usable grounding source chunks (queries=${queries.length}). Candidates cannot proceed without source evidence. Rerun research.`);
const researchStatus=agentEnvelope?(searchEvidence.some(s=>s.results.length)?'search_results_returned':'search_attempted_no_usable_results'):unverifiedText?'unverified_model_output':usableChunks.length?'sources_returned':'searched_no_usable_sources';
const host=u=>{const m=/^https:\/\/([^/:?#]+)(?::443)?(?:[/?#]|$)/i.exec(u||''); if(!m) throw new Error('HTTPS source link required');return m[1].toLowerCase().replace(/^www\./,'');};
const allowed=run.config.sources.map(s=>host(s.url));
const validDate=v=>v===null || (typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v);
const seen=new Set(), rejected=[];
const validationWarnings=[];
if(agentEnvelope) validationWarnings.push('Search tool responses retained in searchEvidence. Results are search snippets, not verified full pages. First-page retrieval and agent capacity limit coverage; an empty response or tool failure does not establish that no relevant results exist. Verify dates, authors and claims at original sources.');
if(unverifiedText) validationWarnings.push('Research returned text without provider source metadata. Web search and factual accuracy are not established. Treat entries as unverified leads; independently open and verify original sources before selecting Read. Empty results do not establish that no updates exist.');
if(textEnvelope&&!agentEnvelope&&finishReason===undefined) validationWarnings.push('Text envelope omitted finishReason. JSON structure was validated, but upstream completion status was not supplied.');
if(researchStatus==='searched_no_usable_sources') validationWarnings.push(`Search activity recorded (${queries.length} queries), but no usable source evidence or candidates returned. Research coverage is incomplete; this does not establish that no relevant updates exist.`);
if(!queries.length && usableChunks.length) validationWarnings.push('Source chunks returned, but search-query details are absent. Verify the sources independently.');
for(const [index,support] of (grounding.groundingSupports||[]).entries()) {
 if(!Array.isArray(support.groundingChunkIndices) || support.groundingChunkIndices.some(i=>!Number.isInteger(i)||i<0||i>=chunks.length)) {
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
 if(agentEnvelope&&!searchEvidence.some(s=>s.results.some(r=>r.link===item.link))) reasons.push('URL not returned by the search tool in this execution');
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
 const key=item.link.replace(/#.*$/,'').replace(/\?.*$/,'').replace(/\/$/,'');
 if(seen.has(key)) {rejected.push({title:item.title,reason:'Duplicate source URL in this run'});continue;}
 seen.add(key);
 items.push({...item,id:'E'+String(items.length+1).padStart(2,'0'),verification:'Human verification required',flags:[...normalizations,...(!item.author?['Author unknown']:[]),...(!item.evidence?['No supporting excerpt']:[]),...(item.access!=='full_text'?['Full text not checked']:[]),...(validationWarnings.length?['Review retrieval limitations; verify original source independently']:[])]});
}
// Sort deterministically by publication/update date; unknown dates last. Assign IDs after sorting.
items.sort((a,b)=>(b.date||'').localeCompare(a.date||'') || a.link.localeCompare(b.link));
items.forEach((item,index)=>{item.id='E'+String(index+1).padStart(2,'0');});
const coverage=run.config.sources.map(s=>{
 const row=data.coverage.find(c=>c.source===s.name);
 return {source:s.name,status:unverifiedText?'not_verified':['searched','inaccessible','not_searched'].includes(row?.status)?row.status:'not_searched',note:typeof row?.note==='string'?row.note:'No source coverage report returned'};
});
if(data.items.length && !items.length) validationWarnings.push('All returned candidates were excluded. This is not evidence that no relevant updates exist. Review the rejection reasons and rerun research.');
return [{json:{owner:run.owner,repo:run.repo,branch:run.branch,api:run.api,prefix:run.prefix,sourceRevision:run.sourceRevision,workflowBuild:run.workflowBuild,runId:run.runId,config:run.config,today:run.today,items,coverage,rejected,grounding,searchEvidence,researchStatus,validationWarnings,createdAt:new Date().toISOString()}}];

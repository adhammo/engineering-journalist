const run=$('Render Draft Dashboard').first().json;
const form=$json.body ?? $json;
if(typeof form.Reviewer!=='string' || !form.Reviewer.trim()) throw new Error('Reviewer is required.');
const decisions={};
if(typeof form.Decisions==='string') {
 for(const line of form.Decisions.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)) {
  const match=/^(E\d+)\s*=\s*(Read|Ignore|Investigate)$/.exec(line);
  if(!match) throw new Error(`Invalid decision line: ${line}. Use E01=Read, E02=Ignore or E03=Investigate.`);
  if(Object.hasOwn(decisions,match[1])) throw new Error(`Duplicate decision for ${match[1]}.`);
  if(!run.items.some(item=>item.id===match[1])) throw new Error(`Unknown item ID ${match[1]}.`);
  decisions[match[1]]=match[2];
 }
}
const items=run.items.map(item=>{
 const decision=typeof form.Decisions==='string'?decisions[item.id]:form[item.id];
 if(!['Read','Ignore','Investigate'].includes(decision)) throw new Error(`Missing explicit decision for ${item.id}. Nothing published.`);
 return {...item,decision};
});
if(items.some(item=>item.decision==='Read')&&form['Source verification']!=='Confirmed') throw new Error('Confirm independent source verification for all Read items, or mark them Investigate.');
return [{json:{...run,items,sourceVerification:form['Source verification']||'Needs investigation',reviewer:form.Reviewer.trim(),reviewNotes:form['Review notes']||'',reviewedAt:new Date().toISOString()}}];

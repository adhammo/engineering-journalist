const run=$('Render Draft Dashboard').first().json;
const form=$json.body ?? $json;
if(typeof form.Reviewer!=='string' || !form.Reviewer.trim()) throw new Error('Reviewer is required.');
const items=run.items.map(item=>{
 const decision=form[item.id];
 if(!['Read','Ignore','Investigate'].includes(decision)) throw new Error(`Missing explicit decision for ${item.id}. Nothing published.`);
 return {...item,decision};
});
return [{json:{...run,items,reviewer:form.Reviewer.trim(),reviewNotes:form['Review notes']||'',reviewedAt:new Date().toISOString()}}];

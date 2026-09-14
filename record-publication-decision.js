const run=$('Render Reviewed Dashboard').first().json;
const form=$json.body??$json;
if(!['Approve','Reject'].includes(form.Decision)) throw new Error('An explicit publication decision is required.');
if(typeof form.Approver!=='string' || !form.Approver.trim()) throw new Error('Approver name is required.');
const saved=$('Archive Reviewed Draft').first().json.body;
if(!saved?.commit?.sha || !saved?.content?.sha) throw new Error('Draft commit identity missing.');
const decision={runId:run.runId,decision:form.Decision,approver:form.Approver.trim(),notes:form.Notes||'',at:new Date().toISOString(),draftPath:run.draftPath,draftCommit:saved.commit.sha,draftBlob:saved.content.sha,sourceRevision:run.sourceRevision,workflowBuild:run.workflowBuild};
return [{json:{...decision,approved:form.Decision==='Approve',api:run.api,branch:run.branch,
  body:{message:`Publication ${form.Decision.toLowerCase()} ${run.runId}`,branch:run.branch,content:Buffer.from(JSON.stringify(decision,null,2)).toString('base64')}}}];

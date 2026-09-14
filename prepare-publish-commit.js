// Publish bytes fetched from the EXACT approved commit, not the moving review.html pointer.
const current=$json;
const approved=$('Fetch Approved Review').first().json;
const decision=$('Record Publication Decision').first().json;
const run=$('Render Reviewed Dashboard').first().json;
if(!decision.approved) throw new Error('Publication was not approved.');
if(![200,404].includes(current.statusCode)) throw new Error('Cannot read current index.html. Refusing overwrite.');
if(approved.statusCode!==200 || approved.body.sha!==decision.draftBlob || approved.body.encoding!=='base64') throw new Error('Approved draft identity mismatch.');
const content=approved.body.content.replace(/\s/g,'');
if(content!==run.archiveBody.content) throw new Error('Approved draft content differs from reviewed bytes.');
const body={message:`Publish approved briefing ${run.runId}`,branch:run.branch,content};
if(current.statusCode===200) body.sha=current.body.sha;
return [{json:{url:run.api+'index.html',body}}];

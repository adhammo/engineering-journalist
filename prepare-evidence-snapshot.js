// A retry may reuse a run path. Never replace previously archived evidence with different bytes.
const run=$('Render Draft Dashboard').first().json;
const current=$json;
if(![200,404].includes(current.statusCode)) throw new Error('Cannot check archived evidence snapshot. Refusing write.');
const body={...run.commit};
if(current.statusCode===200) {
 const file=current.body;
 if(file?.encoding!=='base64'||typeof file.content!=='string'||typeof file.sha!=='string'||!file.sha) throw new Error('Existing evidence snapshot metadata is incomplete. Refusing write.');
 if(file.content.replace(/\s/g,'')!==body.content) throw new Error('This run already has a different evidence snapshot. Start a fresh execution from Manual Trigger with Repository Settings unpinned to generate a new run ID. Archived evidence will not be overwritten.');
 body.sha=file.sha;
}
return [{json:{url:run.api+run.reviewPath,body}}];

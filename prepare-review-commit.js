// review.html is a convenient latest-draft pointer. Approval refers to the immutable per-run draft.
if(![200,404].includes($json.statusCode)) throw new Error('Cannot read current review.html. Refusing overwrite.');
const run=$('Render Reviewed Dashboard').first().json;
const body={...run.archiveBody};
if($json.statusCode===200) body.sha=$json.body.sha;
return [{json:{url:run.api+'review.html',body}}];

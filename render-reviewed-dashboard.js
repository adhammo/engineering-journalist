// @include render-report.js
const run=$json;
// Use the template captured before research, never a newer template from the branch.
const finalHtml=render(run,$('Build Research Prompt').first().json.dashboardTemplate,true);
const {reviewHtml,commit,...audit}=run;
const draftPath=`runs/${run.runId}/review.html`;
const auditPath=`runs/${run.runId}/evidence.json`;
return [{json:{...run,finalHtml,audit,draftPath,auditPath,
  draftPagesUrl:`https://${run.owner}.github.io/${run.repo}/${draftPath}`,
  archiveBody:{message:`Briefing draft ${run.runId}`,branch:run.branch,content:Buffer.from(finalHtml).toString('base64')},
  auditBody:{message:`Evidence and human decisions ${run.runId}`,branch:run.branch,content:Buffer.from(JSON.stringify(audit,null,2)).toString('base64')}}}];

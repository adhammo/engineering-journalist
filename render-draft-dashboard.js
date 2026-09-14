// @include render-report.js
const run=$json;
const template=$('Build Research Prompt').first().json.dashboardTemplate;
const reviewHtml=render(run,template);
const reviewPath=`runs/${run.runId}/evidence.html`;
return [{json:{...run,reviewHtml,reviewPath,
  reviewGithubUrl:`https://github.com/${run.owner}/${run.repo}/blob/${encodeURIComponent(run.branch)}/${reviewPath}`,
  reviewPagesUrl:`https://${run.owner}.github.io/${run.repo}/${reviewPath}`,
  commit:{message:`Evidence snapshot ${run.runId}`,branch:run.branch,content:Buffer.from(reviewHtml).toString('base64')}}}];

const run=$('Render Reviewed Dashboard').first().json;
return [{json:{status:'Published approved briefing',runId:run.runId,
  sourceRevision:run.sourceRevision,publicationCommit:$json.body.commit.sha,
  dashboard:`https://${run.owner}.github.io/${run.repo}/`,
  archive:`https://${run.owner}.github.io/${run.repo}/${run.draftPath}`,
  audit:`https://github.com/${run.owner}/${run.repo}/blob/${encodeURIComponent(run.branch)}/${run.auditPath}`,
  read:run.items.filter(x=>x.decision==='Read').length,
  investigate:run.items.filter(x=>x.decision==='Investigate').length,
  ignore:run.items.filter(x=>x.decision==='Ignore').length}}];

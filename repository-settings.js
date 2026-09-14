// Repository coordinates only. Research scope lives in engineering-journalist.config.json.
const owner = 'adhammo';
const repo = 'engineering-journalist';
const branch = 'main';
const base = `https://api.github.com/repos/${owner}/${repo}`;
return [{json:{owner,repo,branch,base,api:base+'/contents/',prefix:'runs',
  workflowBuild:'__WORKFLOW_BUILD__',
  runId:new Date().toISOString().replace(/[:.]/g,'-')+'-'+$execution.id}}];

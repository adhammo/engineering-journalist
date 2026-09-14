const setup = $('Repository Settings').first().json;
const sourceRevision = $('Resolve Source Revision').first().json.body.sha;
if (!/^[a-f0-9]{40}$/.test(sourceRevision || '')) throw new Error('GitHub source revision is missing.');
function read(name) {
  const r=$(name).first().json;
  if(r.statusCode!==200 || !r.body.content || r.body.encoding!=='base64') throw new Error(`Cannot read ${name}. Push all project files to ${setup.owner}/${setup.repo} first.`);
  return Buffer.from(r.body.content,'base64').toString('utf8');
}
const config=JSON.parse(read('Fetch Config'));
const template=read('Fetch Prompt Template');
const dashboardTemplate=read('Fetch Dashboard Template');
if(typeof config.topic!=='string' || !config.topic.trim()) throw new Error('Config topic required.');
for(const key of ['keywords','exclusions','audience','sources']) if(!Array.isArray(config[key])) throw new Error(`Config ${key} must be an array.`);
for(const key of ['lookback_days','upcoming_days','max_items']) if(!Number.isInteger(config[key]) || config[key]<1) throw new Error(`Invalid ${key}.`);
if(config.max_items>8 || config.lookback_days>90 || config.upcoming_days>366) throw new Error('Demo limits: max_items <=8, lookback_days <=90, upcoming_days <=366.');
if(!/^[a-zA-Z0-9._-]+$/.test(config.gemini_model)) throw new Error('Configure a Google Search-capable Gemini model available to your key.');
const types=['paper','conference','standard','webinar'];
for(const s of config.sources) {
  if(typeof s.name!=='string' || !/^https:\/\/[^/]+/.test(s.url) || !Array.isArray(s.types) || !s.types.length || s.types.some(t=>!types.includes(t))) throw new Error('Each source needs name, HTTPS URL and valid types.');
}
if(!config.sources.length) throw new Error('At least one source required.');
const today=new Date().toISOString().slice(0,10);
const start=new Date(Date.parse(today)-config.lookback_days*86400000).toISOString().slice(0,10);
const until=new Date(Date.parse(today)+config.upcoming_days*86400000).toISOString().slice(0,10);
const replacements={CONFIG_JSON:JSON.stringify(config),MAX_ITEMS:String(config.max_items),TODAY:today,START_DATE:start,UPCOMING_UNTIL:until};
for(const key of Object.keys(replacements)) if(!template.includes('{{'+key+'}}')) throw new Error(`Prompt template missing ${key}.`);
// Single pass: never treat placeholder-like text inside config values as instructions to substitute.
const prompt=template.replace(/\{\{(CONFIG_JSON|MAX_ITEMS|TODAY|START_DATE|UPCOMING_UNTIL)\}\}/g,(_,k)=>replacements[k]);
return [{json:{...setup,sourceRevision,config,today,start,until,prompt,dashboardTemplate,
  body:{contents:[{role:'user',parts:[{text:prompt}]}],tools:[{google_search:{}}],generationConfig:{temperature:0.1,maxOutputTokens:16000}}}}];

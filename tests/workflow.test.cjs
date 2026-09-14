const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const w=JSON.parse(read('engineering-journalist.json'));
const nodes=Object.fromEntries(w.nodes.map(n=>[n.name,n]));
const context={};
let count=0;
function test(name,fn){fn();console.log('PASS '+name);count++;}
function execute(name,input,extra={}){
 const lookup=n=>({first:()=>({json:{...context,...extra}[n]})});
 return new Function('$json','$','Buffer','$execution',nodes[name].parameters.jsCode)(input,lookup,Buffer,{id:'test-fixture'})[0].json;
}
function fileResponse(text){return {statusCode:200,body:{encoding:'base64',content:Buffer.from(text).toString('base64')}};}
const config=JSON.parse(read('engineering-journalist.config.json'));
context['Repository Settings']=execute('Repository Settings',{});
context['Resolve Source Revision']={statusCode:200,body:{sha:'a'.repeat(40)}};
context['Fetch Config']=fileResponse(JSON.stringify(config));
context['Fetch Prompt Template']=fileResponse(read('research_prompt_template.md'));
context['Fetch Dashboard Template']=fileResponse(read('dashboard_template.html'));
const research=execute('Build Research Prompt',{});
context['Build Research Prompt']=research;
const item={title:'TEST FIXTURE — IC paper',author:'Test Author',source:'arXiv',date:research.today,date_type:'published',link:'https://arxiv.org/abs/0000.00000',type:'paper',event_date:null,deadline:null,evidence:'TEST <script>alert(1)</script> excerpt',evidence_location:'Abstract',summary:'TEST FIXTURE summary, not real research.',relevance:'TEST FIXTURE relevance judgment.',access:'abstract_only',publication_status:'preprint'};
function response(items=[item]){return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({items,coverage:[{source:'arXiv',status:'searched',note:'TEST FIXTURE'}]})}]},groundingMetadata:{webSearchQueries:['TEST FIXTURE'],groundingChunks:[{web:{uri:item.link,title:item.title}}]}}]}};}
const validate=r=>execute('Parse Research JSON',r);
test('Export matches source-controlled code',()=>execFileSync(process.execPath,[path.join(root,'scripts/build-workflow.cjs'),'--check'],{stdio:'pipe'}));
test('All Code nodes compile',()=>{for(const n of w.nodes)if(n.type.endsWith('.code'))new Function(n.parameters.jsCode);});
test('All connections and cross-node references exist',()=>{
 for(const [from,c]of Object.entries(w.connections)){assert(nodes[from]);for(const port of c.main)for(const target of port)assert(nodes[target.node]);}
 for(const n of w.nodes)for(const match of JSON.stringify(n.parameters).matchAll(/\$\('([^']+)'\)/g))assert(nodes[match[1]],match[1]);
});
test('Target repository configured, no embedded credentials',()=>{assert.equal(context['Repository Settings'].owner,'adhammo');assert.equal(context['Repository Settings'].repo,'engineering-journalist');assert(w.nodes.every(n=>!n.credentials));});
test('Inactive export and disabled schedule',()=>{assert.equal(w.active,false);assert(nodes['Weekly Schedule'].disabled);});
test('Config, prompt and template fetch one pinned source revision',()=>{for(const name of ['Fetch Config','Fetch Prompt Template','Fetch Dashboard Template'])assert(nodes[name].parameters.url.includes("$('Resolve Source Revision').first().json.body.sha"));});
test('Topic comes from config file, not workflow logic',()=>{const r=execute('Build Research Prompt',{}, {'Fetch Config':fileResponse(JSON.stringify({...config,topic:'Analog RF test'}))});assert.equal(r.config.topic,'Analog RF test');assert(r.prompt.includes('Analog RF test'));});
test('Missing config stops without seeding defaults',()=>assert.throws(()=>execute('Build Research Prompt',{}, {'Fetch Config':{statusCode:404}})));
test('Invalid source revision stops',()=>assert.throws(()=>execute('Build Research Prompt',{}, {'Resolve Source Revision':{body:{sha:null}}})));
test('Missing prompt placeholder stops',()=>assert.throws(()=>execute('Build Research Prompt',{}, {'Fetch Prompt Template':fileResponse('incomplete')})));
test('Invalid source types stop',()=>assert.throws(()=>execute('Build Research Prompt',{}, {'Fetch Config':fileResponse(JSON.stringify({...config,sources:[{name:'bad',url:'https://example.com',types:['advertisement']}]}))})));
test('More than eight candidates is rejected in config',()=>assert.throws(()=>execute('Build Research Prompt',{}, {'Fetch Config':fileResponse(JSON.stringify({...config,max_items:9}))})));
test('Prompt placeholders do not recursively alter config values',()=>{const r=execute('Build Research Prompt',{}, {'Fetch Config':fileResponse(JSON.stringify({...config,topic:'{{TODAY}} literal'}))});assert(r.prompt.includes('{{TODAY}} literal'));});
test('Valid grounded evidence passes',()=>assert.equal(validate(response()).items.length,1));
test('Missing grounding fails closed',()=>{const r=response();delete r.body.candidates[0].groundingMetadata;assert.throws(()=>validate(r));});
test('Malformed JSON fails closed',()=>{const r=response();r.body.candidates[0].content.parts[0].text='{bad';assert.throws(()=>validate(r));});
test('Truncated response fails closed',()=>{const r=response();r.body.candidates[0].finishReason='MAX_TOKENS';assert.throws(()=>validate(r));});
test('Future publication date rejected',()=>assert.throws(()=>validate(response([{...item,date:'2099-01-01'}]))));
test('Impossible date rejected',()=>assert.throws(()=>validate(response([{...item,date:'2026-02-30'}]))));
test('Unknown author is explicit',()=>assert(validate(response([{...item,author:null}])).items[0].flags.includes('Author unknown')));
test('Duplicate URL filtered',()=>{const r=validate(response([item,item]));assert.equal(r.items.length,1);assert.equal(r.rejected.length,1);});
test('Unconfigured domain filtered',()=>assert.equal(validate(response([{...item,link:'https://attacker.invalid/paper'}])).items.length,0));
test('Unconfigured source type filtered',()=>assert.equal(validate(response([{...item,type:'standard'}])).items.length,0));
test('Old paper filtered',()=>assert.equal(validate(response([{...item,date:'2001-01-01'}])).items.length,0));
test('Upcoming event with unknown announcement date retained',()=>assert.equal(validate(response([{...item,type:'conference',link:'https://www.isscc.org/program',source:'ISSCC',date:null,date_type:'unknown',event_date:research.until}])).items.length,1));
test('Zero eligible items is a valid evidence artifact',()=>assert.equal(validate(response([])).items.length,0));
const evidence=validate(response([item,{...item,link:item.link+'1'},{...item,link:item.link+'2'}]));
const draft=execute('Render Draft Dashboard',evidence);
context['Render Draft Dashboard']=draft;
test('External template is used and tokens substituted',()=>{assert(draft.reviewHtml.startsWith('<!doctype html>'));assert(!/__BODY__|__HEADER__|__COVERAGE__/.test(draft.reviewHtml));assert(draft.reviewHtml.includes('TEST FIXTURE'));});
test('Source HTML escaped',()=>{assert(!draft.reviewHtml.includes('<script>alert(1)</script>'));assert(draft.reviewHtml.includes('&lt;script&gt;'));});
test('Missing template token stops rendering',()=>assert.throws(()=>execute('Render Draft Dashboard',evidence,{'Build Research Prompt':{...research,dashboardTemplate:'bad'}})));
test('Private resume URL never appears in report',()=>assert(!draft.reviewHtml.includes('resumeFormUrl')));
test('Source revision and workflow build retained',()=>{assert.equal(draft.sourceRevision,'a'.repeat(40));assert(/^[a-f0-9]{64}$/.test(draft.workflowBuild));});
test('Review form requires populated slots only',()=>{
 const fields=nodes['Human Evidence Review'].parameters.formFields.values;
 assert.equal(fields.length,10);
 for(const [i,f]of fields.slice(1,-1).entries()){
  assert(!f.defaultValue);
  const required=new Function('$','return ('+f.requiredField.slice(3,-3)+')')(n=>({first:()=>({json:draft})}));
  assert.equal(required,i<3);
 }
});
test('Missing human decision prevents output',()=>assert.throws(()=>execute('Apply Human Decisions',{Reviewer:'Trainer',E01:'Read'})));
const decisions=execute('Apply Human Decisions',{Reviewer:'Trainer',E01:'Read',E02:'Ignore',E03:'Investigate','Review notes':'TEST FIXTURE'});
const reviewed=execute('Render Reviewed Dashboard',decisions);
context['Render Reviewed Dashboard']=reviewed;
test('Three-way decisions create one reading item',()=>{assert(reviewed.finalHtml.includes('Weekly reading list (1)'));assert(reviewed.finalHtml.includes('Investigate (1)'));assert(reviewed.finalHtml.includes('Ignored (1)'));});
test('Audit includes source version, decisions and grounding',()=>{const a=JSON.parse(Buffer.from(reviewed.auditBody.content,'base64'));assert(a.grounding);assert.equal(a.items[2].decision,'Investigate');assert.equal(a.sourceRevision,'a'.repeat(40));});
test('Rendered archive bytes equal preview bytes',()=>assert.equal(Buffer.from(reviewed.archiveBody.content,'base64').toString('utf8'),reviewed.finalHtml));
context['Archive Reviewed Draft']={body:{commit:{sha:'b'.repeat(40)},content:{sha:'c'.repeat(40)}}};
test('Publication requires explicit decision',()=>assert.throws(()=>execute('Record Publication Decision',{Approver:'Trainer'})));
test('Rejection is recorded normally',()=>{const r=execute('Record Publication Decision',{Approver:'Trainer',Decision:'Reject'});assert.equal(r.approved,false);assert.equal(r.draftCommit,'b'.repeat(40));});
test('Reject branch cannot reach publisher',()=>{const stop=w.connections['Approved?'].main[1][0].node;assert.equal(stop,'Rejected — keep current dashboard');assert(!w.connections[stop]);});
const approval=execute('Record Publication Decision',{Approver:'Trainer',Decision:'Approve'});
context['Record Publication Decision']=approval;
context['Fetch Approved Review']={statusCode:200,body:{sha:approval.draftBlob,encoding:'base64',content:reviewed.archiveBody.content}};
test('Approved fetch is pinned to draft commit',()=>assert(nodes['Fetch Approved Review'].parameters.url.includes("$('Record Publication Decision').first().json.draftCommit")));
test('Publisher preserves exact approved bytes',()=>{const p=execute('Prepare Publish Commit',{statusCode:200,body:{sha:'old-index'}});assert.equal(p.body.content,reviewed.archiveBody.content);assert.equal(p.body.sha,'old-index');});
test('First publication omits SHA',()=>assert(!execute('Prepare Publish Commit',{statusCode:404}).body.sha));
test('Draft blob mismatch prevents publication',()=>assert.throws(()=>execute('Prepare Publish Commit',{statusCode:404},{'Fetch Approved Review':{statusCode:200,body:{sha:'other',encoding:'base64',content:reviewed.archiveBody.content}}})));
test('Draft byte mismatch prevents publication',()=>assert.throws(()=>execute('Prepare Publish Commit',{statusCode:404},{'Fetch Approved Review':{statusCode:200,body:{sha:approval.draftBlob,encoding:'base64',content:Buffer.from('changed').toString('base64')}}})));
test('Rejected draft cannot publish even if branch miswired',()=>assert.throws(()=>execute('Prepare Publish Commit',{statusCode:404},{'Record Publication Decision':{...approval,approved:false}})));
test('Index fetch error prevents overwrite',()=>assert.throws(()=>execute('Prepare Publish Commit',{statusCode:403})));
test('Review-pointer update uses SHA',()=>assert.equal(execute('Prepare Review Commit',{statusCode:200,body:{sha:'old-review'}}).body.sha,'old-review'));
const tmp=path.join(root,'tmp');fs.mkdirSync(tmp,{recursive:true});
fs.writeFileSync(path.join(tmp,'dashboard-test.html'),reviewed.finalHtml);
console.log(`${count} offline tests passed. No external API execution.`);

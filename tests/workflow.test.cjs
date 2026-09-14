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
const item={title:'TEST FIXTURE — IC paper',author:'Test Author',source:'arXiv',date:research.today,date_type:'published',link:'https://arxiv.org/abs/2609.0001',type:'paper',event_date:null,deadline:null,evidence:'TEST <script>alert(1)</script> excerpt',evidence_location:'Abstract',summary:'TEST FIXTURE summary, not real research.',relevance:'TEST FIXTURE relevance judgment.',access:'abstract_only',publication_status:'preprint'};
function response(items=[item]){return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({items,coverage:[{source:'arXiv',status:'searched',note:'TEST FIXTURE'}]})}]},groundingMetadata:{webSearchQueries:['TEST FIXTURE'],groundingChunks:[{web:{uri:item.link,title:item.title}}]}}]}};}
const validate=r=>execute('Parse Research JSON',r);
test('Export matches source-controlled code',()=>execFileSync(process.execPath,[path.join(root,'scripts/build-workflow.cjs'),'--check'],{stdio:'pipe'}));
test('All Code nodes compile',()=>{for(const n of w.nodes)if(n.type.endsWith('.code'))new Function(n.parameters.jsCode);});
test('Every workflow parameter expression compiles',()=>{
 function check(value,location){
  if(typeof value==='string'&&value.startsWith('={{')) {
   assert(value.endsWith('}}'),location);
   assert.doesNotThrow(()=>new Function('$','$json','return ('+value.slice(3,-2)+')'),location);
  } else if(value&&typeof value==='object')for(const [key,child]of Object.entries(value))check(child,location+'.'+key);
 }
 for(const n of w.nodes)check(n.parameters,n.name);
});
test('Both review descriptions evaluate without embedded-string syntax errors',()=>{
 const lookup=()=>({first:()=>({json:{reviewPagesUrl:'https://example.org/evidence.html',reviewGithubUrl:'https://github.com/example/repo/blob/main/evidence.html',items:[],draftPagesUrl:'https://example.org/draft.html',owner:'example',repo:'repo',draftPath:'runs/test/review.html',body:{commit:{sha:'a'.repeat(40)}}}})});
 for(const name of ['Human Evidence Review','Human Publication Approval']) {
  const expression=nodes[name].parameters.formDescription;
  const description=new Function('$','return ('+expression.slice(3,-2)+')')(lookup);
  assert(description.includes('<br>'));assert(description.includes('https://'));
 }
});
test('All connections and cross-node references exist',()=>{
 for(const [from,c]of Object.entries(w.connections)){assert(nodes[from]);for(const port of Object.values(c).flat())for(const target of port)assert(nodes[target.node]);}
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
test('Prompt placeholders do not recursively alter config values',()=>{const r=execute('Build Research Prompt',{}, {'Fetch Config':fileResponse(JSON.stringify({...config,topic:'{{TODAY}} literal'}))});assert(r.prompt.includes('{{TODAY}} literal'));});
test('Valid grounded evidence passes',()=>assert.equal(validate(response()).items.length,1));
test('Missing grounding fails closed',()=>{const r=response();delete r.body.candidates[0].groundingMetadata;assert.throws(()=>validate(r));});
test('Reported empty search response passes with incomplete-coverage warning',()=>{
 const r=response([]);r.body.candidates[0].groundingMetadata={webSearchQueries:Array.from({length:12},(_,i)=>'TEST query '+i),searchEntryPoint:{renderedContent:'<div>Search suggestions</div>'}};
 const parsed=validate(r);assert.equal(parsed.items.length,0);assert.equal(parsed.researchStatus,'searched_no_usable_sources');
 assert(parsed.validationWarnings.some(x=>x.includes('12 queries')&&x.includes('does not establish')));
 assert(execute('Render Draft Dashboard',parsed).reviewHtml.includes('Research coverage is incomplete'));
});
test('Search without source chunks cannot pass nonempty candidates',()=>{const r=response();delete r.body.candidates[0].groundingMetadata.groundingChunks;assert.throws(()=>validate(r),/candidate.*no usable grounding source chunks/);});
test('Empty answer without search evidence is still blocked',()=>{const r=response([]);delete r.body.candidates[0].groundingMetadata;assert.throws(()=>validate(r),/No search activity/);});
test('Search suggestion HTML alone does not prove search or sources',()=>{const r=response([]);r.body.candidates[0].groundingMetadata={searchEntryPoint:{renderedContent:'<div>suggestions</div>'}};assert.throws(()=>validate(r),/No search activity/);});
test('Usable source chunks without query list pass with warning',()=>{const r=response();delete r.body.candidates[0].groundingMetadata.webSearchQueries;const parsed=validate(r);assert.equal(parsed.items.length,1);assert(parsed.validationWarnings.some(x=>x.includes('search-query details are absent')));});
test('Empty chunk objects are not usable source evidence',()=>{const r=response();r.body.candidates[0].groundingMetadata.groundingChunks=[{}];assert.throws(()=>validate(r),/no usable grounding source chunks/);});
test('Unwrapped Gemini response is accepted',()=>assert.equal(validate(response().body).items.length,1));
test('Text envelope can preserve original grounding metadata',()=>{
 const c=response().body.candidates[0];
 const parsed=validate({text:c.content.parts[0].text,groundingMetadata:c.groundingMetadata});
 assert.equal(parsed.items.length,1);assert(parsed.validationWarnings.some(x=>x.includes('omitted finishReason')));
});
test('Text envelope cannot override an explicit incomplete finish reason',()=>{
 const c=response().body.candidates[0];
 assert.throws(()=>validate({text:c.content.parts[0].text,groundingMetadata:c.groundingMetadata,finishReason:'MAX_TOKENS'}),/finishReason=MAX_TOKENS/);
});
test('Unsupported envelope reports input-format mismatch',()=>assert.throws(()=>validate({unexpected:'different shape'}),/Unsupported research input format/));
test('Malformed JSON fails closed',()=>{const r=response();r.body.candidates[0].content.parts[0].text='{bad';assert.throws(()=>validate(r));});
test('Truncated response fails closed',()=>{const r=response();r.body.candidates[0].finishReason='MAX_TOKENS';assert.throws(()=>validate(r));});
test('Future publication date rejected',()=>assert.throws(()=>validate(response([{...item,date:'2099-01-01'}]))));
test('Impossible date rejected',()=>assert.throws(()=>validate(response([{...item,date:'2026-02-30'}]))));
test('Unknown author is explicit',()=>assert(validate(response([{...item,author:null}])).items[0].flags.includes('Author unknown')));
test('Duplicate URL filtered',()=>{const r=validate(response([item,item]));assert.equal(r.items.length,1);assert.equal(r.rejected.length,1);});
test('Unconfigured domain filtered',()=>assert.equal(validate(response([{...item,link:'https://attacker.invalid/paper'}])).items.length,0));
test('Unconfigured source type filtered',()=>assert.equal(validate(response([{...item,type:'standard'}])).items.length,0));
test('Old paper retained without date cutoff',()=>assert.equal(validate(response([{...item,date:'2001-01-01'}])).items.length,1));
test('Upcoming event with unknown announcement date retained',()=>assert.equal(validate(response([{...item,type:'conference',link:'https://www.isscc.org/program',source:'ISSCC',date:null,date_type:'unknown',event_date:'2099-01-01'}])).items.length,1));
test('Zero eligible items is a valid evidence artifact',()=>assert.equal(validate(response([])).items.length,0));
test('Announcement type is excluded with specific diagnostics; valid items survive',()=>{
 const r=validate(response([{...item,type:'announcement'},item]));
 assert.equal(r.items.length,1);assert.equal(r.items[0].id,'E01');
 assert(r.rejected[0].reason.includes('Invalid type: "announcement"'));assert(r.rejected[0].reason.includes('paper, standard, conference, webinar'));
});
test('Invalid access enum is not silently repaired',()=>{
 const r=validate(response([{...item,access:'unknown'}]));assert.equal(r.items.length,0);assert(r.rejected[0].reason.includes('Invalid access'));
});
test('Announcement publication status remains allowed',()=>{
 const r=validate(response([{...item,type:'conference',publication_status:'announcement',link:'https://www.isscc.org/program',source:'ISSCC'}]));assert.equal(r.items.length,1);
});
test('Identical Markdown URL wrapper can be removed without guessing',()=>{
 const r=validate(response([{...item,link:`[${item.link}](${item.link})`}]));assert.equal(r.items[0].link,item.link);assert(r.items[0].flags.includes('Identical Markdown URL wrapper removed'));
});
test('Misleading Markdown link is excluded',()=>assert.equal(validate(response([{...item,link:`[${item.link}](https://attacker.invalid/)`}])).items.length,0));
test('Placeholder arXiv identifier excluded',()=>{
 const r=validate(response([{...item,link:'https://arxiv.org/abs/2609.0xxxx'}]));assert.equal(r.items.length,0);assert(r.rejected[0].reason.includes('Invalid arXiv paper identifier'));
});
test('Reported failure excludes both candidates and exposes inconsistent grounding',()=>{
 const bad=response([
  {...item,title:'Beyond the Die Boundary',type:'announcement',publication_status:'announcement',source:'Arteris',link:'https://www.arteris.com/blog/beyond-the-die-boundary'},
  {...item,title:'Fengshui',author:null,link:'https://arxiv.org/abs/2609.0xxxx'}
 ]);
 bad.body.candidates[0].groundingMetadata.groundingSupports=[{groundingChunkIndices:[0]},{groundingChunkIndices:[1]}];
 const r=validate(bad);assert.equal(r.items.length,0);assert.equal(r.rejected.length,2);
 assert(r.rejected[0].reason.includes('Outside configured source domains'));assert(r.rejected[0].reason.includes('Invalid type'));
 assert(r.validationWarnings.some(x=>x.includes('missing source chunk')));assert(r.validationWarnings.some(x=>x.includes('not evidence that no relevant updates exist')));
 const html=execute('Render Draft Dashboard',r).reviewHtml;assert(html.includes('Validation warnings:'));assert(html.includes('Invalid arXiv paper identifier'));
});
const evidence=validate(response([item,{...item,link:item.link+'1'},{...item,link:item.link+'2'}]));
const draft=execute('Render Draft Dashboard',evidence);
context['Render Draft Dashboard']=draft;
test('External template is used and tokens substituted',()=>{assert(draft.reviewHtml.startsWith('<!doctype html>'));assert(!/__BODY__|__HEADER__|__COVERAGE__/.test(draft.reviewHtml));assert(draft.reviewHtml.includes('TEST FIXTURE'));});
test('Source HTML escaped',()=>{assert(!draft.reviewHtml.includes('<script>alert(1)</script>'));assert(draft.reviewHtml.includes('&lt;script&gt;'));});
test('Missing template token stops rendering',()=>assert.throws(()=>execute('Render Draft Dashboard',evidence,{'Build Research Prompt':{...research,dashboardTemplate:'bad'}})));
test('Private resume URL never appears in report',()=>assert(!draft.reviewHtml.includes('resumeFormUrl')));
test('Source revision and workflow build retained',()=>{assert.equal(draft.sourceRevision,'a'.repeat(40));assert(/^[a-f0-9]{64}$/.test(draft.workflowBuild));});
test('Missing human decision prevents output',()=>assert.throws(()=>execute('Apply Human Decisions',{Reviewer:'Trainer',E01:'Read'})));
const decisions=execute('Apply Human Decisions',{Reviewer:'Trainer',E01:'Read',E02:'Ignore',E03:'Investigate','Source verification':'Confirmed','Review notes':'TEST FIXTURE'});
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

test('Research agent uses hardcoded Gemini 3.5 Flash',()=>{
 assert.equal(nodes['Research'].type,'@n8n/n8n-nodes-langchain.agent');
 assert.equal(nodes['Google Gemini Chat Model'].parameters.modelName,'models/gemini-3.5-flash');
 assert.equal(w.connections['Google Gemini Chat Model'].ai_languageModel[0][0].node,'Research');
 assert(!nodes['Gemini Research']);assert(!nodes['Retry Empty Gemini Response']);
 assert(!Object.hasOwn(config,'gemini_model'));
});
test('Text-only candidates remain explicitly unverified',()=>{
 const r=validate({text:response().body.candidates[0].content.parts[0].text});
 assert.equal(r.items.length,1);assert.equal(r.researchStatus,'unverified_model_output');
 assert(r.coverage.every(x=>x.status==='not_verified'));
 assert(r.validationWarnings.some(x=>x.includes('unverified leads')));
});
test('Text-only zero results proceed without claiming search',()=>{
 const r=validate({text:response([]).body.candidates[0].content.parts[0].text});
 assert.equal(r.items.length,0);assert.equal(r.researchStatus,'unverified_model_output');
});
test('Read requires confirmation of source checks',()=>assert.throws(()=>execute('Apply Human Decisions',{Reviewer:'Trainer',E01:'Read',E02:'Ignore',E03:'Investigate'}),/independent source verification/));
console.log('All '+count+' checks passed.');

test('No date windows or result cap in config or prompt',()=>{
 for(const k of ['lookback_days','upcoming_days','max_items'])assert(!Object.hasOwn(config,k));
 assert(!research.prompt.includes('{{START_DATE}}'));assert(!research.prompt.includes('{{MAX_ITEMS}}'));
 assert(research.prompt.includes('without any publication-date cutoff'));
});
test('Sorts newest first with unknown dates last and reassigns IDs',()=>{
 const r=validate(response([{...item,date:'2001-01-01',link:item.link+'1'},{...item,date:null,date_type:'unknown',link:item.link+'2'},item]));
 assert.deepEqual(r.items.map(x=>x.date),[research.today,'2001-01-01',null]);
 assert.deepEqual(r.items.map(x=>x.id),['E01','E02','E03']);
});
test('More than eight results survive and are all reviewable',()=>{
 const r=validate(response(Array.from({length:12},(_,i)=>({...item,source:'IEEE Xplore',link:'https://ieeexplore.ieee.org/document/'+(10000000+i)}))));
 assert.equal(r.items.length,12);
 const form={Reviewer:'Trainer',Decisions:r.items.map(x=>x.id+'=Investigate').join('\n'),'Source verification':'Needs investigation'};
 const out=execute('Apply Human Decisions',form,{'Render Draft Dashboard':r});assert.equal(out.items.length,12);
 assert(out.items.every(x=>x.decision==='Investigate'));
});
test('Decision lines reject unknown and duplicate IDs',()=>{
 assert.throws(()=>execute('Apply Human Decisions',{Reviewer:'Trainer',Decisions:'E99=Read'}),/Unknown item/);
 assert.throws(()=>execute('Apply Human Decisions',{Reviewer:'Trainer',Decisions:'E01=Read\nE01=Ignore'}),/Duplicate decision/);
});
console.log('Final total: '+count+' checks passed.');

function agentResponse(items=[item],results=[{title:item.title,link:item.link,snippet:'Retrieved test snippet'}]) {
 return {output:JSON.stringify({items,coverage:[]}),intermediateSteps:[{action:{tool:'searxng-search',toolInput:'site:arxiv.org chiplet'},observation:results.map(r=>JSON.stringify(r)).join(',')||'No good results found.'}]};
}
test('Search tool connected and audit enabled',()=>{assert.equal(w.connections['SearXNG Search'].ai_tool[0][0].node,'Research');assert.equal(nodes.Research.parameters.options.returnIntermediateSteps,true);});
test('Agent output retains actual search results',()=>{const r=validate(agentResponse());assert.equal(r.items.length,1);assert.equal(r.searchEvidence[0].results[0].link,item.link);assert.equal(r.researchStatus,'search_results_returned');});
test('Agent without search trace fails closed',()=>assert.throws(()=>validate({output:JSON.stringify({items:[],coverage:[]})}),/no search tool trace/));
test('Agent fabricated URL is excluded',()=>{const r=validate(agentResponse([{...item,link:'https://arxiv.org/abs/2609.12345'}]));assert.equal(r.items.length,0);assert(r.rejected[0].reason.includes('not returned'));});
test('Agent empty search is recorded as incomplete',()=>{const r=validate(agentResponse([],[]));assert.equal(r.researchStatus,'search_attempted_no_usable_results');assert.equal(r.searchEvidence.length,1);});
console.log(`${count} checks passed.`);

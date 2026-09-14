function render(run, template, final=false) {
 const e=v=>String(v??'Unknown').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const cards=rows=>rows.map(x=>`<article><div class="eyebrow">${e(x.id)} · ${e(x.type)} · ${e(x.publication_status)}</div><h2><a href="${e(x.link)}" target="_blank" rel="noopener noreferrer">${e(x.title)}</a></h2><p class="meta">${e(x.author)} · ${e(x.source)} · ${e(x.date)} (${e(x.date_type)})</p><p>${e(x.summary)}</p><p><b>Relevance · AI judgment:</b> ${e(x.relevance)}</p><blockquote>${e(x.evidence)}<small>${e(x.evidence_location)} · ${e(x.access)}</small></blockquote><p class="meta">Event: ${e(x.event_date)} · Deadline: ${e(x.deadline)}</p><p class="flag">${e(x.flags.join(' · ')||'Check original source before deciding')}</p>${final?`<p><b>${e(x.decision)}</b> · ${e(run.reviewer)}</p>`:''}</article>`).join('');
 const reads=run.items.filter(x=>x.decision==='Read'), hold=run.items.filter(x=>x.decision==='Investigate'), ignored=run.items.filter(x=>x.decision==='Ignore');
 const content=final?`<h2>Weekly reading list (${reads.length})</h2>${cards(reads)||'<p>No items selected for reading.</p>'}<h2>Investigate (${hold.length})</h2><p>Pending follow-up; these items are excluded from the reading briefing. Resolve in a future run.</p>${cards(hold)}<details><summary>Ignored (${ignored.length})</summary>${cards(ignored)}</details>`:cards(run.items)||'<p>No eligible candidates. Review coverage before concluding that there were no updates.</p>';
 const suggestions=run.grounding?.searchEntryPoint?.renderedContent;
 // Provider search-suggestion HTML stays isolated in a sandbox with scripts disabled.
 const search=suggestions?`<iframe title="Google Search suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="${e(suggestions)}" style="width:100%;height:160px;border:0"></iframe>`:'';

 const values={
  TITLE:e(run.config.topic),
  HEADER:`<div class="eyebrow">Engineering Journalist · ${final?'Reviewed reading selections':'Evidence awaiting review'}</div><h1>${e(run.config.topic)}</h1><p>${e(run.start)} — ${e(run.today)} · Upcoming events through ${e(run.until)}</p><p>${run.items.length} candidates · ${final?reads.length+' selected':'Human gate required'}</p>`,
  NOTICE:(final?'Read means selected for reading, not technical endorsement. Facts were not regenerated after review.':'Open original sources. Verify title, author, date and supporting evidence. Use the private n8n form for Read, Ignore or Investigate. The form link is not published here.')+(run.validationWarnings?.length?'<br><b>Validation warnings:</b> '+run.validationWarnings.map(e).join(' '):''),
  BODY:content,
  COVERAGE:run.coverage.map(c=>`<tr><td>${e(c.source)}</td><td>${e(c.status)}</td><td>${e(c.note)}</td></tr>`).join(''),
  FILTERED:`<details><summary>Filtered candidates (${run.rejected.length})</summary><ul>${run.rejected.map(x=>`<li>${e(x.title)}: ${e(x.reason)}</li>`).join('')}</ul></details>`,
  SEARCH:search,
  FOOTER:`Run ${e(run.runId)} · Created ${e(run.createdAt)}${final?' · Reviewed '+e(run.reviewedAt)+' · '+e(run.reviewer):''}<br>Source revision: ${e(run.sourceRevision)}<br>Workflow build: ${e(run.workflowBuild)}${final?'<br>Review notes: '+e(run.reviewNotes):''}`
 };
 for(const key of Object.keys(values)) if(!template.includes(`__${key}__`)) throw new Error(`Dashboard template missing __${key}__`);
 return template.replace(/__(TITLE|HEADER|NOTICE|BODY|COVERAGE|FILTERED|SEARCH|FOOTER)__/g,(_,key)=>values[key]);
}

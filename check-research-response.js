// HTTP 200 / STOP can still contain no answer. Retry this case once, not indefinitely.
const response=$json.body??$json;
const candidate=response.candidates?.[0];
const parts=Array.isArray(candidate?.content?.parts)?candidate.content.parts:[];
const text=parts.filter(p=>p&&!p.thought&&typeof p.text==='string').map(p=>p.text).join('');
const retryEmptyAnswer=candidate?.finishReason==='STOP'&&!text.trim();
return [{json:{...$json,retryEmptyAnswer}}];

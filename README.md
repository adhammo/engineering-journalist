# Engineering Journalist

Source-controlled n8n workflow for IC design engineers, prepared for **adhammo/engineering-journalist**, branch `main`, and n8n 2.38.7.

## Model and workflow

The **Research** node is an AI Agent connected to **Google Gemini Chat Model** (hardcoded `models/gemini-3.5-flash`) and **SearXNG Search**. The parser reads `output` and retains `intermediateSteps` tool observations as `searchEvidence` in the archived evidence JSON.

```mermaid
flowchart TD
  A[Manual / weekly trigger] --> B[Resolve Git revision]
  B --> C[Fetch config, prompt and HTML template]
  C --> D[Build Research Prompt]
  M[Gemini Chat Model: gemini-3.5-flash] -->|Language model| E[Research]
  S[SearXNG Search] -->|Tool| E
  D --> E
  E --> F[Parse Research JSON]
  F --> G[Archive evidence snapshot]
  G --> H[Human: Read / Ignore / Investigate]
  H --> I[Render reviewed briefing and archive decisions]
  I --> J[Update review.html]
  J --> K{Human publication approval}
  K -->|Approve| L[Fetch exact approved draft and update index.html]
  K -->|Reject| N[Keep current dashboard]
```

**Research capability:** SearXNG supplies live search snippets. Candidate URLs must appear in actual tool results. Missing tool traces stop the agent path. Human review must verify authors, dates and claims on the original source pages.

The reviewer must independently check original source pages and choose **Source verification: Confirmed** before any Read item can enter the briefing. Ignore excludes an item; Investigate holds it for manual follow-up. Final approval publishes the exact reviewed bytes. Zero results never prove that no updates exist.

## Setup

1. Push this directory to `adhammo/engineering-journalist` on `main`.
2. Enable GitHub Pages from `main`, `/ (root)`, to view the HTML reports. Alternatively, download and open the HTML locally.
3. Import `engineering-journalist.json` into n8n.
4. Select your existing Gemini credential on **Google Gemini Chat Model**. The requested model must be available to your API account; no substitute is selected automatically. On **SearXNG Search**, create/select a SearXNG credential with API URL `http://searxng:8080`. The existing Docker service must allow JSON search; no API key is needed for this local service.
5. Select your GitHub credential on the GitHub HTTP Request nodes, with Contents read/write permission for this repository. If using an existing Header Auth credential, change those nodes' authentication to Generic Credential Type / Header Auth.
6. Edit and push `engineering-journalist.config.json` to set the topic, keywords, exclusions and sources.
7. Run Manual Trigger. Open the waiting execution's form at Human Evidence Review. Verify the sources, enter one decision per result ID (for example `E01=Read`, `E02=Ignore`, `E03=Investigate`, each on its own line), and confirm source checks for Read items.
8. Review the immutable draft at Human Publication Approval, then approve or reject.
9. Enable Weekly Schedule and publish the workflow after a successful test. It is disabled in the export; its schedule is Monday 09:00 Africa/Cairo.

Dashboard: <https://adhammo.github.io/engineering-journalist/>. Latest draft: <https://adhammo.github.io/engineering-journalist/review.html>. GitHub Pages may take time to deploy each commit. Always use the run-specific draft linked in the approval form.

## Source-controlled files

- `engineering-journalist.json`: generated, importable n8n workflow.
- `engineering-journalist.config.json`: topic and source scope, no date-window restriction and no fixed candidate-count cap.
- `research_prompt_template.md`: research instructions and JSON contract.
- `dashboard_template.html`: report layout and styles.
- Root `.js` files: Code-node implementations; `render-report.js` is the shared deterministic renderer.
- `scripts/build-workflow.cjs`: reproducible generator, including the hardcoded Gemini node.
- `tests/workflow.test.cjs`: offline checks for parsing, validation, human gates and publication.
- `index.html`, `review.html`: initial placeholders, subsequently updated by n8n.

Initial source scope: IEEE Xplore, arXiv and ACM Digital Library for papers; ISSCC, DAC, IEEE IMS and VLSI Symposia for conferences; UCIe for standards/webinars; IEEE SSCS for webinars. Adjust these for the selected topic. Domain and source-type checks remain enforced. arXiv identifier syntax checks do not establish that a paper exists.

## Versioning and publication

This follows the [competitive-intelligence-demo methodology](https://github.com/adhammo/competitive-intelligence-demo): external config, prompt and template; separate JavaScript sources; GitHub review artifacts; human approval before production publication.

Each run fetches config, prompt and template at one Git commit. Runtime edits never overwrite configuration. Code sources are embedded at build time, not remotely evaluated. Audits record the input Git revision and workflow build hash.

Config/prompt/template changes take effect after pushing, on the next run. For Code-node or workflow changes:

```sh
npm run build
npm test
npm run check
```

Commit source files and the generated export together, push, then reimport the workflow. Node.js 18+ is sufficient; no npm dependencies are required. Credentials are omitted from the export.

Each run archives `evidence.html`, `evidence.json`, `review.html`, and `publication-decision.json` under `runs/<run-id>/`. The final publisher fetches the approved draft at its commit SHA, verifies its blob identity and bytes, and updates `index.html` using GitHub's current file SHA. Reject leaves production unchanged. No AI call runs after evidence triage.

Keep one run in flight; the latest dashboard follows completed-approval order. Pull automated GitHub commits before pushing local changes. Resume form URLs stay in n8n. Repository artifacts follow repository visibility. Typed reviewer names are audit labels, not authenticated identities.

## Failure handling and teaching

Malformed JSON, missing agent tool traces, invalid dates and incomplete decisions stop publication. Invalid enums, out-of-scope links, placeholders and URLs absent from tool results are excluded with reasons. Legacy text-only inputs remain visibly unverified.

Duplicates are filtered within each run. Historical runs are retained, but automated cross-week comparison and follow-up research are not implemented. Offline tests do not prove model availability, factual accuracy, API access or Pages deployment.

The 40-minute exercise uses 10 minutes for manual chat and 30 minutes for automation and failures: inspect Git-controlled inputs, run Research, inspect evidence, complete both human gates, then demonstrate invalid JSON, bad links, missing source confirmation and publication rejection.

## Result ordering

Research has no lookback or event-date horizon and no configured result-count cap. All valid results returned for the configured source scope are retained, deduplicated and sorted by publication/update date from newest to oldest; unknown dates are last. Event dates are displayed separately and never substituted for publication dates. The review form accepts any returned item count using one `ID=Decision` line per item. Every item still requires a decision.

All results means relevant results actually obtained. The search tool retains all results on the first page per query. The agent has a 30-iteration execution budget and model context/output limits still apply. Coverage is not exhaustive and must disclose these limits.

Publisher URL variants for arXiv, ACM DOI and IEEE Xplore are matched by publication ID. The report retains the actual retrieved URL (including version); the original generated URL is kept as `model_link`. Explicit arXiv version mismatches remain excluded. This establishes a retrieved publication lead, not factual verification.

Evidence snapshot retries fetch the existing file SHA and allow only identical content. If a rerun produces different evidence for the same run ID, start from Manual Trigger with Repository Settings unpinned. This preserves the original evidence snapshot.

Read the spec at `/Users/daniel/attio-cli/benchmarks/LIVE-BENCHMARK-SPEC.md` and execute it end to end.

You are writing and running a benchmark suite in `/Users/daniel/attio-cli/benchmarks/`. The project is a TypeScript CLI tool — use `npx tsx` to run `.ts` files. Do not modify anything in `src/` or `bin/`. Only work in `benchmarks/`.

## Approach

Spin up a team with three agents working in parallel:

### Agent 1: "benchmarker"

Write and run `benchmarks/bench.ts` — a script that:

1. Creates test data in Attio (companies, people, notes, tasks, comments) using the `attio` CLI
2. Times every scenario listed in the spec (5 runs each, discard first, median of last 4)
3. Cleans up all test data
4. Writes results to `benchmarks/live-results.json` in the format described in the spec

This is the slow part (~3-5 minutes of real API calls). Start it immediately.

### Agent 2: "report-updater"

While the benchmarker runs, update `benchmarks/run.ts` to:

1. Accept a `--results <path>` flag that reads a `live-results.json` file
2. Map each result's scenario name to the corresponding scenario in the report
3. Use real measured latencies instead of estimates when `--results` is provided
4. Also incorporate the accuracy improvements discussed below

#### Accuracy improvements to make in `run.ts`

While you're editing the report generator, fix these issues:

- Token counts are estimates (~3.5 chars/token). Add a note in the methodology section that says "Token counts are estimates based on ~3.5 characters per token for JSON content. Actual BPE tokenization may vary by 10-20%."
- The MCP latency model uses a fixed 3s per tool call. Change this to a range: "2-5s" in the prose, and use 3.5s as the point estimate in calculations.
- Add a note that some MCP implementations support parallel tool calls within a single turn, which would reduce multi-step overhead. The benchmark models the sequential (worst) case.
- In the "Cost at Scale" table, the CLI column should say "$0*" with a footnote: "* $0 for direct scripting. When used through an AI agent's Bash tool, token cost is ~680 per operation (see Per-Operation Comparison)."

### Agent 3: "writer"

Write a publishable article/white paper to `benchmarks/ARTICLE.md`. This will be published online, so it needs to be polished and persuasive — not a raw data dump.

**Wait for `benchmarks/live-results.json` and `benchmarks/REPORT.md` to exist before writing.** You need the real numbers. While waiting, read the following to build context:

- `README.md` — what attio-cli is and its "Why CLI over MCP" section
- `benchmarks/LIVE-BENCHMARK-SPEC.md` — what was measured and how
- `benchmarks/run.ts` — the cost model and MCP tool schema analysis

#### Article structure

**Title:** Something sharp, not generic. Example directions: "The $1,360/month tax on AI agents using MCP" or "Why your AI agent shouldn't use MCP for CRM operations"

**Sections:**

1. **The hook** (2-3 paragraphs). Open with the problem: AI agents are increasingly using MCP to interact with SaaS tools, but nobody's measuring the cost. Set up the tension: convenience vs efficiency.

2. **What MCP actually costs** (3-4 paragraphs). Explain the tool schema overhead clearly for a technical audience who may not know how MCP works under the hood. Use the real numbers from the benchmark: 30 tools, ~13k tokens per request, the schema tax on every call. Include the ASCII diagram from the report showing the MCP request flow vs CLI flow.

3. **The benchmark** (the core of the article). Present the real measured data:
   - Per-operation comparison table (use the data from REPORT.md)
   - The multi-step workflow comparison (company onboarding)
   - Cost at scale projections
   - Use the actual measured CLI latencies from live-results.json, not estimates

4. **Beyond cost** (2-3 paragraphs). Cover the qualitative advantages: determinism, composability, debuggability, Unix philosophy. Use concrete examples — show the bash pipeline that exports, filters, and transforms data in one line.

5. **When MCP still makes sense** (1-2 paragraphs). Be fair. MCP is good for: ad-hoc exploration by non-technical users, discovery of unfamiliar APIs, one-off queries where convenience matters more than cost. Acknowledge this honestly — it makes the argument stronger.

6. **Conclusion** (1-2 paragraphs). The punchline: for automated workflows and agent-driven operations at any meaningful scale, CLI tools are dramatically more efficient. Link to the attio-cli repo.

#### Writing guidelines

- Write for a technical audience (developers, AI engineers, platform teams) but don't assume they know MCP internals.
- Use real numbers from the benchmark throughout. Don't round aggressively — "$1,359.90/month" is more credible than "~$1,400/month".
- No filler, no fluff. Every paragraph should contain either data, an insight, or a concrete example.
- Don't use the word "landscape" or "game-changer" or any AI-slop phrasing.
- Tone: confident and direct, like a well-written engineering blog post. Think Cloudflare blog or Fly.io blog.
- Include the key data tables inline (not just references to them).
- Code examples should be real, runnable commands.
- No emojis.

### Finish

Once all three agents are done:

1. Verify `benchmarks/live-results.json` has data for all scenarios
2. Verify `benchmarks/REPORT.md` uses real latency numbers
3. Verify `benchmarks/ARTICLE.md` reads well and uses the real benchmark numbers
4. Commit no files — leave that to me

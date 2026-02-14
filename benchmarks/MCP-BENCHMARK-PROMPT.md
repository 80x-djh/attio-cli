Read the spec at `/Users/daniel/attio-cli/benchmarks/MCP-BENCHMARK-SPEC.md` and execute it end to end.

You are writing and running a **measured** MCP benchmark in `/Users/daniel/attio-cli/benchmarks/`. This replaces the previous estimated benchmark with real, API-verified token counts and latency for both the MCP and CLI paths. The project is a TypeScript CLI tool — use `npx tsx` to run `.ts` files. Do not modify anything in `src/` or `bin/`. Only work in `benchmarks/`.

## Context

The `benchmarks/` directory already has files from a previous (estimated) benchmark run:
- `run.ts` — report generator (has `--results` flag, MCP tool schema definitions, cost model)
- `REPORT.md` — current report (uses estimated MCP numbers)
- `ARTICLE.md` — current article (uses estimated MCP numbers)
- `bench.ts` — CLI-only benchmark runner (times `attio` commands)
- `live-results.json` — CLI timing data from the previous run
- `LIVE-BENCHMARK-SPEC.md` / `LIVE-BENCHMARK-PROMPT.md` — previous benchmark docs
- `MCP-BENCHMARK-SPEC.md` — **the spec for THIS benchmark** (read this first)

The goal: replace all estimated/modeled MCP numbers with measured ones. Every token count and latency in the final REPORT.md and ARTICLE.md must come from actual Anthropic API `usage` metadata.

## Prerequisites check

Before starting any agents, verify:
1. `ANTHROPIC_API_KEY` is set: `echo $ANTHROPIC_API_KEY | head -c 10`
2. `ATTIO_API_KEY` is set (or CLI is configured): `attio whoami --json`
3. The attio MCP server package exists: `npm view @attio/mcp-server` (try also `@anthropic/attio-mcp-server` if not found)

If the MCP server package name is wrong, search npm for `attio mcp` and use whatever exists. If no public MCP server package exists, fall back to extracting tool schemas from the Attio MCP tools already available in this Claude Code session (check available MCP tools with ToolSearch for "attio"). You have access to Attio MCP tools in this session — their schemas can be captured by inspecting the tool definitions.

## Approach

Spin up a team with three agents. Agent 1 is the long pole — start it immediately.

### Agent 1: "mcp-benchmarker"

Write and run `benchmarks/mcp-bench.ts`. This is the core of the benchmark. It must:

#### Phase 0: Setup dependencies

Create a `benchmarks/package.json` (if one doesn't exist) and install:
```bash
cd /Users/daniel/attio-cli/benchmarks && npm init -y && npm install @anthropic-ai/sdk @modelcontextprotocol/sdk
```

#### Phase 1: Capture MCP tool schemas

Get the actual Attio MCP tool definitions and save to `benchmarks/attio-mcp-tools.json`.

**Preferred approach**: Use the MCP SDK to connect to the Attio MCP server and call `tools/list`:
```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@attio/mcp-server"],  // or whatever the package name is
  env: { ATTIO_API_KEY: process.env.ATTIO_API_KEY }
});
const client = new Client({ name: "benchmark", version: "1.0.0" });
await client.connect(transport);
const { tools } = await client.listTools();
```

Convert the MCP tool format to Anthropic API `tools` format:
```json
[{ "name": "tool_name", "description": "...", "input_schema": { ... } }]
```

**Important**: The Anthropic API requires tool names to match `^[a-zA-Z0-9_-]{1,64}$`. MCP tools use hyphens (e.g., `create-record`) which should be fine, but verify. If names need conversion, maintain a mapping.

**Fallback approach**: If the MCP server package isn't available or won't connect, you have Attio MCP tools available in this Claude Code session. Use ToolSearch to find all attio tools, then construct the tool schemas from their definitions. This is less ideal (the schemas might differ from the official MCP server) but still gives real measured token counts.

**Last resort fallback**: The existing `run.ts` file already has manually-measured token counts for 30 Attio MCP tools. If you can't get the actual schemas, construct synthetic tool definitions that match those token counts. Document this clearly in the output.

Save the tool schemas to `benchmarks/attio-mcp-tools.json` regardless of which approach you use.

#### Phase 2: Schema overhead calibration

Measure exact schema token overhead using the Anthropic API (see "Isolating the Schema Overhead" in the spec):

1. **Baseline**: `messages.create()` with prompt "Say hi", no tools → record `usage.input_tokens`
2. **CLI baseline**: Same prompt, tools = [Bash tool only] → record `usage.input_tokens`
3. **MCP baseline**: Same prompt, tools = [all Attio MCP tools] → record `usage.input_tokens`

Run 3 times each, take median. Save results to calibration section of output.

The differences give us:
- Bash tool schema cost = CLI - Baseline
- MCP schema overhead = MCP - Baseline
- Pure Attio schema cost = MCP - CLI

#### Phase 3: Create test data

Same as the previous benchmark — create test resources using the `attio` CLI:
- Company: `__MCP_BENCH_COMPANY__`
- Person: `__MCP_BENCH_PERSON__`
- Note, task, comment on the company

Save IDs for use in scenarios. Template the scenario prompts with real IDs.

#### Phase 4: Run all scenarios

For each of the 17 scenarios in the spec, run three paths:

**MCP path**: Call Anthropic API with all MCP tool schemas. When Claude returns `tool_use`, execute the tool call against Attio (either via MCP SDK `client.callTool()` or by mapping tool names to HTTP endpoints and calling the Attio API directly). Send `tool_result` back. Continue until Claude gives a final text response. Record all token usage and timing.

**CLI path**: Call Anthropic API with just the Bash tool schema. When Claude returns a bash command, execute it with `child_process.execSync`. Send stdout back as `tool_result`. Record all token usage and timing.

**Direct path**: Execute the CLI command directly (no LLM). Record wall-clock time only.

5 runs per scenario per path. 200ms delay between runs.

#### Phase 5: Validation

Run the sanity checks from the spec:
- Token consistency across runs
- Tool selection accuracy
- Schema overhead consistency
- Latency ordering (MCP > CLI > Direct)

Log warnings for any anomalies.

#### Phase 6: Cleanup

Delete all test data. Delete any `__MCP_BENCH_` prefixed records.

#### Phase 7: Write results

Write `benchmarks/mcp-bench-results.json` in the format specified in the spec. Include raw run data, medians, calibration results, and validation check outcomes.

**Important implementation notes:**
- Use `@anthropic-ai/sdk` for API calls. Set `temperature: 0`, use `claude-sonnet-4-5-20250929`.
- Wrap all API calls in try/catch. Log errors and continue.
- For MCP tool execution, prefer the MCP SDK approach (Phase 1 client stays connected). If that's not viable, map tools to Attio REST endpoints.
- Print progress to stderr as you go (`Scenario 3/17: List companies [MCP run 2/5]...`).
- The script will take ~15-20 minutes. Budget for this.
- Handle Anthropic rate limits with exponential backoff (start at 1s, max 30s).
- Handle Attio rate limits with 200ms base delay, retry once on 429.

### Agent 2: "report-updater"

Update `benchmarks/run.ts` to accept the new measured results format. Can work in parallel with Agent 1 since it's editing code, not running benchmarks.

1. **Add `--mcp-results <path>` flag** that reads `mcp-bench-results.json` and:
   - Replaces estimated MCP token counts with measured `median_input_tokens` / `median_output_tokens` per scenario
   - Replaces estimated MCP latency with measured `median_latency_ms`
   - Replaces estimated CLI token counts with measured CLI path tokens
   - Uses measured CLI latency from the CLI path (not the previous `live-results.json`)
   - Updates the schema overhead number with the calibration result
   - Maps scenario names between the two formats

2. **Update the report methodology section** to reflect that token counts are now measured:
   - "Token counts were measured using the Anthropic API's `usage` metadata (exact BPE token counts), not estimated."
   - "MCP latency was measured end-to-end: Anthropic API call with tool use, tool execution against Attio API, and result interpretation."
   - "CLI latency includes both LLM inference (generating the bash command) and command execution."
   - "Direct CLI latency is the raw command execution time with no LLM involved."

3. **Add the three-way comparison** to the Per-Operation table: CLI Tokens, MCP Tokens, CLI Latency, MCP Latency, Direct Latency.

4. **Update Cost at Scale** to use measured per-operation token costs instead of the formula-based estimates.

5. **Do NOT regenerate REPORT.md yet** — wait for `mcp-bench-results.json` to exist.

While waiting for results, read `benchmarks/run.ts` and the existing `benchmarks/mcp-bench-results.json` format from the spec to plan your edits.

### Agent 3: "writer"

Update `benchmarks/ARTICLE.md` with the measured data. This is the marketing-grade output.

**Wait for BOTH `benchmarks/mcp-bench-results.json` AND the regenerated `benchmarks/REPORT.md` to exist.** You need the real measured numbers.

While waiting, read:
- `/Users/daniel/attio-cli/README.md`
- `/Users/daniel/attio-cli/benchmarks/MCP-BENCHMARK-SPEC.md`
- `/Users/daniel/attio-cli/benchmarks/ARTICLE.md` (current version to build on)
- `/Users/daniel/attio-cli/benchmarks/run.ts`

#### What to update in the article

The article structure stays the same. Update all numbers to use measured data:

1. **Lead paragraph**: Update the headline cost number if it changed. Use the exact measured figure.

2. **"What MCP actually costs" section**: Update the schema token count from the calibration measurement. The previous "~13,660" was an estimate — replace with the API-verified number.

3. **Per-operation table**: Replace all MCP latency and token values with measured data. The table should now have three columns: Direct CLI, CLI via Agent, MCP via Agent.

4. **Multi-step workflow**: Use the measured multi-step scenario data (scenarios 16 and 17). These now have real MCP latency, not modeled.

5. **Cost at scale**: Recalculate using measured per-operation token costs.

6. **Methodology note**: Add a sentence: "All token counts in this article are measured using the Anthropic API's usage metadata, not estimated. MCP latency was measured by running actual operations through Claude with the full Attio MCP tool set."

7. **Add a "Methodology" section or appendix** briefly explaining:
   - How the benchmark was run (Anthropic API, Claude Sonnet 4.5, temperature 0)
   - That both paths use the same model and same workspace
   - How schema overhead was isolated (the calibration approach)
   - That all data including failures is reported
   - Link to the raw data file and benchmark script for reproducibility

#### Writing guidelines (same as before)

- Technical audience, don't assume MCP knowledge
- Real numbers, don't round aggressively
- No filler, no "landscape", no "game-changer"
- Cloudflare/Fly.io blog tone
- Include data tables inline
- Real, runnable code examples
- No emojis

### Finish

Once all three agents are done:

1. **Verify `benchmarks/mcp-bench-results.json`**:
   - Has data for all 17 scenarios
   - All three paths (MCP, CLI, Direct) have data
   - Calibration section has measured schema overhead
   - No more than 2 scenario failures across all paths

2. **Verify `benchmarks/REPORT.md`**:
   - Says "Measured" (not "estimated") for both token counts and latency
   - Schema overhead number matches calibration result
   - Per-operation table uses measured values
   - Cost projections use measured token counts

3. **Verify `benchmarks/ARTICLE.md`**:
   - All numbers match mcp-bench-results.json
   - Methodology section mentions measured API usage metadata
   - No references to "estimated" or "modeled" MCP data remain
   - Reads well as a standalone article

4. **Regenerate the report one final time** if any post-hoc fixes were needed:
   ```bash
   npx tsx benchmarks/run.ts --mcp-results benchmarks/mcp-bench-results.json > benchmarks/REPORT.md
   ```

5. **Commit no files** — leave that to me.

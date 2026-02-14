# MCP Benchmark Spec: Measured End-to-End Comparison

## Goal

Produce marketing-grade benchmark data comparing attio-cli vs Attio MCP by **actually measuring both paths** — not modeling MCP. Every number in the final report should come from a real API call with real token counts from the Anthropic API usage metadata.

## Why This Matters

The current benchmark models MCP latency and estimates token counts at ~3.5 chars/token. For marketing use, we need:

- **Measured MCP token counts** from `response.usage.input_tokens` / `output_tokens`
- **Measured MCP latency** from wall-clock timing of real Anthropic API calls with tool use
- **Measured CLI token counts** from the same API, same model, same operations
- **Apples-to-apples comparison** — same model, same Attio workspace, same data, same session

## Architecture

The benchmark script (`benchmarks/mcp-bench.ts`) calls the Anthropic API directly for both paths. This gives us exact token counts and full control over timing.

### MCP Path

```
Script
  → Anthropic API (tools = all 30 Attio MCP tool schemas)
    → Claude selects tool + generates arguments
  ← Response with tool_use block + usage.input_tokens + usage.output_tokens
  → Script executes the tool call against Attio API (using the MCP tool's HTTP mapping)
  → Anthropic API (tool_result + same tools array)
    → Claude interprets result
  ← Final response + usage for this turn
```

What we capture per operation:
- `mcp_input_tokens`: sum of `usage.input_tokens` across all turns
- `mcp_output_tokens`: sum of `usage.output_tokens` across all turns
- `mcp_total_tokens`: input + output
- `mcp_latency_ms`: wall-clock from first API call to final response
- `mcp_api_latency_ms`: just the Attio API call time (isolated)
- `mcp_llm_latency_ms`: mcp_latency_ms minus mcp_api_latency_ms
- `mcp_tool_calls`: number of tool calls Claude made
- `mcp_turns`: number of Anthropic API round-trips
- `mcp_success`: whether Claude called the right tool with correct args and got the expected result

### CLI Path

```
Script
  → Anthropic API (tools = [Bash tool schema only])
    → Claude generates: attio companies list --json
  ← Response with tool_use block + usage.input_tokens + usage.output_tokens
  → Script executes the bash command
  → Anthropic API (tool_result with command output)
    → Claude interprets result (optional — can skip this turn for fairer comparison)
  ← Final response + usage
```

What we capture per operation:
- `cli_input_tokens`: sum of `usage.input_tokens` across all turns
- `cli_output_tokens`: sum of `usage.output_tokens`
- `cli_total_tokens`: input + output
- `cli_latency_ms`: wall-clock from first API call to final response
- `cli_exec_latency_ms`: just the `attio` command execution time
- `cli_llm_latency_ms`: cli_latency_ms minus cli_exec_latency_ms
- `cli_success`: whether Claude generated a valid command that produced the expected result

### Direct CLI Path (no LLM)

For completeness, also time the raw CLI execution with no LLM involved:
- `direct_latency_ms`: wall-clock of running the `attio` command directly
- `direct_success`: whether the command succeeded

This gives us three data points per operation: MCP (full LLM + tool use), CLI-via-agent (LLM + bash), and direct scripting (no LLM).

## Prerequisites

### API Keys

- `ANTHROPIC_API_KEY` — for calling the Anthropic API directly
- `ATTIO_API_KEY` — for the CLI and for executing MCP tool calls manually

Both must be set as environment variables before running.

### Attio MCP Tool Schemas

The script needs the actual Attio MCP tool definitions (name, description, input_schema) in the format the Anthropic API expects for the `tools` parameter.

**How to obtain them:** The Attio MCP server publishes its tool list via the MCP `tools/list` method. We need to capture these once and save them to `benchmarks/attio-mcp-tools.json`.

Option A (preferred): Connect to the Attio MCP server programmatically and call `tools/list`:
```typescript
// Use @modelcontextprotocol/sdk to connect to the Attio MCP server
// and dump the tool definitions
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@anthropic/attio-mcp-server"],
  env: { ATTIO_API_KEY: process.env.ATTIO_API_KEY }
});
const client = new Client({ name: "benchmark", version: "1.0.0" });
await client.connect(transport);
const { tools } = await client.listTools();
// Save `tools` to benchmarks/attio-mcp-tools.json
```

Option B: If the MCP server package name is different or not publicly available, extract the tool schemas from a Claude Code session. Run Claude Code with the Attio MCP server configured, ask it to list all available Attio tools, and save the raw schemas.

**Important:** The tool schemas must be converted to Anthropic API `tools` format:
```json
[
  {
    "name": "tool_name",
    "description": "...",
    "input_schema": { "type": "object", "properties": { ... } }
  }
]
```

MCP tool names use hyphens (e.g., `create-record`). The Anthropic API may require underscores — check and convert if needed.

### Bash Tool Schema

For the CLI path, define a minimal Bash tool:
```json
{
  "name": "bash",
  "description": "Execute a bash command and return stdout/stderr.",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "description": "The bash command to execute"
      }
    },
    "required": ["command"]
  }
}
```

### MCP Tool Execution

When Claude returns a `tool_use` block for an MCP tool, the script must execute the corresponding Attio API call. Map each MCP tool to its HTTP endpoint:

```typescript
const TOOL_TO_ENDPOINT: Record<string, { method: string; path: string | ((input: any) => string); body?: (input: any) => any }> = {
  "list-records": {
    method: "POST",
    path: (input) => `/v2/objects/${input.object}/records/query`,
    body: (input) => ({ filter: input.filter, sorts: input.sorts, limit: input.limit, offset: input.offset }),
  },
  "get-records-by-ids": {
    method: "POST",
    path: () => `/v2/objects/records`,
    body: (input) => ({ record_ids: input.record_ids }),
  },
  "create-record": {
    method: "POST",
    path: (input) => `/v2/objects/${input.object}/records`,
    body: (input) => ({ data: { values: input.values } }),
  },
  // ... map all 30 tools
};
```

**Alternative (simpler):** Instead of reimplementing tool dispatch, use the MCP SDK client to call tools:
```typescript
const result = await mcpClient.callTool({ name: toolName, arguments: toolArgs });
```

This is more accurate because it uses the exact same code path the MCP server uses.

## Scenarios

Run the same operations from LIVE-BENCHMARK-SPEC.md, but simplified to the subset that maps cleanly to both paths. Each scenario defines:

1. A natural language prompt (the "user message" sent to Claude)
2. The expected CLI command (for validation)
3. The expected MCP tool(s) (for validation)
4. A success criteria (how to verify the operation worked)

### Test Data

Create test data before benchmarking (same as LIVE-BENCHMARK-SPEC.md):
- Company: `__MCP_BENCH_COMPANY__`
- Person: `__MCP_BENCH_PERSON__`
- Note, task, comment on the company

Save all IDs for use in scenarios.

### Scenario List

#### Read Operations

| # | Prompt | Expected CLI | Expected MCP Tool | Validate |
|---|--------|-------------|-------------------|----------|
| 1 | "List the first 10 companies in my Attio workspace. Return JSON." | `attio companies list --json --limit 10` | `list-records(object="companies", limit=10)` | Response contains array of companies |
| 2 | "Find companies whose name contains 'Benchmark'. Return JSON." | `attio companies list --filter 'name~Benchmark' --json` | `list-records(object="companies", filter=...)` | Response contains matching companies |
| 3 | "Get the company with ID {COMPANY_ID}. Return JSON." | `attio companies get {COMPANY_ID} --json` | `get-records-by-ids(record_ids=[{COMPANY_ID}])` | Response contains the specific company |
| 4 | "List all people in my Attio workspace, limit 10. Return JSON." | `attio people list --json --limit 10` | `list-records(object="people", limit=10)` | Response contains array of people |
| 5 | "List all tasks. Return JSON." | `attio tasks list --json` | `list-tasks()` | Response contains tasks array |
| 6 | "List notes on company {COMPANY_ID}. Return JSON." | `attio notes list --object companies --record {COMPANY_ID} --json` | `search-notes-by-metadata(...)` or `get-note-body(...)` | Response contains notes |
| 7 | "List comments on company {COMPANY_ID}. Return JSON." | `attio comments list --object companies --record {COMPANY_ID} --json` | `list-comments(...)` | Response contains comments |
| 8 | "List all workspace members. Return JSON." | `attio members list --json` | `list-workspace-members()` | Response contains members |
| 9 | "Show my current Attio identity. Return JSON." | `attio whoami --json` | `whoami()` | Response contains workspace info |
| 10 | "List all objects in the workspace. Return JSON." | `attio objects list --json` | `list-attribute-definitions(object="companies")` (closest equivalent) | Response contains objects/attributes |

#### Write Operations

| # | Prompt | Expected CLI | Expected MCP Tool(s) | Validate | Cleanup |
|---|--------|-------------|---------------------|----------|---------|
| 11 | "Create a company named '__MCP_BENCH_WRITE_{run}__'. Return JSON." | `attio records create companies --set name="..." --json` | `create-record(object="companies", values=...)` (possibly preceded by `list-attribute-definitions`) | Response contains new company ID | Delete after timing |
| 12 | "Update company {COMPANY_ID}, set the name to '__MCP_BENCH_UPDATED__'. Return JSON." | `attio records update companies {COMPANY_ID} --set name="..." --json` | `update-record(...)` | Response shows updated name | Revert name |
| 13 | "Create a note on company {COMPANY_ID} with title 'Bench' and content 'test'. Return JSON." | `attio notes create --object companies --record {COMPANY_ID} --title "Bench" --content "test" --json` | `create-note(...)` | Response contains note ID | Delete after timing |
| 14 | "Create a task with content 'Bench write test'. Return JSON." | `attio tasks create --content "Bench write test" --json` | `create-task(...)` | Response contains task ID | Delete after timing |
| 15 | "Create a comment on company {COMPANY_ID} with content 'Bench write test'. Return JSON." | `attio comments create --object companies --record {COMPANY_ID} --content "..." --json` | `create-comment(...)` | Response contains comment ID | Delete after timing |

#### Multi-Step Operations

| # | Prompt | Steps | Notes |
|---|--------|-------|-------|
| 16 | "Create a company named '__MCP_BENCH_ONBOARD_{run}__', then add a note titled 'Welcome' with content 'New customer'. Return the company ID and note ID as JSON." | Create + Note | Time full conversation |
| 17 | "Create a company named '__MCP_BENCH_FULL_{run}__', add a note titled 'Onboarding', create a follow-up task 'Schedule kickoff', and add a comment 'Welcome aboard'. Return all IDs as JSON." | Create + Note + Task + Comment | The full onboarding workflow |

## Execution Protocol

### Per-Scenario Flow

For each scenario, for each path (MCP, CLI, Direct):

```
1. Record start time
2. Send prompt to Anthropic API with appropriate tools
3. While response contains tool_use blocks:
   a. Record tool call details (name, arguments)
   b. Execute the tool (MCP call or bash command)
   c. Record tool execution time
   d. Send tool_result back to API
4. Record end time
5. Collect usage metadata from all API responses
6. Validate result against success criteria
7. Run cleanup if needed (delete created records)
8. Wait 200ms before next run (rate limiting)
```

### Runs Per Scenario

- **5 runs** per scenario per path
- Discard first run (warmup for API caches, connection pooling, etc.)
- Report **median of runs 2-5**

### Model Selection

Use **Claude Sonnet 4.5** (`claude-sonnet-4-5-20250929`) for all benchmark runs. This is the model most teams would use for agent workflows. Run a separate smaller set on Haiku 3.5 and Opus 4 to validate the token counts scale as expected (they should — token counts are model-independent, but latency varies).

### System Prompt

Use the same system prompt for both paths to keep things fair:

```
You are a CRM automation assistant. When asked to perform operations on Attio,
execute them immediately using the available tools. Return results as JSON.
Do not ask for confirmation — just execute the operation.
```

For the CLI path, append:
```
Use the bash tool to run attio-cli commands. The CLI is installed as `attio`.
```

### Temperature

Set `temperature: 0` for all calls. This ensures deterministic tool selection and makes runs comparable.

## Output Format

Write results to `benchmarks/mcp-bench-results.json`:

```json
{
  "timestamp": "2026-02-14T...",
  "model": "claude-sonnet-4-5-20250929",
  "environment": {
    "os": "macOS ...",
    "node": "v...",
    "cliVersion": "0.2.0",
    "mcpToolCount": 30,
    "runsPerScenario": 5,
    "warmupRuns": 1
  },
  "mcpSchemaTokens": {
    "total": null,
    "note": "Captured from first MCP API call's usage.input_tokens minus the prompt tokens. See methodology."
  },
  "scenarios": [
    {
      "id": 1,
      "name": "List companies",
      "category": "read",
      "prompt": "List the first 10 companies...",
      "mcp": {
        "runs": [
          {
            "input_tokens": 14231,
            "output_tokens": 187,
            "total_tokens": 14418,
            "latency_ms": 4102,
            "api_latency_ms": 412,
            "llm_latency_ms": 3690,
            "tool_calls": 1,
            "turns": 2,
            "tools_used": ["list-records"],
            "success": true,
            "error": null
          }
        ],
        "median_input_tokens": 14231,
        "median_output_tokens": 187,
        "median_total_tokens": 14418,
        "median_latency_ms": 4102,
        "median_api_latency_ms": 412,
        "median_llm_latency_ms": 3690
      },
      "cli": {
        "runs": [
          {
            "input_tokens": 523,
            "output_tokens": 42,
            "total_tokens": 565,
            "latency_ms": 1832,
            "exec_latency_ms": 512,
            "llm_latency_ms": 1320,
            "command": "attio companies list --json --limit 10",
            "success": true,
            "error": null
          }
        ],
        "median_input_tokens": 523,
        "median_output_tokens": 42,
        "median_total_tokens": 565,
        "median_latency_ms": 1832,
        "median_exec_latency_ms": 512,
        "median_llm_latency_ms": 1320
      },
      "direct": {
        "runs": [
          {
            "latency_ms": 512,
            "success": true,
            "error": null
          }
        ],
        "median_latency_ms": 512
      },
      "comparison": {
        "token_ratio": 25.5,
        "token_reduction_pct": 96.1,
        "latency_ratio": 2.2,
        "mcp_schema_overhead_tokens": 13660
      }
    }
  ]
}
```

## Isolating the Schema Overhead

To precisely measure the schema overhead (not estimate it):

1. **Baseline call**: Send a minimal prompt ("Say hi") to the API with no tools. Record `usage.input_tokens` as `baseline_tokens`.
2. **CLI tools call**: Same prompt with just the Bash tool. Record `usage.input_tokens` as `cli_tokens`. The Bash tool schema cost = `cli_tokens - baseline_tokens`.
3. **MCP tools call**: Same prompt with all 30 Attio MCP tools. Record `usage.input_tokens` as `mcp_tokens`. The MCP schema overhead = `mcp_tokens - baseline_tokens`.
4. **Per-tool overhead**: `mcp_tokens - cli_tokens` = pure Attio MCP schema cost.

Run this calibration 3 times and take the median. This gives us exact, API-verified schema token counts — not estimates.

## Validation Checks

After collecting all data, run these sanity checks:

1. **Token consistency**: MCP input tokens should be roughly consistent across runs of the same scenario (within ~5%). Large variance suggests the model is behaving differently between runs.
2. **Tool selection accuracy**: For each MCP scenario, verify Claude called the expected tool(s). Log any cases where it chose a different tool — this is interesting data about MCP reliability.
3. **CLI command accuracy**: For each CLI scenario, verify Claude generated a valid, working command. Log any failures.
4. **Schema overhead consistency**: The difference between MCP and CLI input tokens should be roughly constant across scenarios (it's the schema overhead). Verify this.
5. **Latency sanity**: MCP latency should always exceed CLI latency (since MCP has the same API call plus LLM overhead). Flag any inversions.

## Cost Calculation

Use the exact token counts from the API to calculate costs. Do NOT estimate.

```typescript
function cost(inputTokens: number, outputTokens: number, model: ModelPricing): number {
  return (inputTokens / 1_000_000) * model.input + (outputTokens / 1_000_000) * model.output;
}
```

For the "Cost at Scale" projection, multiply the measured per-operation cost by ops/day × 30 days.

For "Direct CLI" cost, it's $0 — no LLM involved.

## Report Generation

After collecting data, regenerate `benchmarks/REPORT.md` and `benchmarks/ARTICLE.md` using the measured numbers. Update `benchmarks/run.ts` to accept the new results format (`--mcp-results <path>`).

Key numbers to update:
- Schema overhead: use measured value from calibration, not 13,660 estimate
- Per-operation token counts: use actual `usage.input_tokens` / `output_tokens`
- Latency: use measured wall-clock times for both paths
- Cost projections: derive from actual token counts × pricing

## Edge Cases to Handle

1. **Claude refuses or asks for confirmation**: Retry with a firmer prompt. If it still refuses, log as a failure. This is valid data — MCP reliability is part of the comparison.
2. **Claude calls the wrong tool**: Log it, count the extra tokens/latency, and include in the MCP totals. Wrong tool selection is a real MCP cost.
3. **Claude needs multiple turns for MCP**: If Claude calls `list-attribute-definitions` before `create-record`, count all turns. This is real MCP behavior.
4. **Rate limiting from Attio**: Add 200ms delay between runs. If rate-limited, wait and retry once.
5. **Rate limiting from Anthropic**: Respect rate limits. Use exponential backoff.
6. **Claude generates an invalid CLI command**: Log as a CLI failure. This is fair — CLI path isn't perfect either.
7. **Tool result too large**: Some list operations return large payloads. Cap tool_result content at 4000 tokens (truncate with a note) to avoid context window issues. Apply the same cap to both paths.

## What NOT to Do

- Do NOT modify `src/` or `bin/`
- Do NOT use cached or mocked API responses — everything must be live
- Do NOT cherry-pick runs — report all data including failures
- Do NOT use different models for different paths
- Do NOT include prompt engineering tricks in one path but not the other
- Do NOT truncate MCP tool schemas — use the full set as-is

## Dependencies

```json
{
  "@anthropic-ai/sdk": "latest",
  "@modelcontextprotocol/sdk": "latest"
}
```

Install in `benchmarks/` with `npm install` (create a local package.json if needed, keeping it isolated from the main project).

## Estimated Cost

Rough cost estimate for running the full benchmark:
- 17 scenarios × 5 runs × 2 paths (MCP + CLI) = 170 API calls
- Average ~15k input tokens per MCP call, ~600 per CLI call
- At Sonnet 4.5 pricing: ~$0.045 per MCP call, ~$0.002 per CLI call
- Total: ~$8-12 for a full run
- Budget $25 to allow for retries and calibration runs

## Timeline

The benchmark will take ~15-20 minutes to run (170 API calls with rate limiting delays). Most of that time is LLM inference on the MCP path.

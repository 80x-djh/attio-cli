# MCP Benchmark Execution State

> Last updated: 2026-02-14T02:28 UTC

## What's happening

Running the measured MCP benchmark from `benchmarks/MCP-BENCHMARK-PROMPT.md`. Three agents on the `mcp-benchmark` team:

1. **mcp-benchmarker** (Agent 1) — Writing and running `benchmarks/mcp-bench.ts`
2. **report-updater** (Agent 2) — COMPLETED. Updated `benchmarks/run.ts` with `--mcp-results` flag
3. **writer** (Agent 3) — NOT YET STARTED. Blocked on Agent 1.

## Key adaptation

No `ANTHROPIC_API_KEY` available (user is on Claude Max plan). The benchmark uses `claude -p --output-format json` instead of `@anthropic-ai/sdk`. This returns exact token counts via the `usage` and `modelUsage` fields in JSON output.

Attio MCP server is at `https://mcp.attio.com/mcp`, accessed via `mcp-remote`.

### Three benchmark paths

**MCP path** (all Attio MCP tools, no built-in tools):
```bash
unset CLAUDECODE && claude -p --output-format json --model sonnet --no-session-persistence --dangerously-skip-permissions \
  --strict-mcp-config --mcp-config '{"mcpServers":{"attio":{"command":"npx","args":["-y","mcp-remote","https://mcp.attio.com/mcp"]}}}' \
  --tools "" --system-prompt "..." "PROMPT"
```

**CLI path** (Bash tool only, no MCP):
```bash
unset CLAUDECODE && claude -p --output-format json --model sonnet --no-session-persistence --dangerously-skip-permissions \
  --strict-mcp-config --tools "Bash" --system-prompt "..." "PROMPT"
```

**Direct path** (attio CLI directly, no LLM):
```bash
node --import=tsx /Users/daniel/attio-cli/bin/attio.ts <command> --json --no-color
```

## Calibration results (measured)

| Path | Total Input Tokens |
|------|---:|
| Baseline (no tools) | 530 |
| CLI (Bash tool) | 4,204 |
| MCP (30 Attio tools) | 18,725 |
| Bash tool overhead | 3,674 |
| MCP total overhead | 18,195 |
| Pure Attio schema overhead | 14,521 |

Previous estimate was 13,660 tokens. Measured: 14,521 (6% higher).

## Current status

- `benchmarks/mcp-bench.ts` — 773 lines, written and running full benchmark
- `benchmarks/run.ts` — Updated to 1,195 lines with `--mcp-results` flag
- `benchmarks/mcp-bench-results.json` — Exists (test run data with 2 runs, full run underway to overwrite with 5 runs)
- The full benchmark takes ~20-30 minutes (170 claude -p invocations)

## What still needs to happen

1. Wait for `mcp-bench.ts` full run to complete → final `mcp-bench-results.json`
2. Launch Agent 3 (writer) to update `ARTICLE.md` with measured numbers
3. Regenerate `REPORT.md`: `npx tsx benchmarks/run.ts --mcp-results benchmarks/mcp-bench-results.json > benchmarks/REPORT.md`
4. Verify all three outputs (results JSON, REPORT.md, ARTICLE.md)
5. Do NOT commit — leave that to the user

## Early test results (from 2-run test)

MCP path for "List companies": ~42,500 total input tokens, ~2,800 output tokens, ~53s latency
This is much higher latency than expected because `claude -p` startup + MCP server connection adds significant overhead per invocation.

## Files to reference

- Spec: `/Users/daniel/attio-cli/benchmarks/MCP-BENCHMARK-SPEC.md`
- Prompt: `/Users/daniel/attio-cli/benchmarks/MCP-BENCHMARK-PROMPT.md`
- Script: `/Users/daniel/attio-cli/benchmarks/mcp-bench.ts`
- Results: `/Users/daniel/attio-cli/benchmarks/mcp-bench-results.json`
- Report gen: `/Users/daniel/attio-cli/benchmarks/run.ts`
- Article: `/Users/daniel/attio-cli/benchmarks/ARTICLE.md`
- Team: `mcp-benchmark` (tasks in `~/.claude/tasks/mcp-benchmark/`)

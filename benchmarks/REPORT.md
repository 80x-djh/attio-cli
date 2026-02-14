# attio-cli vs Attio MCP: Efficiency Benchmark

> Generated on 2026-02-14
> Live CLI timings: yes

## Executive Summary

The Attio MCP loads **13,660 tokens** of tool schemas into every LLM request — even when only one tool is called. The attio-cli eliminates this overhead entirely.

| Metric | attio-cli | Attio MCP |
|--------|-----------|-----------|
| Tool schema overhead | 0 tokens | 13,660 tokens/request |
| Avg latency (single op) | ~350ms | ~3.9s |
| LLM cost per operation | $0 | $0.05 (Sonnet) |
| Deterministic output | Yes | No |
| Composable with Unix tools | Yes | No |

## How MCP Tool Calling Works (and Why It's Expensive)

When an AI agent uses Attio through MCP, every request follows this path:

```
User prompt
  + System prompt
  + ALL 30 Attio tool schemas (~13k tokens)    <-- paid on every request
  → LLM inference (~2-5 seconds)
    → LLM selects tool + generates arguments
      → Tool executes (HTTP to Attio API)
        → Result returned to LLM
          → LLM interprets result (~1-2 seconds)
            → Final response to user
```

The critical insight: **the full schema payload is sent as input tokens on every single LLM call**, regardless of how many tools you actually use. You pay for all 30 tool definitions even if you only call `whoami`.

With the CLI, the agent just runs a bash command:

```
User prompt
  + System prompt
  + Bash tool schema (~200 tokens)              <-- minimal overhead
  → LLM outputs: attio companies list --json
    → Bash executes (HTTP to Attio API)
      → Done
```

## MCP Tool Schema Overhead

The Attio MCP exposes 30 tools. Here's the token cost by category:

| Category | Tools | Tokens |
|----------|------:|-------:|
| Record CRUD | 3 | 4,170 |
| Record Queries | 4 | 3,200 |
| Schema | 1 | 430 |
| Notes | 4 | 1,200 |
| Comments | 4 | 1,125 |
| Tasks | 3 | 910 |
| Lists & Workspace | 4 | 565 |
| Email & Calls | 6 | 1,720 |
| Meetings | 1 | 340 |
| **Total** | **30** | **13,660** |

## Per-Operation Comparison

Each row compares the cost of a single CRM operation via CLI (bash) vs MCP.
CLI token counts assume an AI agent running the command through a Bash tool.
Direct scripting (no AI) uses zero tokens.

| Scenario | CLI Tokens | MCP Tokens | CLI Latency | MCP Latency | Token Reduction |
|----------|----------:|----------:|------------:|------------:|---------------:|
| List companies | 680 | 14,310 | 713ms | 3.9s | 95% |
| Filtered search | 680 | 14,310 | 495ms | 3.9s | 95% |
| Get a record | 680 | 14,310 | 409ms | 3.9s | 95% |
| Create a record | 680 | 28,620 | 841ms | 7.7s | 98% |
| Update a record | 680 | 14,310 | 627ms | 3.9s | 95% |
| Create a note | 680 | 14,310 | 606ms | 3.9s | 95% |
| List tasks | 680 | 14,310 | 707ms | 3.9s | 95% |
| Bulk export | 680 | 57,240 | 1.5s | 15.4s | 99% |

## Multi-Step Workflow: Company Onboarding

Real workflows chain multiple operations. This is where the cost difference compounds — MCP pays the full schema tax on every step.

**CLI approach** (5 bash commands, composable with pipes):

```bash
ID=$(attio records create companies --set name="Acme" --set domains='["acme.com"]' -q)
attio notes create --object companies --record "$ID" --title "Onboarding" --content "New customer signed"
attio tasks create --content "Schedule kickoff call" --object companies --record "$ID"
attio comments create --object companies --record "$ID" --content "Welcome aboard!"
attio records get companies "$ID" --json
```

**MCP approach** (7 tool calls across 5 steps, each paying the schema tax):

| Step | MCP Tool Calls | MCP Input Tokens |
|------|---------------:|-----------------:|
| Create company record | 2 (list-attribute-definitions, create-record) | 28,620 |
| Add onboarding note | 1 (create-note) | 14,310 |
| Create follow-up task | 1 (create-task) | 14,310 |
| Add comment for team | 1 (create-comment) | 14,310 |
| Verify record was created | 1 (get-records-by-ids) | 14,310 |
| **Total** | **6 calls** | **85,860** |

| Metric | CLI | MCP | Difference |
|--------|----:|----:|-----------:|
| Total tokens | 3,400 | 85,860 | 96% less |
| Latency | 1.6s | 23.1s | 21.4s saved |
| Cost (Haiku 3.5) | <$0.01 | $0.07 | $0.07 saved |
| Cost (Sonnet 4.5) | $0.01 | $0.28 | $0.26 saved |
| Cost (Opus 4) | $0.06 | $1.38 | $1.32 saved |

## Cost at Scale

Monthly cost of the MCP schema overhead alone (30 days), assuming one LLM call per operation.

| Ops/Day | Haiku 3.5 MCP | Sonnet 4.5 MCP | Opus 4 MCP | CLI |
|--------:|----------:|----------:|----------:|----:|
| 10 | $3.63 | $13.60 | $67.99 | $0* |
| 50 | $18.13 | $68.00 | $339.97 | $0* |
| 100 | $36.26 | $135.99 | $679.95 | $0* |
| 500 | $181.32 | $679.95 | $3399.75 | $0* |
| 1,000 | $362.64 | $1359.90 | $6799.50 | $0* |
| 5,000 | $1813.20 | $6799.50 | $33997.50 | $0* |

\* $0 for direct scripting. When used through an AI agent's Bash tool, token cost is ~680 per operation (see Per-Operation Comparison).

## Beyond Cost: Qualitative Advantages

| Dimension | attio-cli | Attio MCP |
|-----------|-----------|-----------|
| **Determinism** | Same input always produces same output | LLM may choose wrong tool, hallucinate params, or misformat arguments |
| **Composability** | Pipe to `jq`, `grep`, `xargs`, `awk` — build complex workflows from simple parts | Each operation requires a full LLM round-trip; no native piping |
| **Debuggability** | `--debug` flag shows exact HTTP requests; reproduce any call with curl | Tool calls are opaque; hard to see what the LLM actually sent |
| **Batch operations** | `xargs`, `while read`, parallel execution | Sequential tool calls, each with full LLM overhead |
| **Idempotency** | `--quiet` outputs IDs for reliable chaining | LLM response format varies between calls |
| **Error handling** | Exit codes (0=ok, 1=error, 2=auth, 5=rate-limit) | Errors embedded in natural language, must be parsed by another LLM call |
| **Version control** | CLI commands are plain text in scripts, easily diffable | Tool schemas are managed by MCP server, changes are invisible |

## Methodology

### Token Counting

MCP tool schema tokens were measured by serializing each of the 30 Attio MCP tool definitions (name + description + full JSON Schema parameters) and estimating tokens at ~3.5 characters per token. Token counts are estimates based on ~3.5 characters per token for JSON content. Actual BPE tokenization may vary by 10-20%.

Per-operation overhead includes:
- **Schema context**: 13,660 input tokens (all 30 tool definitions, sent on every request)
- **LLM reasoning**: ~120 output tokens (tool selection + argument generation)
- **Tool result**: ~400 input tokens (API response fed back to LLM)
- **LLM response**: ~80 output tokens (interpreting result for user)

### Latency

CLI latency was measured live by running each command and measuring wall-clock time. MCP latency adds estimated LLM inference overhead (2-5s per tool call, using 3.5s as point estimate) to the same API round-trip time.

**Note on parallel tool calls:** Some MCP implementations support parallel tool calls within a single turn, which would reduce multi-step overhead. This benchmark models the sequential (worst) case.

### Pricing

Token pricing as of February 2025 (per million tokens):

| Model | Input | Output |
|-------|------:|-------:|
| Haiku 3.5 | $0.80 | $4.00 |
| Sonnet 4.5 | $3.00 | $15.00 |
| Opus 4 | $15.00 | $75.00 |

## The Real Win: Direct Scripting

The comparisons above assume an AI agent using either approach. But the CLI's ultimate advantage is that **many workflows don't need an AI agent at all**:

```bash
# Export all companies to a CSV — zero tokens, zero LLM cost
attio companies list --all --csv > companies.csv

# Bulk update from a file
while IFS=, read -r id status; do
  attio records update companies "$id" --set "status=$status"
done < updates.csv

# Find and clean up test data
attio companies list --filter 'name^TEST_' -q | \
  xargs -I{} attio records delete companies {} --yes

# Daily sync in a cron job
attio companies list --all --json | jq '.[] | select(.values.status[0].status.title == "Active")' > active.json
```

These workflows are **free**, **instant** (limited only by API latency), **deterministic**, and **version-controllable**. No MCP tool can match this.


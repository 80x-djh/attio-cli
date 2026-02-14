# The Hidden Tax on AI Agents: What MCP Actually Costs

Every time an AI agent uses MCP to call a SaaS API, it pays a tax nobody talks about. Not the API call itself -- that's the same either way. The tax is the 13,660 tokens of tool schema definitions stuffed into every single LLM request, whether the agent uses one tool or none. At Sonnet 4.5 pricing, running 1,000 operations per day through MCP costs $1,359.90 per month in token overhead alone. A CLI doing the same work costs $0.

We ran a live benchmark to measure this. Not estimates, not back-of-envelope math -- actual timed operations against a production Attio workspace, comparing the Attio MCP server (30 tools, used through Claude) against `attio-cli` (a purpose-built CLI for the same API). The results are stark enough that anyone building AI agent workflows should reconsider the default reach for MCP.

## What MCP actually costs

MCP (Model Context Protocol) lets AI agents call external tools. The agent's LLM sees a list of available tool definitions -- names, descriptions, JSON Schema parameters -- and decides which one to invoke. The problem is structural: the LLM needs *all* tool definitions in its context window on *every* request, because it needs to choose between them.

The Attio MCP server exposes 30 tools. Here's what that looks like by category:

| Category | Tools | Schema Tokens |
|----------|------:|-------------:|
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

Those 13,660 tokens ride along as input on every LLM call. Even a simple `whoami` check pays for all 30 tool definitions. The record CRUD tools alone account for 4,170 tokens because their schemas document every attribute type, record reference format, multiselect handling, and value format example.

Here's the request flow, side by side:

```
MCP path:                                    CLI path:

User prompt                                  User prompt
  + System prompt                              + System prompt
  + ALL 30 tool schemas (~13k tokens)          + Bash tool schema (~200 tokens)
  -> LLM inference (2-5s)                      -> LLM outputs: attio companies list --json
    -> LLM selects tool + generates args         -> Bash executes (~400ms API call)
      -> Tool executes (~400ms API call)           -> Done
        -> Result returned to LLM
          -> LLM interprets result (1-2s)
            -> Final response
```

The MCP path has two LLM inference passes per operation (tool selection, then result interpretation), each carrying the full 13,660-token schema payload. The CLI path has one LLM pass with a ~200-token Bash tool definition, then a direct API call. No schema tax. No interpretation pass.

Token counts here are estimates based on ~3.5 characters per token for JSON content. Actual BPE tokenization may vary by 10-20%. The directional comparison holds regardless.

## The benchmark

We measured 31 scenarios against a live Attio workspace: 20 read operations, 7 write operations, and 4 compound (multi-step) workflows. Each scenario ran 5 times; the first run was discarded as warmup and the median of the remaining 4 was recorded. All commands used `--json --no-color` output piped to `/dev/null` to isolate API latency from rendering.

### Per-operation comparison

For each operation, the CLI column shows measured wall-clock time. The MCP column models the full round-trip: LLM inference (2-5s, using 3.5s as point estimate) plus the same API call time. Token counts assume an AI agent using either approach -- for the CLI, the agent invokes a Bash tool (~680 tokens total); for MCP, it goes through the full tool-calling flow (~14,310 tokens for a single tool call).

| Operation | CLI (measured) | MCP (modeled) | CLI Tokens | MCP Tokens | Savings |
|-----------|---------------:|--------------:|-----------:|-----------:|--------:|
| List companies | 713ms | 3.9s | 680 | 14,310 | 95% |
| Search companies | 374ms | 3.9s | 680 | 14,310 | 95% |
| Get company by ID | 409ms | 3.9s | 680 | 14,310 | 95% |
| Filter + list | 495ms | 3.9s | 680 | 14,310 | 95% |
| List people | 483ms | 3.9s | 680 | 14,310 | 95% |
| Create company | 841ms | 7.7s | 680 | 28,620 | 98% |
| Update record | 627ms | 3.9s | 680 | 14,310 | 95% |
| Create note | 606ms | 3.9s | 680 | 14,310 | 95% |
| Create task | 902ms | 3.9s | 680 | 14,310 | 95% |
| Delete record | 411ms | 3.9s | 680 | 14,310 | 95% |

Create company is the most expensive MCP operation (28,620 tokens) because the LLM typically needs two tool calls: first `list-attribute-definitions` to discover the company schema, then `create-record` with the correct field format. Each call pays the full 13,660-token schema tax.

Note: some MCP implementations support parallel tool calls within a single turn, which would reduce multi-step overhead. This benchmark models the sequential (worst) case, which is what most agent frameworks default to today.

The median CLI latency across all read operations was 431ms. Writes had a median of 788ms. The fastest operation was `objects list` at 294ms; the overall median across all 31 scenarios was 492ms.

### Multi-step workflow: company onboarding

Single operations are one thing. Real agent workflows chain multiple operations, and that's where MCP's cost compounds. Consider a standard company onboarding flow: create the company, add a note, create a follow-up task, leave a comment, verify the record.

**CLI approach** -- 5 bash commands:

```bash
ID=$(attio records create companies --set name="Acme" --set domains='["acme.com"]' -q)
attio notes create --object companies --record "$ID" --title "Onboarding" --content "New customer signed"
attio tasks create --content "Schedule kickoff call" --object companies --record "$ID"
attio comments create --object companies --record "$ID" --content "Welcome aboard!"
attio records get companies "$ID" --json
```

**MCP approach** -- 6 tool calls across 5 steps, each paying the schema tax:

| Step | MCP Tool Calls | MCP Tokens |
|------|---------------:|-----------:|
| Create company | 2 (list-attribute-definitions, create-record) | 28,620 |
| Add note | 1 (create-note) | 14,310 |
| Create task | 1 (create-task) | 14,310 |
| Add comment | 1 (create-comment) | 14,310 |
| Verify record | 1 (get-records-by-ids) | 14,310 |
| **Total** | **6 calls** | **85,860** |

Our benchmark measured the compound operations directly. Creating a company and adding a note took a median of 1,251ms via CLI. Creating a company and adding a task: 1,472ms. A search followed by a detail fetch: 1,300ms. The MCP equivalent of the full onboarding workflow would take over 23 seconds of wall-clock time (6 tool calls at ~3.9s each) versus under 3 seconds for the CLI.

| Metric | CLI | MCP | Difference |
|--------|----:|----:|-----------:|
| Total tokens | 3,400 | 85,860 | 96% fewer |
| Latency | ~3s | ~23s | ~20s saved |
| Cost (Haiku 3.5) | <$0.01 | $0.07 | $0.07 saved |
| Cost (Sonnet 4.5) | $0.01 | $0.28 | $0.26 saved |
| Cost (Opus 4) | $0.06 | $1.38 | $1.32 saved |

$1.38 per onboarding on Opus 4. Do ten of those a day and it's $414/month just for one workflow.

### Cost at scale

Here's the monthly cost of MCP schema overhead for varying operation volumes, assuming one LLM call per operation:

| Ops/Day | Haiku 3.5 | Sonnet 4.5 | Opus 4 | CLI |
|--------:|----------:|-----------:|-------:|----:|
| 10 | $3.63 | $13.60 | $67.99 | $0* |
| 50 | $18.13 | $68.00 | $339.97 | $0* |
| 100 | $36.26 | $135.99 | $679.95 | $0* |
| 500 | $181.32 | $679.95 | $3,399.75 | $0* |
| 1,000 | $362.64 | $1,359.90 | $6,799.50 | $0* |
| 5,000 | $1,813.20 | $6,799.50 | $33,997.50 | $0* |

\* $0 for direct scripting. When used through an AI agent's Bash tool, token cost is ~680 per operation (see Per-Operation Comparison above), which works out to roughly $0.06/day at 100 ops on Sonnet -- effectively zero compared to MCP.

The Sonnet 4.5 column is the one most teams will care about. At 1,000 operations per day -- not unusual for a team automating CRM workflows -- MCP costs $1,359.90 per month in schema overhead alone. That's before counting the actual work the LLM does.

## Beyond cost

The token savings are the easy thing to measure. The harder-to-quantify advantages matter just as much in production.

**Determinism.** `attio companies list --filter 'name~Acme' --sort name:asc --json` returns the same result every time. An MCP tool call goes through an LLM that might pick the wrong tool, hallucinate a parameter name, or format arguments incorrectly. For automated workflows running on a schedule, non-determinism is a bug, not a feature.

**Composability.** The CLI speaks Unix. Pipe its output to `jq` to reshape data, to `grep` to filter, to `xargs` to fan out operations, to `wc -l` to count results. Chain commands with `&&` and `|`. Build complex workflows from simple, testable parts:

```bash
# Export active companies, extract domains, deduplicate
attio companies list --all --json | \
  jq -r '.[].values.domains[0].domain' | \
  sort -u > active-domains.txt

# Bulk update from a CSV -- zero tokens, zero LLM cost
while IFS=, read -r id status; do
  attio records update companies "$id" --set "status=$status"
done < updates.csv

# Find and clean up test data in one pipeline
attio companies list --filter 'name^TEST_' -q | \
  xargs -I{} attio records delete companies {} --yes
```

Each of those pipelines is free (no LLM involved), deterministic (same input, same output), and trivially version-controllable (it's just text in a script). MCP cannot compose this way -- every operation requires a full LLM round-trip with the schema tax attached.

**Debuggability.** When something goes wrong, `attio companies list --debug` prints the exact HTTP request and response to stderr. You can reproduce the call with `curl`. MCP tool calls are opaque -- you can't easily see what the LLM actually sent or why a particular response came back.

## When MCP still makes sense

MCP is genuinely useful in specific contexts. For ad-hoc exploration by a human chatting with an AI assistant -- "show me the last 5 deals we closed" -- the convenience of natural language outweighs the token cost. For discovering an unfamiliar API, MCP's tool schemas serve as built-in documentation. For one-off queries where the user doesn't know the exact CLI syntax, MCP removes friction.

The mistake is using MCP for *automated workflows*. Once you know what operations you need, once you're running them repeatedly, once you're building pipelines -- the LLM interpretation layer becomes pure overhead. You wouldn't use a chatbot to run your cron jobs.

## Conclusion

We measured 31 operations against a live Attio workspace. The Attio MCP server loads 13,660 tokens of schema definitions into every request. A single CRM operation costs 14,310 tokens through MCP versus 680 tokens through a CLI -- a 95% reduction. A five-step onboarding workflow costs 85,860 tokens through MCP versus 3,400 through the CLI. At scale, MCP adds $1,359.90/month at 1,000 daily operations on Sonnet 4.5 pricing.

The fix is straightforward: for any CRM operation you'll run more than once, use a CLI. `attio-cli` is open source and available at [github.com/danielgross/attio-cli](https://github.com/danielgross/attio-cli).

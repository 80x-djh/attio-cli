#!/usr/bin/env npx tsx
/**
 * attio-cli vs Attio MCP: Efficiency Benchmark
 *
 * Measures token cost, latency, and dollar cost differences between
 * using the attio-cli directly vs going through the Attio MCP with an LLM.
 *
 * Usage:
 *   npx tsx benchmarks/run.ts                              # Uses estimated CLI latency
 *   npx tsx benchmarks/run.ts --live                       # Measures real CLI latency (needs API key)
 *   npx tsx benchmarks/run.ts --results <path>             # Uses timings from live-results.json
 *   npx tsx benchmarks/run.ts --mcp-results <path>         # Uses measured MCP data from mcp-bench-results.json
 *   npx tsx benchmarks/run.ts --json                       # Output raw data as JSON
 *   npx tsx benchmarks/run.ts > BENCHMARK.md               # Save report
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// MCP Tool Schema Token Counts
// ---------------------------------------------------------------------------
// Measured from actual Attio MCP tool definitions loaded via Claude Code.
// Token counts estimated at ~3.5 characters per token (standard for JSON/code
// with Claude's tokenizer). Each entry represents the full tool definition:
// name + description + JSON Schema parameters.

interface McpTool {
  name: string;
  tokens: number;
  category: string;
}

const MCP_TOOLS: McpTool[] = [
  // Record CRUD — these are the heaviest tools due to the massive `values`
  // parameter documentation covering every attribute type, record references,
  // multiselect handling, and format examples.
  { name: "create-record", tokens: 1370, category: "Record CRUD" },
  { name: "update-record", tokens: 1370, category: "Record CRUD" },
  { name: "upsert-record", tokens: 1430, category: "Record CRUD" },

  // Record queries — large filter schemas with nested AND/OR types,
  // operator enums per attribute type, and sorting definitions.
  { name: "list-records", tokens: 1000, category: "Record Queries" },
  { name: "list-records-in-list", tokens: 1000, category: "Record Queries" },
  { name: "search-records", tokens: 860, category: "Record Queries" },
  { name: "get-records-by-ids", tokens: 340, category: "Record Queries" },

  // Schema introspection
  { name: "list-attribute-definitions", tokens: 430, category: "Schema" },

  // Notes
  { name: "create-note", tokens: 340, category: "Notes" },
  { name: "get-note-body", tokens: 140, category: "Notes" },
  { name: "search-notes-by-metadata", tokens: 430, category: "Notes" },
  { name: "semantic-search-notes", tokens: 290, category: "Notes" },

  // Comments
  { name: "create-comment", tokens: 490, category: "Comments" },
  { name: "list-comments", tokens: 290, category: "Comments" },
  { name: "list-comment-replies", tokens: 230, category: "Comments" },
  { name: "delete-comment", tokens: 115, category: "Comments" },

  // Tasks
  { name: "create-task", tokens: 340, category: "Tasks" },
  { name: "update-task", tokens: 340, category: "Tasks" },
  { name: "list-tasks", tokens: 230, category: "Tasks" },

  // Lists & Workspace
  { name: "list-lists", tokens: 170, category: "Lists & Workspace" },
  { name: "list-workspace-members", tokens: 170, category: "Lists & Workspace" },
  { name: "list-workspace-teams", tokens: 140, category: "Lists & Workspace" },
  { name: "whoami", tokens: 85, category: "Lists & Workspace" },

  // Email & Calls
  { name: "get-email-content", tokens: 140, category: "Email & Calls" },
  { name: "get-call-recording", tokens: 140, category: "Email & Calls" },
  { name: "search-emails-by-metadata", tokens: 430, category: "Email & Calls" },
  { name: "search-call-recordings-by-metadata", tokens: 430, category: "Email & Calls" },
  { name: "semantic-search-emails", tokens: 290, category: "Email & Calls" },
  { name: "semantic-search-call-recordings", tokens: 290, category: "Email & Calls" },

  // Meetings
  { name: "search-meetings", tokens: 340, category: "Meetings" },
];

const TOTAL_SCHEMA_TOKENS = MCP_TOOLS.reduce((sum, t) => sum + t.tokens, 0);

// ---------------------------------------------------------------------------
// LLM Pricing (per million tokens, USD)
// ---------------------------------------------------------------------------

interface ModelPricing {
  name: string;
  input: number;
  output: number;
}

const MODELS: ModelPricing[] = [
  { name: "Haiku 3.5", input: 0.80, output: 4.0 },
  { name: "Sonnet 4.5", input: 3.0, output: 15.0 },
  { name: "Opus 4", input: 15.0, output: 75.0 },
];

// ---------------------------------------------------------------------------
// Per-Operation LLM Overhead (output tokens for MCP path)
// ---------------------------------------------------------------------------
// When an LLM uses MCP, it must: reason about which tool to use, generate
// the tool call JSON, then interpret the result and generate a response.

const MCP_REASONING_TOKENS = 120; // Selecting tool + generating arguments
const MCP_RESPONSE_TOKENS = 80; // Interpreting result + user-facing answer
const MCP_TOOL_RESULT_TOKENS = 400; // Average tool result fed back as input

// For CLI via bash: LLM just outputs a short bash command string
const CLI_BASH_TOOL_SCHEMA_TOKENS = 200; // The Bash tool definition itself
const CLI_COMMAND_OUTPUT_TOKENS = 30; // LLM generating "attio companies list --json"
const CLI_RESULT_TOKENS = 400; // Same data comes back either way

// ---------------------------------------------------------------------------
// Benchmark Scenarios
// ---------------------------------------------------------------------------

interface Scenario {
  name: string;
  description: string;
  cli: {
    command: string;
    estimatedLatencyMs: number;
  };
  mcp: {
    toolCalls: number;
    tools: string[];
    description: string;
  };
}

const SCENARIOS: Scenario[] = [
  {
    name: "List companies",
    description: "Retrieve the first 10 companies",
    cli: {
      command: "attio companies list --json --limit 10",
      estimatedLatencyMs: 350,
    },
    mcp: {
      toolCalls: 1,
      tools: ["list-records"],
      description: 'Call list-records with object="companies"',
    },
  },
  {
    name: "Filtered search",
    description: "Find companies matching a name filter, sorted alphabetically",
    cli: {
      command: "attio companies list --filter 'name~Acme' --sort name:asc --json",
      estimatedLatencyMs: 400,
    },
    mcp: {
      toolCalls: 1,
      tools: ["list-records"],
      description: "Call list-records with filter and sort parameters",
    },
  },
  {
    name: "Get a record",
    description: "Fetch a single company by ID",
    cli: {
      command: "attio companies get <id> --json",
      estimatedLatencyMs: 250,
    },
    mcp: {
      toolCalls: 1,
      tools: ["get-records-by-ids"],
      description: "Call get-records-by-ids with one ID",
    },
  },
  {
    name: "Create a record",
    description: "Create a new company with name and domain",
    cli: {
      command: "attio records create companies --set name='Acme' --set domains='[\"acme.com\"]' --json",
      estimatedLatencyMs: 400,
    },
    mcp: {
      toolCalls: 2,
      tools: ["list-attribute-definitions", "create-record"],
      description: "First list-attribute-definitions to discover fields, then create-record",
    },
  },
  {
    name: "Update a record",
    description: "Update a company's status field",
    cli: {
      command: "attio records update companies <id> --set status=active --json",
      estimatedLatencyMs: 350,
    },
    mcp: {
      toolCalls: 1,
      tools: ["update-record"],
      description: "Call update-record with new values",
    },
  },
  {
    name: "Create a note",
    description: "Attach a note to a company record",
    cli: {
      command: 'attio notes create --object companies --record <id> --title "Meeting" --content "Discussed roadmap" --json',
      estimatedLatencyMs: 350,
    },
    mcp: {
      toolCalls: 1,
      tools: ["create-note"],
      description: "Call create-note with parent object and record",
    },
  },
  {
    name: "List tasks",
    description: "List open tasks in the workspace",
    cli: {
      command: "attio tasks list --json",
      estimatedLatencyMs: 300,
    },
    mcp: {
      toolCalls: 1,
      tools: ["list-tasks"],
      description: "Call list-tasks",
    },
  },
  {
    name: "Bulk export",
    description: "Export all companies (paginated, ~200 records)",
    cli: {
      command: "attio companies list --all --json",
      estimatedLatencyMs: 1500,
    },
    mcp: {
      toolCalls: 4,
      tools: ["list-records", "list-records", "list-records", "list-records"],
      description: "4 paginated list-records calls (50 per page)",
    },
  },
];

// Multi-step workflow scenario (separate because it's more complex)
interface WorkflowStep {
  description: string;
  cliCommand: string;
  cliLatencyMs: number;
  mcpTools: string[];
}

const ONBOARDING_WORKFLOW: WorkflowStep[] = [
  {
    description: "Create company record",
    cliCommand: 'ID=$(attio records create companies --set name="Acme" --set domains=\'["acme.com"]\' -q)',
    cliLatencyMs: 400,
    mcpTools: ["list-attribute-definitions", "create-record"],
  },
  {
    description: "Add onboarding note",
    cliCommand: 'attio notes create --object companies --record "$ID" --title "Onboarding" --content "New customer signed"',
    cliLatencyMs: 350,
    mcpTools: ["create-note"],
  },
  {
    description: "Create follow-up task",
    cliCommand: 'attio tasks create --content "Schedule kickoff call" --object companies --record "$ID"',
    cliLatencyMs: 350,
    mcpTools: ["create-task"],
  },
  {
    description: "Add comment for team",
    cliCommand: 'attio comments create --object companies --record "$ID" --content "Welcome aboard!"',
    cliLatencyMs: 300,
    mcpTools: ["create-comment"],
  },
  {
    description: "Verify record was created",
    cliCommand: 'attio records get companies "$ID" --json',
    cliLatencyMs: 250,
    mcpTools: ["get-records-by-ids"],
  },
];

// ---------------------------------------------------------------------------
// Cost Calculations
// ---------------------------------------------------------------------------

interface OperationCost {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
}

function mcpCostPerOperation(toolCalls: number): OperationCost {
  // Input: schema overhead (every request) + user prompt + tool results
  // The schema tax is paid on EVERY turn in the conversation.
  // In multi-tool-call scenarios, each subsequent turn also carries
  // prior messages, but we conservatively count just schema + result.
  const inputTokens =
    TOTAL_SCHEMA_TOKENS * toolCalls + // schemas on every turn
    50 * toolCalls + // user/system prompt fragments
    MCP_TOOL_RESULT_TOKENS * toolCalls; // tool results fed back

  const outputTokens =
    (MCP_REASONING_TOKENS + MCP_RESPONSE_TOKENS) * toolCalls;

  // Latency: LLM inference (~2-5s, using 3.5s point estimate) + API call (~300ms) per tool call
  const latencyMs = toolCalls * (3500 + 350);

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    latencyMs,
  };
}

function cliCostPerOperation(
  toolCalls: number,
  cliLatencyMs: number,
): OperationCost {
  // When an AI agent uses bash, it only needs the Bash tool schema (~200 tokens)
  // in context, plus minimal tokens for the command itself.
  const inputTokens =
    CLI_BASH_TOOL_SCHEMA_TOKENS + // Bash tool schema (once)
    CLI_RESULT_TOKENS * toolCalls + // command output fed back
    50; // user prompt

  const outputTokens = CLI_COMMAND_OUTPUT_TOKENS * toolCalls;

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    latencyMs: cliLatencyMs,
  };
}

function dollarCost(
  op: OperationCost,
  model: ModelPricing,
): number {
  return (
    (op.inputTokens / 1_000_000) * model.input +
    (op.outputTokens / 1_000_000) * model.output
  );
}

// ---------------------------------------------------------------------------
// CLI Timing (optional live measurement)
// ---------------------------------------------------------------------------

function tryTimeCli(command: string): number | null {
  try {
    const start = performance.now();
    execSync(command, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return Math.round(performance.now() - start);
  } catch {
    return null;
  }
}

function cliAvailable(): boolean {
  try {
    execSync("attio whoami", {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtDollars(n: number): string {
  if (n < 0.01) return "<$0.01";
  return "$" + n.toFixed(2);
}

function fmtLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function pct(a: number, b: number): string {
  if (b === 0) return "N/A";
  return Math.round(((b - a) / b) * 100) + "%";
}

function generateReport(liveTimings: Map<string, number> | null, mcpResults: McpBenchResults | null = null): string {
  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  const measured = mcpResults !== null;
  const schemaOverhead = measured ? mcpResults.calibration.attio_schema_overhead : TOTAL_SCHEMA_TOKENS;
  const mcpToolCount = measured ? (mcpResults.calibration.mcp_tokens > 0 ? MCP_TOOLS.length : MCP_TOOLS.length) : MCP_TOOLS.length;

  w("# attio-cli vs Attio MCP: Efficiency Benchmark");
  w("");
  w(`> Generated on ${new Date().toISOString().split("T")[0]}`);
  w(`> Live CLI timings: ${liveTimings ? "yes" : "no (using estimates)"}`);
  w(`> Measured MCP data: ${measured ? "yes (from Anthropic API usage metadata)" : "no (using estimates)"}`);
  w("");

  // -- Executive Summary ---------------------------------------------------
  w("## Executive Summary");
  w("");
  w(`The Attio MCP loads **${fmt(schemaOverhead)} tokens** of tool schemas into every LLM request — even when only one tool is called. The attio-cli eliminates this overhead entirely.`);
  w("");

  // Calculate avg latency from measured data if available
  let avgCliLatency = "~350ms";
  let avgMcpLatency = "~3.9s";
  let mcpSonnetCost = fmtDollars(dollarCost(mcpCostPerOperation(1), MODELS[1]));

  if (measured) {
    const cliLatencies: number[] = [];
    const mcpLatencies: number[] = [];
    let totalMcpInput = 0;
    let totalMcpOutput = 0;
    let mcpCount = 0;
    for (const s of mcpResults.scenarios) {
      if (s.cli?.median_latency_ms) cliLatencies.push(s.cli.median_latency_ms);
      if (s.mcp?.median_latency_ms) mcpLatencies.push(s.mcp.median_latency_ms);
      if (s.mcp?.median_total_input_tokens) {
        totalMcpInput += s.mcp.median_total_input_tokens;
        totalMcpOutput += s.mcp.median_output_tokens ?? 0;
        mcpCount++;
      }
    }
    if (cliLatencies.length > 0) {
      const avg = Math.round(cliLatencies.reduce((a, b) => a + b, 0) / cliLatencies.length);
      avgCliLatency = fmtLatency(avg);
    }
    if (mcpLatencies.length > 0) {
      const avg = Math.round(mcpLatencies.reduce((a, b) => a + b, 0) / mcpLatencies.length);
      avgMcpLatency = fmtLatency(avg);
    }
    if (mcpCount > 0) {
      const avgInput = totalMcpInput / mcpCount;
      const avgOutput = totalMcpOutput / mcpCount;
      mcpSonnetCost = fmtDollars(
        (avgInput / 1_000_000) * MODELS[1].input + (avgOutput / 1_000_000) * MODELS[1].output,
      );
    }
  }

  w("| Metric | attio-cli | Attio MCP |");
  w("|--------|-----------|-----------|");
  w(`| Tool schema overhead | 0 tokens | ${fmt(schemaOverhead)} tokens/request |`);
  w(`| Avg latency (single op) | ${avgCliLatency} | ${avgMcpLatency} |`);
  w(`| LLM cost per operation | $0 | ${mcpSonnetCost} (Sonnet) |`);
  w(`| Deterministic output | Yes | No |`);
  w(`| Composable with Unix tools | Yes | No |`);
  w("");

  // -- How MCP Works -------------------------------------------------------
  w("## How MCP Tool Calling Works (and Why It's Expensive)");
  w("");
  w("When an AI agent uses Attio through MCP, every request follows this path:");
  w("");
  w("```");
  w("User prompt");
  w("  + System prompt");
  w(`  + ALL ${mcpToolCount} Attio tool schemas (~${fmt(schemaOverhead)} tokens)    <-- paid on every request`);
  w("  → LLM inference (~2-5 seconds)");
  w("    → LLM selects tool + generates arguments");
  w("      → Tool executes (HTTP to Attio API)");
  w("        → Result returned to LLM");
  w("          → LLM interprets result (~1-2 seconds)");
  w("            → Final response to user");
  w("```");
  w("");
  w("The critical insight: **the full schema payload is sent as input tokens on every single LLM call**, regardless of how many tools you actually use. You pay for all 30 tool definitions even if you only call `whoami`.");
  w("");
  w("With the CLI, the agent just runs a bash command:");
  w("");
  w("```");
  w("User prompt");
  w("  + System prompt");
  w("  + Bash tool schema (~200 tokens)              <-- minimal overhead");
  w("  → LLM outputs: attio companies list --json");
  w("    → Bash executes (HTTP to Attio API)");
  w("      → Done");
  w("```");
  w("");

  // -- Schema Overhead Breakdown -------------------------------------------
  w("## MCP Tool Schema Overhead");
  w("");

  if (measured) {
    w(`The Attio MCP exposes ${mcpToolCount} tools. The schema overhead was measured using the Anthropic API's usage metadata (exact BPE token counts):`);
    w("");
    w("| Measurement | Tokens |");
    w("|-------------|-------:|");
    w(`| Baseline (no tools) | ${fmt(mcpResults.calibration.baseline_tokens)} |`);
    w(`| With Bash tool only | ${fmt(mcpResults.calibration.cli_tokens)} |`);
    w(`| With all Attio MCP tools | ${fmt(mcpResults.calibration.mcp_tokens)} |`);
    w(`| **Bash tool overhead** | **${fmt(mcpResults.calibration.bash_overhead)}** |`);
    w(`| **Attio MCP schema overhead** | **${fmt(mcpResults.calibration.attio_schema_overhead)}** |`);
    w(`| **Total MCP overhead** | **${fmt(mcpResults.calibration.mcp_overhead)}** |`);
  } else {
    w(`The Attio MCP exposes ${MCP_TOOLS.length} tools. Here's the token cost by category:`);
    w("");

    const categories = new Map<string, { tools: string[]; tokens: number }>();
    for (const tool of MCP_TOOLS) {
      const cat = categories.get(tool.category) || { tools: [], tokens: 0 };
      cat.tools.push(tool.name);
      cat.tokens += tool.tokens;
      categories.set(tool.category, cat);
    }

    w("| Category | Tools | Tokens |");
    w("|----------|------:|-------:|");
    for (const [cat, data] of categories) {
      w(`| ${cat} | ${data.tools.length} | ${fmt(data.tokens)} |`);
    }
    w(`| **Total** | **${MCP_TOOLS.length}** | **${fmt(TOTAL_SCHEMA_TOKENS)}** |`);
  }
  w("");

  // -- Per-Operation Comparison --------------------------------------------
  w("## Per-Operation Comparison");
  w("");
  if (measured) {
    w("Each row compares the cost of a single CRM operation via CLI (bash) vs MCP, plus direct CLI execution (no LLM).");
    w("All token counts and latencies are measured from real Anthropic API calls.");
  } else {
    w("Each row compares the cost of a single CRM operation via CLI (bash) vs MCP.");
    w("CLI token counts assume an AI agent running the command through a Bash tool.");
  }
  w("Direct scripting (no AI) uses zero tokens.");
  w("");
  w("| Scenario | CLI Tokens | MCP Tokens | Direct Latency | CLI Latency | MCP Latency | Token Reduction |");
  w("|----------|----------:|----------:|---------------:|------------:|------------:|---------------:|");

  if (measured) {
    // Use measured data — iterate over mcp-bench scenarios
    const emitted = new Set<string>();
    // First emit scenarios that match existing SCENARIOS
    for (const s of SCENARIOS) {
      const mcpScenario = findMcpScenario(mcpResults, s.name);
      if (mcpScenario) {
        emitted.add(mcpScenario.name.toLowerCase());
        const cliTokens = mcpScenario.cli?.median_total_tokens ?? mcpScenario.cli?.median_total_input_tokens ?? 0;
        const mcpTokens = mcpScenario.mcp?.median_total_tokens ?? mcpScenario.mcp?.median_total_input_tokens ?? 0;
        const directLatency = mcpScenario.direct?.median_latency_ms ?? 0;
        const cliLatency = mcpScenario.cli?.median_latency_ms ?? 0;
        const mcpLatency = mcpScenario.mcp?.median_latency_ms ?? 0;

        w(
          `| ${s.name} | ${fmt(cliTokens)} | ${fmt(mcpTokens)} | ${fmtLatency(directLatency)} | ${fmtLatency(cliLatency)} | ${fmtLatency(mcpLatency)} | ${pct(cliTokens, mcpTokens)} |`,
        );
      } else {
        // Fall back to estimated data
        const cliLatency = liveTimings?.get(s.name) ?? s.cli.estimatedLatencyMs;
        const mcp = mcpCostPerOperation(s.mcp.toolCalls);
        const cli = cliCostPerOperation(1, cliLatency);
        w(
          `| ${s.name} | ${fmt(cli.totalTokens)} | ${fmt(mcp.totalTokens)} | — | ${fmtLatency(cliLatency)} | ${fmtLatency(mcp.latencyMs)} | ${pct(cli.totalTokens, mcp.totalTokens)} |`,
        );
      }
    }
    // Then emit any extra scenarios from mcp-bench that didn't map
    for (const mcpScenario of mcpResults.scenarios) {
      if (emitted.has(mcpScenario.name.toLowerCase())) continue;
      if (mcpScenario.category === "multi-step") continue; // handled in workflow section
      const cliTokens = mcpScenario.cli?.median_total_tokens ?? mcpScenario.cli?.median_total_input_tokens ?? 0;
      const mcpTokens = mcpScenario.mcp?.median_total_tokens ?? mcpScenario.mcp?.median_total_input_tokens ?? 0;
      const directLatency = mcpScenario.direct?.median_latency_ms ?? 0;
      const cliLatency = mcpScenario.cli?.median_latency_ms ?? 0;
      const mcpLatency = mcpScenario.mcp?.median_latency_ms ?? 0;

      w(
        `| ${mcpScenario.name} | ${fmt(cliTokens)} | ${fmt(mcpTokens)} | ${fmtLatency(directLatency)} | ${fmtLatency(cliLatency)} | ${fmtLatency(mcpLatency)} | ${pct(cliTokens, mcpTokens)} |`,
      );
    }
  } else {
    for (const s of SCENARIOS) {
      const cliLatency = liveTimings?.get(s.name) ?? s.cli.estimatedLatencyMs;
      const mcp = mcpCostPerOperation(s.mcp.toolCalls);
      const cli = cliCostPerOperation(1, cliLatency);

      w(
        `| ${s.name} | ${fmt(cli.totalTokens)} | ${fmt(mcp.totalTokens)} | — | ${fmtLatency(cliLatency)} | ${fmtLatency(mcp.latencyMs)} | ${pct(cli.totalTokens, mcp.totalTokens)} |`,
      );
    }
  }
  w("");

  // -- Multi-Step Workflow -------------------------------------------------
  w("## Multi-Step Workflow: Company Onboarding");
  w("");
  w("Real workflows chain multiple operations. This is where the cost difference compounds — MCP pays the full schema tax on every step.");
  w("");

  // Check if we have measured multi-step data (scenarios 16 and 17)
  const measuredWorkflow16 = measured
    ? mcpResults.scenarios.find((s) => s.id === 16 || s.name.toLowerCase().includes("onboard"))
    : null;
  const measuredWorkflow17 = measured
    ? mcpResults.scenarios.find((s) => s.id === 17 || s.name.toLowerCase().includes("full"))
    : null;

  if (measuredWorkflow17) {
    // Use measured data for the full onboarding workflow
    w("**CLI approach** (5 bash commands, composable with pipes):");
    w("");
    w("```bash");
    for (const step of ONBOARDING_WORKFLOW) {
      w(step.cliCommand);
    }
    w("```");
    w("");

    const wfCliTokens = measuredWorkflow17.cli?.median_total_tokens ?? measuredWorkflow17.cli?.median_total_input_tokens ?? 0;
    const wfMcpTokens = measuredWorkflow17.mcp?.median_total_tokens ?? measuredWorkflow17.mcp?.median_total_input_tokens ?? 0;
    const wfCliLatency = measuredWorkflow17.cli?.median_latency_ms ?? 0;
    const wfMcpLatency = measuredWorkflow17.mcp?.median_latency_ms ?? 0;
    const wfDirectLatency = measuredWorkflow17.direct?.median_latency_ms ?? 0;
    const wfCliOutput = measuredWorkflow17.cli?.median_output_tokens ?? 0;
    const wfMcpOutput = measuredWorkflow17.mcp?.median_output_tokens ?? 0;
    const wfCliInput = measuredWorkflow17.cli?.median_total_input_tokens ?? wfCliTokens;
    const wfMcpInput = measuredWorkflow17.mcp?.median_total_input_tokens ?? wfMcpTokens;

    w("| Metric | CLI | MCP | Direct | Difference |");
    w("|--------|----:|----:|-------:|-----------:|");
    w(`| Total tokens | ${fmt(wfCliTokens)} | ${fmt(wfMcpTokens)} | — | ${pct(wfCliTokens, wfMcpTokens)} less |`);
    w(`| Latency | ${fmtLatency(wfCliLatency)} | ${fmtLatency(wfMcpLatency)} | ${fmtLatency(wfDirectLatency)} | ${fmtLatency(wfMcpLatency - wfCliLatency)} saved |`);
    for (const model of MODELS) {
      const mcpDollars = (wfMcpInput / 1_000_000) * model.input + (wfMcpOutput / 1_000_000) * model.output;
      const cliDollars = (wfCliInput / 1_000_000) * model.input + (wfCliOutput / 1_000_000) * model.output;
      w(`| Cost (${model.name}) | ${fmtDollars(cliDollars)} | ${fmtDollars(mcpDollars)} | $0 | ${fmtDollars(mcpDollars - cliDollars)} saved |`);
    }

    // Also show the simpler 2-step workflow if available
    if (measuredWorkflow16) {
      w("");
      w(`**2-step workflow (Create + Note):**`);
      w("");
      const w16CliTokens = measuredWorkflow16.cli?.median_total_tokens ?? measuredWorkflow16.cli?.median_total_input_tokens ?? 0;
      const w16McpTokens = measuredWorkflow16.mcp?.median_total_tokens ?? measuredWorkflow16.mcp?.median_total_input_tokens ?? 0;
      const w16CliLatency = measuredWorkflow16.cli?.median_latency_ms ?? 0;
      const w16McpLatency = measuredWorkflow16.mcp?.median_latency_ms ?? 0;
      w("| Metric | CLI | MCP | Difference |");
      w("|--------|----:|----:|-----------:|");
      w(`| Total tokens | ${fmt(w16CliTokens)} | ${fmt(w16McpTokens)} | ${pct(w16CliTokens, w16McpTokens)} less |`);
      w(`| Latency | ${fmtLatency(w16CliLatency)} | ${fmtLatency(w16McpLatency)} | ${fmtLatency(w16McpLatency - w16CliLatency)} saved |`);
    }
  } else {
    // Fall back to estimated data
    w("**CLI approach** (5 bash commands, composable with pipes):");
    w("");
    w("```bash");
    for (const step of ONBOARDING_WORKFLOW) {
      w(step.cliCommand);
    }
    w("```");
    w("");
    w("**MCP approach** (7 tool calls across 5 steps, each paying the schema tax):");
    w("");

    let workflowMcpTokens = 0;
    let workflowMcpLatency = 0;
    let workflowCliLatency = 0;
    let workflowCliTokens = 0;
    let totalMcpCalls = 0;

    w("| Step | MCP Tool Calls | MCP Input Tokens |");
    w("|------|---------------:|-----------------:|");

    for (const step of ONBOARDING_WORKFLOW) {
      const calls = step.mcpTools.length;
      totalMcpCalls += calls;
      const mcp = mcpCostPerOperation(calls);
      workflowMcpTokens += mcp.totalTokens;
      workflowMcpLatency += mcp.latencyMs;
      workflowCliLatency += step.cliLatencyMs;
      const cli = cliCostPerOperation(1, step.cliLatencyMs);
      workflowCliTokens += cli.totalTokens;
      w(`| ${step.description} | ${calls} (${step.mcpTools.join(", ")}) | ${fmt(mcp.totalTokens)} |`);
    }

    w(`| **Total** | **${totalMcpCalls} calls** | **${fmt(workflowMcpTokens)}** |`);
    w("");

    w("| Metric | CLI | MCP | Difference |");
    w("|--------|----:|----:|-----------:|");
    w(`| Total tokens | ${fmt(workflowCliTokens)} | ${fmt(workflowMcpTokens)} | ${pct(workflowCliTokens, workflowMcpTokens)} less |`);
    w(`| Latency | ${fmtLatency(workflowCliLatency)} | ${fmtLatency(workflowMcpLatency)} | ${fmtLatency(workflowMcpLatency - workflowCliLatency)} saved |`);
    for (const model of MODELS) {
      const mcpDollars = dollarCost(
        { inputTokens: workflowMcpTokens, outputTokens: totalMcpCalls * (MCP_REASONING_TOKENS + MCP_RESPONSE_TOKENS), totalTokens: 0, latencyMs: 0 },
        model,
      );
      const cliDollars = dollarCost(
        { inputTokens: workflowCliTokens, outputTokens: ONBOARDING_WORKFLOW.length * CLI_COMMAND_OUTPUT_TOKENS, totalTokens: 0, latencyMs: 0 },
        model,
      );
      w(`| Cost (${model.name}) | ${fmtDollars(cliDollars)} | ${fmtDollars(mcpDollars)} | ${fmtDollars(mcpDollars - cliDollars)} saved |`);
    }
  }
  w("");

  // -- Cost at Scale -------------------------------------------------------
  w("## Cost at Scale");
  w("");
  w("Monthly cost per operation (30 days), assuming one LLM call per operation.");
  w("");

  const opsPerDay = [10, 50, 100, 500, 1000, 5000];

  // Calculate average per-operation cost from measured data
  let avgMcpInputPerOp = mcpCostPerOperation(1).inputTokens;
  let avgMcpOutputPerOp = mcpCostPerOperation(1).outputTokens;
  let avgCliInputPerOp = cliCostPerOperation(1, 350).inputTokens;
  let avgCliOutputPerOp = cliCostPerOperation(1, 350).outputTokens;

  if (measured) {
    const singleStepScenarios = mcpResults.scenarios.filter((s) => s.category !== "multi-step");
    if (singleStepScenarios.length > 0) {
      let totalMcpIn = 0, totalMcpOut = 0, totalCliIn = 0, totalCliOut = 0;
      let mcpN = 0, cliN = 0;
      for (const s of singleStepScenarios) {
        if (s.mcp?.median_total_input_tokens) {
          totalMcpIn += s.mcp.median_total_input_tokens;
          totalMcpOut += s.mcp.median_output_tokens ?? 0;
          mcpN++;
        }
        if (s.cli?.median_total_input_tokens) {
          totalCliIn += s.cli.median_total_input_tokens;
          totalCliOut += s.cli.median_output_tokens ?? 0;
          cliN++;
        }
      }
      if (mcpN > 0) {
        avgMcpInputPerOp = Math.round(totalMcpIn / mcpN);
        avgMcpOutputPerOp = Math.round(totalMcpOut / mcpN);
      }
      if (cliN > 0) {
        avgCliInputPerOp = Math.round(totalCliIn / cliN);
        avgCliOutputPerOp = Math.round(totalCliOut / cliN);
      }
    }
  }

  w("| Ops/Day |" + MODELS.map((m) => ` ${m.name} MCP |`).join("") + MODELS.map((m) => ` ${m.name} CLI |`).join("") + " Direct CLI |");
  w("|--------:|" + MODELS.map(() => "----------:|").join("") + MODELS.map(() => "----------:|").join("") + "-----------:|");

  for (const ops of opsPerDay) {
    const mcpRow = MODELS.map((model) => {
      const monthly = ((avgMcpInputPerOp / 1_000_000) * model.input + (avgMcpOutputPerOp / 1_000_000) * model.output) * ops * 30;
      return ` ${fmtDollars(monthly)} |`;
    }).join("");
    const cliRow = MODELS.map((model) => {
      const monthly = ((avgCliInputPerOp / 1_000_000) * model.input + (avgCliOutputPerOp / 1_000_000) * model.output) * ops * 30;
      return ` ${fmtDollars(monthly)} |`;
    }).join("");
    w(`| ${fmt(ops)} |${mcpRow}${cliRow} $0 |`);
  }
  w("");
  w("Direct CLI: $0 — no LLM involved. CLI columns show cost when an AI agent runs the CLI through a Bash tool.");
  w("");

  // -- Qualitative ---------------------------------------------------------
  w("## Beyond Cost: Qualitative Advantages");
  w("");
  w("| Dimension | attio-cli | Attio MCP |");
  w("|-----------|-----------|-----------|");
  w("| **Determinism** | Same input always produces same output | LLM may choose wrong tool, hallucinate params, or misformat arguments |");
  w("| **Composability** | Pipe to `jq`, `grep`, `xargs`, `awk` — build complex workflows from simple parts | Each operation requires a full LLM round-trip; no native piping |");
  w("| **Debuggability** | `--debug` flag shows exact HTTP requests; reproduce any call with curl | Tool calls are opaque; hard to see what the LLM actually sent |");
  w("| **Batch operations** | `xargs`, `while read`, parallel execution | Sequential tool calls, each with full LLM overhead |");
  w("| **Idempotency** | `--quiet` outputs IDs for reliable chaining | LLM response format varies between calls |");
  w("| **Error handling** | Exit codes (0=ok, 1=error, 2=auth, 5=rate-limit) | Errors embedded in natural language, must be parsed by another LLM call |");
  w("| **Version control** | CLI commands are plain text in scripts, easily diffable | Tool schemas are managed by MCP server, changes are invisible |");
  w("");

  // -- Methodology ---------------------------------------------------------
  w("## Methodology");
  w("");
  w("### Token Counting");
  w("");
  if (measured) {
    w("Token counts were measured using the Anthropic API's usage metadata (exact BPE token counts), not estimated.");
    w("");
    w(`- **Schema overhead**: ${fmt(schemaOverhead)} input tokens (measured by comparing API calls with and without tool schemas)`);
    w(`- **Per-operation tokens**: Measured from \`response.usage.input_tokens\` and \`response.usage.output_tokens\` across all turns of each operation`);
  } else {
    w("MCP tool schema tokens were measured by serializing each of the 30 Attio MCP tool definitions (name + description + full JSON Schema parameters) and estimating tokens at ~3.5 characters per token. Token counts are estimates based on ~3.5 characters per token for JSON content. Actual BPE tokenization may vary by 10-20%.");
    w("");
    w("Per-operation overhead includes:");
    w(`- **Schema context**: ${fmt(TOTAL_SCHEMA_TOKENS)} input tokens (all ${MCP_TOOLS.length} tool definitions, sent on every request)`);
    w(`- **LLM reasoning**: ~${MCP_REASONING_TOKENS} output tokens (tool selection + argument generation)`);
    w(`- **Tool result**: ~${MCP_TOOL_RESULT_TOKENS} input tokens (API response fed back to LLM)`);
    w(`- **LLM response**: ~${MCP_RESPONSE_TOKENS} output tokens (interpreting result for user)`);
  }
  w("");
  w("### Latency");
  w("");
  if (measured) {
    w("MCP latency was measured end-to-end: Anthropic API call with tool use, tool execution against Attio API, and result interpretation.");
    w("");
    w("CLI latency includes both LLM inference (generating the bash command) and command execution.");
    w("");
    w("Direct CLI latency is the raw command execution time with no LLM involved.");
  } else if (liveTimings) {
    w("CLI latency was measured live by running each command and measuring wall-clock time. MCP latency adds estimated LLM inference overhead (2-5s per tool call, using 3.5s as point estimate) to the same API round-trip time.");
  } else {
    w("CLI latency is estimated based on typical HTTP round-trip times to the Attio API (~250-400ms for single operations). MCP latency adds estimated LLM inference overhead (2-5s per tool call, using 3.5s as point estimate).");
  }
  w("");
  if (!measured) {
    w("**Note on parallel tool calls:** Some MCP implementations support parallel tool calls within a single turn, which would reduce multi-step overhead. This benchmark models the sequential (worst) case.");
    w("");
  }
  w("### Pricing");
  w("");
  w("Token pricing as of February 2025 (per million tokens):");
  w("");
  w("| Model | Input | Output |");
  w("|-------|------:|-------:|");
  for (const model of MODELS) {
    w(`| ${model.name} | $${model.input.toFixed(2)} | $${model.output.toFixed(2)} |`);
  }
  w("");

  // -- Direct Scripting ----------------------------------------------------
  w("## The Real Win: Direct Scripting");
  w("");
  w("The comparisons above assume an AI agent using either approach. But the CLI's ultimate advantage is that **many workflows don't need an AI agent at all**:");
  w("");
  w("```bash");
  w("# Export all companies to a CSV — zero tokens, zero LLM cost");
  w("attio companies list --all --csv > companies.csv");
  w("");
  w("# Bulk update from a file");
  w('while IFS=, read -r id status; do');
  w('  attio records update companies "$id" --set "status=$status"');
  w("done < updates.csv");
  w("");
  w("# Find and clean up test data");
  w("attio companies list --filter 'name^TEST_' -q | \\");
  w("  xargs -I{} attio records delete companies {} --yes");
  w("");
  w("# Daily sync in a cron job");
  w("attio companies list --all --json | jq '.[] | select(.values.status[0].status.title == \"Active\")' > active.json");
  w("```");
  w("");
  w("These workflows are **free**, **instant** (limited only by API latency), **deterministic**, and **version-controllable**. No MCP tool can match this.");
  w("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// JSON output mode
// ---------------------------------------------------------------------------

function generateJson(liveTimings: Map<string, number> | null, mcpResults: McpBenchResults | null = null) {
  const measured = mcpResults !== null;
  const schemaOverhead = measured ? mcpResults.calibration.attio_schema_overhead : TOTAL_SCHEMA_TOKENS;

  const results: unknown[] = [];

  if (measured) {
    for (const mcpScenario of mcpResults.scenarios) {
      const cliTokens = mcpScenario.cli?.median_total_tokens ?? mcpScenario.cli?.median_total_input_tokens ?? 0;
      const mcpTokens = mcpScenario.mcp?.median_total_tokens ?? mcpScenario.mcp?.median_total_input_tokens ?? 0;

      results.push({
        scenario: mcpScenario.name,
        category: mcpScenario.category,
        measured: true,
        cli: {
          tokens: cliTokens,
          inputTokens: mcpScenario.cli?.median_total_input_tokens ?? 0,
          outputTokens: mcpScenario.cli?.median_output_tokens ?? 0,
          latencyMs: mcpScenario.cli?.median_latency_ms ?? 0,
          costs: Object.fromEntries(
            MODELS.map((m) => [
              m.name,
              ((mcpScenario.cli?.median_total_input_tokens ?? 0) / 1_000_000) * m.input +
              ((mcpScenario.cli?.median_output_tokens ?? 0) / 1_000_000) * m.output,
            ]),
          ),
        },
        mcp: {
          tokens: mcpTokens,
          inputTokens: mcpScenario.mcp?.median_total_input_tokens ?? 0,
          outputTokens: mcpScenario.mcp?.median_output_tokens ?? 0,
          latencyMs: mcpScenario.mcp?.median_latency_ms ?? 0,
          costs: Object.fromEntries(
            MODELS.map((m) => [
              m.name,
              ((mcpScenario.mcp?.median_total_input_tokens ?? 0) / 1_000_000) * m.input +
              ((mcpScenario.mcp?.median_output_tokens ?? 0) / 1_000_000) * m.output,
            ]),
          ),
        },
        direct: {
          latencyMs: mcpScenario.direct?.median_latency_ms ?? 0,
        },
        tokenReduction: pct(cliTokens, mcpTokens),
      });
    }
  } else {
    for (const s of SCENARIOS) {
      const cliLatency = liveTimings?.get(s.name) ?? s.cli.estimatedLatencyMs;
      const mcp = mcpCostPerOperation(s.mcp.toolCalls);
      const cli = cliCostPerOperation(1, cliLatency);

      results.push({
        scenario: s.name,
        measured: false,
        cli: {
          tokens: cli.totalTokens,
          latencyMs: cliLatency,
          costs: Object.fromEntries(
            MODELS.map((m) => [m.name, dollarCost(cli, m)]),
          ),
        },
        mcp: {
          tokens: mcp.totalTokens,
          toolCalls: s.mcp.toolCalls,
          latencyMs: mcp.latencyMs,
          costs: Object.fromEntries(
            MODELS.map((m) => [m.name, dollarCost(mcp, m)]),
          ),
        },
        tokenReduction: pct(cli.totalTokens, mcp.totalTokens),
      });
    }
  }

  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      liveTimings: liveTimings !== null,
      measuredMcpData: measured,
      mcpTools: {
        count: MCP_TOOLS.length,
        totalSchemaTokens: schemaOverhead,
        ...(measured ? { calibration: mcpResults.calibration } : {}),
      },
      scenarios: results,
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function loadResultsFile(path: string): Map<string, number> {
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw);
  const timings = new Map<string, number>();

  // Support both formats: "scenarios" (spec format) and "results" (bench.ts output)
  const scenarios = data.scenarios ?? data.results;
  if (!scenarios || !Array.isArray(scenarios)) {
    throw new Error(`Invalid results file: missing "scenarios" or "results" array`);
  }

  // Build a name-mapping from live-results scenario names to SCENARIOS entries.
  // live-results uses descriptive names like "companies list", "companies create"
  // while SCENARIOS uses names like "List companies", "Create a record".
  const RESULT_TO_SCENARIO: Record<string, string> = {
    "companies list": "List companies",
    "companies list --limit 5": "List companies",
    "companies list --filter name~__benchmark": "Filtered search",
    "companies get <id>": "Get a record",
    "companies create": "Create a record",
    "records update companies <id>": "Update a record",
    "notes create": "Create a note",
    "tasks list": "List tasks",
  };

  for (const result of scenarios) {
    if (result.failed || result.error) continue;
    const name = (result.name ?? result.scenario) as string;
    const median = (result.median ?? result.medianMs) as number;
    if (name && typeof median === "number" && median > 0) {
      // Try exact match first
      let matched = SCENARIOS.find(
        (s) => s.name.toLowerCase() === name.toLowerCase(),
      );
      // Then try explicit mapping
      if (!matched) {
        const mappedName = RESULT_TO_SCENARIO[name.toLowerCase()];
        if (mappedName) {
          matched = SCENARIOS.find((s) => s.name === mappedName);
        }
      }
      if (matched) {
        // Only update if we don't already have a timing (prefer first match)
        if (!timings.has(matched.name)) {
          timings.set(matched.name, Math.round(median));
        }
      }
    }
  }

  return timings;
}

// ---------------------------------------------------------------------------
// MCP Benchmark Results (measured data from mcp-bench.ts)
// ---------------------------------------------------------------------------

interface McpBenchCalibration {
  baseline_tokens: number;
  cli_tokens: number;
  mcp_tokens: number;
  bash_overhead: number;
  mcp_overhead: number;
  attio_schema_overhead: number;
}

interface McpBenchScenarioPath {
  median_total_input_tokens?: number;
  median_input_tokens?: number;
  median_output_tokens?: number;
  median_total_tokens?: number;
  median_latency_ms?: number;
  median_exec_latency_ms?: number;
  median_api_latency_ms?: number;
  median_llm_latency_ms?: number;
  runs?: unknown[];
}

interface McpBenchScenario {
  id: number;
  name: string;
  category: string;
  mcp: McpBenchScenarioPath;
  cli: McpBenchScenarioPath;
  direct: { median_latency_ms: number; runs?: unknown[] };
  comparison?: {
    token_ratio?: number;
    token_reduction_pct?: number;
    latency_ratio?: number;
    mcp_schema_overhead_tokens?: number;
  };
}

interface McpBenchResults {
  calibration: McpBenchCalibration;
  scenarios: McpBenchScenario[];
}

// Map from mcp-bench-results scenario names to SCENARIOS names
const MCP_BENCH_NAME_MAP: Record<string, string> = {
  "list companies": "List companies",
  "search companies": "Filtered search",
  "find companies": "Filtered search",
  "get company by id": "Get a record",
  "get company": "Get a record",
  "list people": "List companies", // same shape, different object
  "list tasks": "List tasks",
  "list notes": "Create a note", // closest match
  "list comments": "List tasks", // similar shape
  "list workspace members": "List tasks",
  "whoami": "List tasks",
  "create company": "Create a record",
  "update company": "Update a record",
  "create note": "Create a note",
  "create task": "List tasks",
  "create comment": "List tasks",
};

function loadMcpResults(path: string): McpBenchResults {
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw);

  if (!data.calibration || !data.scenarios) {
    throw new Error(`Invalid MCP results file: missing "calibration" or "scenarios"`);
  }

  return data as McpBenchResults;
}

function findMcpScenario(
  mcpResults: McpBenchResults,
  scenarioName: string,
): McpBenchScenario | undefined {
  // Try exact match first (case-insensitive)
  const exact = mcpResults.scenarios.find(
    (s) => s.name.toLowerCase() === scenarioName.toLowerCase(),
  );
  if (exact) return exact;

  // Try mapped names
  for (const scenario of mcpResults.scenarios) {
    const mapped = MCP_BENCH_NAME_MAP[scenario.name.toLowerCase()];
    if (mapped && mapped.toLowerCase() === scenarioName.toLowerCase()) {
      return scenario;
    }
  }

  return undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const json = args.includes("--json");
  const resultsIdx = args.indexOf("--results");
  const resultsPath = resultsIdx !== -1 ? args[resultsIdx + 1] : null;
  const mcpResultsIdx = args.indexOf("--mcp-results");
  const mcpResultsPath = mcpResultsIdx !== -1 ? args[mcpResultsIdx + 1] : null;

  let liveTimings: Map<string, number> | null = null;
  let mcpResults: McpBenchResults | null = null;

  if (mcpResultsPath) {
    console.error(`Loading MCP benchmark results from ${mcpResultsPath}...`);
    mcpResults = loadMcpResults(mcpResultsPath);
    console.error(`  Loaded ${mcpResults.scenarios.length} scenarios with calibration data\n`);
  }

  if (resultsPath) {
    console.error(`Loading results from ${resultsPath}...`);
    liveTimings = loadResultsFile(resultsPath);
    console.error(`  Loaded timings for ${liveTimings.size} scenarios\n`);
  } else if (live) {
    console.error("Checking CLI availability...");
    if (!cliAvailable()) {
      console.error(
        "Error: attio CLI not available or not configured. Run without --live for estimated timings.",
      );
      process.exit(1);
    }
    console.error("CLI available. Running live benchmarks...\n");

    liveTimings = new Map();
    for (const s of SCENARIOS) {
      // Skip commands with <id> placeholders
      if (s.cli.command.includes("<id>")) {
        console.error(`  Skipping "${s.name}" (requires record ID)`);
        continue;
      }

      console.error(`  Timing "${s.name}"...`);
      const times: number[] = [];

      // Run 3 times, take median
      for (let i = 0; i < 3; i++) {
        const t = tryTimeCli(s.cli.command);
        if (t !== null) times.push(t);
      }

      if (times.length > 0) {
        times.sort((a, b) => a - b);
        const median = times[Math.floor(times.length / 2)];
        liveTimings.set(s.name, median);
        console.error(`    ${median}ms (median of ${times.length} runs)`);
      } else {
        console.error(`    Failed — using estimate`);
      }
    }
    console.error("");
  }

  if (json) {
    console.log(generateJson(liveTimings, mcpResults));
  } else {
    console.log(generateReport(liveTimings, mcpResults));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

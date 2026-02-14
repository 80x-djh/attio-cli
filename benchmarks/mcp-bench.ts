#!/usr/bin/env npx tsx

/**
 * MCP vs CLI Benchmark Suite
 *
 * Compares three paths for Attio CRM operations:
 * 1. MCP path: claude -p with Attio MCP tools
 * 2. CLI path: claude -p with Bash tool + attio CLI
 * 3. Direct path: attio CLI directly (no LLM)
 *
 * Uses `claude -p` in pipe mode (no Anthropic API key needed).
 * Run: npx tsx benchmarks/mcp-bench.ts
 */

import { execSync, execFileSync } from "child_process";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CLAUDE_BIN = "/Users/daniel/.local/bin/claude";
const ATTIO_BIN = join("/Users/daniel/attio-cli", "bin", "attio.ts");
const TEST_MODE = process.argv.includes("--test");
const RUNS_PER_SCENARIO = TEST_MODE ? 2 : 5;
const DELAY_MS = 200;
const TIMEOUT_MS = 120_000;
const RESULTS_PATH = join("/Users/daniel/attio-cli/benchmarks", "mcp-bench-results.json");

const SYSTEM_PROMPT_BASE =
  "You are a CRM automation assistant. When asked to perform operations on Attio, execute them immediately using the available tools. Return results as JSON. Do not ask for confirmation — just execute the operation.";
const SYSTEM_PROMPT_CLI =
  `${SYSTEM_PROMPT_BASE} Use the bash tool to run attio-cli commands. The CLI is installed at: node --import=tsx /Users/daniel/attio-cli/bin/attio.ts. Always pass --json and --no-color flags.`;

const MCP_CONFIG = JSON.stringify({
  mcpServers: {
    attio: {
      command: "npx",
      args: ["-y", "mcp-remote", "https://mcp.attio.com/mcp"],
    },
  },
});

// Calibration data (provided by team lead)
const CALIBRATION = {
  baseline_tokens: 530,
  cli_tokens: 4204,
  mcp_tokens: 18725,
  bash_overhead: 3674,
  mcp_overhead: 18195,
  attio_schema_overhead: 14521,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg: string): void {
  process.stderr.write(msg + "\n");
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Run attio CLI directly, return { stdout, durationMs } */
function runAttioDirect(args: string[]): { stdout: string; durationMs: number } {
  const fullArgs = ["--import=tsx", ATTIO_BIN, ...args, "--no-color", "--json"];
  const start = performance.now();
  try {
    const buf = execFileSync("node", fullArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
      encoding: "utf-8",
    });
    return { stdout: (buf ?? "").toString().trim(), durationMs: performance.now() - start };
  } catch (err: any) {
    const durationMs = performance.now() - start;
    const stdout = err.stdout?.toString?.()?.trim?.() ?? "";
    throw Object.assign(new Error(`attio ${args.join(" ")} failed: ${err.message}`), {
      stdout,
      durationMs,
    });
  }
}

function attioCreateAndGetId(args: string[]): string {
  const { stdout } = runAttioDirect(args);
  const parsed = JSON.parse(stdout);
  const id = parsed?.id;
  if (!id) throw new Error("No id in response");
  return id.record_id ?? id.note_id ?? id.task_id ?? id.comment_id ?? (typeof id === "string" ? id : JSON.stringify(id));
}

interface ClaudeResult {
  success: boolean;
  input_tokens: number;
  output_tokens: number;
  total_input_tokens: number;
  latency_ms: number;
  num_turns: number;
  cost_usd: number;
  result_text: string;
  error?: string;
}

/** Run claude -p for MCP path */
function runClaudeMcp(prompt: string): ClaudeResult {
  const args = [
    CLAUDE_BIN,
    "-p",
    "--output-format", "json",
    "--model", "sonnet",
    "--no-session-persistence",
    "--dangerously-skip-permissions",
    "--strict-mcp-config",
    "--mcp-config", MCP_CONFIG,
    "--tools", "",
    "--system-prompt", SYSTEM_PROMPT_BASE,
    prompt,
  ];

  const start = performance.now();
  try {
    const output = execFileSync(args[0], args.slice(1), {
      encoding: "utf-8",
      timeout: TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CLAUDECODE: "" },
      cwd: "/tmp",
    });
    const latency_ms = performance.now() - start;
    const parsed = JSON.parse(output.trim());
    const sonnet = parsed.modelUsage?.["claude-sonnet-4-5-20250929"] ?? {};

    return {
      success: !parsed.is_error,
      input_tokens: sonnet.inputTokens ?? 0,
      output_tokens: sonnet.outputTokens ?? 0,
      total_input_tokens:
        (sonnet.inputTokens ?? 0) +
        (sonnet.cacheCreationInputTokens ?? 0) +
        (sonnet.cacheReadInputTokens ?? 0),
      latency_ms,
      num_turns: parsed.num_turns ?? 0,
      cost_usd: sonnet.costUSD ?? 0,
      result_text: parsed.result ?? "",
    };
  } catch (err: any) {
    return {
      success: false,
      input_tokens: 0,
      output_tokens: 0,
      total_input_tokens: 0,
      latency_ms: performance.now() - start,
      num_turns: 0,
      cost_usd: 0,
      result_text: "",
      error: err.message?.slice(0, 500),
    };
  }
}

/** Run claude -p for CLI path */
function runClaudeCli(prompt: string): ClaudeResult {
  const args = [
    CLAUDE_BIN,
    "-p",
    "--output-format", "json",
    "--model", "sonnet",
    "--no-session-persistence",
    "--dangerously-skip-permissions",
    "--strict-mcp-config",
    "--tools", "Bash",
    "--system-prompt", SYSTEM_PROMPT_CLI,
    prompt,
  ];

  const start = performance.now();
  try {
    const output = execFileSync(args[0], args.slice(1), {
      encoding: "utf-8",
      timeout: TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CLAUDECODE: "" },
      cwd: "/tmp",
    });
    const latency_ms = performance.now() - start;
    const parsed = JSON.parse(output.trim());
    const sonnet = parsed.modelUsage?.["claude-sonnet-4-5-20250929"] ?? {};

    return {
      success: !parsed.is_error,
      input_tokens: sonnet.inputTokens ?? 0,
      output_tokens: sonnet.outputTokens ?? 0,
      total_input_tokens:
        (sonnet.inputTokens ?? 0) +
        (sonnet.cacheCreationInputTokens ?? 0) +
        (sonnet.cacheReadInputTokens ?? 0),
      latency_ms,
      num_turns: parsed.num_turns ?? 0,
      cost_usd: sonnet.costUSD ?? 0,
      result_text: parsed.result ?? "",
    };
  } catch (err: any) {
    return {
      success: false,
      input_tokens: 0,
      output_tokens: 0,
      total_input_tokens: 0,
      latency_ms: performance.now() - start,
      num_turns: 0,
      cost_usd: 0,
      result_text: "",
      error: err.message?.slice(0, 500),
    };
  }
}

/** Run attio CLI directly, return { latency_ms, success } */
function runDirect(args: string[]): { latency_ms: number; success: boolean; error?: string } {
  try {
    const { durationMs } = runAttioDirect(args);
    return { latency_ms: durationMs, success: true };
  } catch (err: any) {
    return { latency_ms: err.durationMs ?? 0, success: false, error: err.message?.slice(0, 200) };
  }
}

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

interface Scenario {
  id: number;
  name: string;
  category: "read" | "write" | "multi-step";
  prompt: string;
  directArgs?: string[];  // attio CLI args for direct path
  cleanup?: (resultText: string) => Promise<void>;
  dynamicPrompt?: boolean; // if true, prompt is regenerated per run
  getPrompt?: (runIndex: number) => string;
  getDirectArgs?: (runIndex: number) => string[];
}

// ---------------------------------------------------------------------------
// Test data setup & cleanup
// ---------------------------------------------------------------------------

interface TestData {
  companyId: string;
  personId: string;
  noteId: string;
  taskId: string;
  commentId: string;
}

async function setupTestData(): Promise<TestData> {
  log("=== SETUP: Creating test data ===");

  log("  Creating company: __MCP_BENCH_COMPANY__");
  const companyId = attioCreateAndGetId(["companies", "create", "--set", "name=__MCP_BENCH_COMPANY__"]);
  log(`    -> ${companyId}`);
  await sleep(DELAY_MS);

  log("  Creating person: __MCP_BENCH_PERSON__");
  const personId = attioCreateAndGetId([
    "people", "create",
    "--values", JSON.stringify({ email_addresses: ["__mcp_bench_person__@example.com"] }),
  ]);
  log(`    -> ${personId}`);
  await sleep(DELAY_MS);

  log("  Creating note on company");
  const noteId = attioCreateAndGetId([
    "notes", "create",
    "--object", "companies",
    "--record", companyId,
    "--title", "MCP Bench Note",
    "--content", "Benchmark test note content",
  ]);
  log(`    -> ${noteId}`);
  await sleep(DELAY_MS);

  log("  Creating task");
  const taskId = attioCreateAndGetId([
    "tasks", "create",
    "--content", "MCP Bench Task",
  ]);
  log(`    -> ${taskId}`);
  await sleep(DELAY_MS);

  log("  Creating comment on company");
  const commentId = attioCreateAndGetId([
    "comments", "create",
    "--object", "companies",
    "--record", companyId,
    "--content", "MCP Bench Comment",
  ]);
  log(`    -> ${commentId}`);
  await sleep(DELAY_MS);

  log(`  Test data created: company=${companyId} person=${personId} note=${noteId} task=${taskId} comment=${commentId}`);
  return { companyId, personId, noteId, taskId, commentId };
}

async function cleanupTestData(data: TestData, extraIds: Array<{ type: string; id: string }>): Promise<void> {
  log("\n=== CLEANUP ===");

  // Clean extras - deduplicate by id+type
  const seen = new Set<string>();
  for (const item of extraIds) {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      if (item.type === "comment") runAttioDirect(["comments", "delete", item.id, "--yes"]);
      else if (item.type === "note") runAttioDirect(["notes", "delete", item.id, "--yes"]);
      else if (item.type === "task") runAttioDirect(["tasks", "delete", item.id, "--yes"]);
      else if (item.type === "company") runAttioDirect(["records", "delete", "companies", item.id, "--yes"]);
      else if (item.type === "person") runAttioDirect(["records", "delete", "people", item.id, "--yes"]);
      log(`  Deleted extra ${item.type}: ${item.id}`);
    } catch {
      // Silently ignore - many of these will fail since we try each UUID as multiple types
    }
    await sleep(50);
  }

  // Clean test data
  const items = [
    { args: ["comments", "delete", data.commentId, "--yes"], label: "comment", id: data.commentId },
    { args: ["notes", "delete", data.noteId, "--yes"], label: "note", id: data.noteId },
    { args: ["tasks", "delete", data.taskId, "--yes"], label: "task", id: data.taskId },
    { args: ["records", "delete", "people", data.personId, "--yes"], label: "person", id: data.personId },
    { args: ["records", "delete", "companies", data.companyId, "--yes"], label: "company", id: data.companyId },
  ];

  for (const item of items) {
    try {
      runAttioDirect(item.args);
      log(`  Deleted ${item.label}: ${item.id}`);
    } catch {
      log(`  WARNING: failed to delete ${item.label}: ${item.id}`);
    }
    await sleep(100);
  }

  log("  Cleanup done.");
}

/** Try to extract created resource IDs from claude's response text for cleanup */
function extractIdsFromResult(text: string): string[] {
  const ids: string[] = [];
  // Match UUIDs in the text
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const matches = text.match(uuidRegex);
  if (matches) ids.push(...matches);
  return [...new Set(ids)];
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

interface RunResult {
  input_tokens: number;
  output_tokens: number;
  total_input_tokens: number;
  latency_ms: number;
  num_turns: number;
  success: boolean;
  cost_usd: number;
  error?: string;
}

interface DirectRunResult {
  latency_ms: number;
  success: boolean;
  error?: string;
}

interface ScenarioResult {
  id: number;
  name: string;
  category: string;
  prompt: string;
  mcp: {
    runs: RunResult[];
    median_input_tokens: number;
    median_output_tokens: number;
    median_total_input_tokens: number;
    median_latency_ms: number;
    median_cost_usd: number;
  };
  cli: {
    runs: RunResult[];
    median_input_tokens: number;
    median_output_tokens: number;
    median_total_input_tokens: number;
    median_latency_ms: number;
    median_cost_usd: number;
  };
  direct: {
    runs: DirectRunResult[];
    median_latency_ms: number;
  };
}

async function runScenario(
  scenario: Scenario,
  scenarioIndex: number,
  totalScenarios: number,
  extraCleanupIds: Array<{ type: string; id: string }>,
): Promise<ScenarioResult> {
  const mcpRuns: RunResult[] = [];
  const cliRuns: RunResult[] = [];
  const directRuns: DirectRunResult[] = [];

  // --- MCP Path ---
  for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
    log(`Scenario ${scenarioIndex}/${totalScenarios}: ${scenario.name} [MCP run ${i + 1}/${RUNS_PER_SCENARIO}]...`);
    const prompt = scenario.getPrompt ? scenario.getPrompt(i) : scenario.prompt;
    const result = runClaudeMcp(prompt);
    mcpRuns.push({
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
      total_input_tokens: result.total_input_tokens,
      latency_ms: Math.round(result.latency_ms),
      num_turns: result.num_turns,
      success: result.success,
      cost_usd: result.cost_usd,
      ...(result.error ? { error: result.error } : {}),
    });

    // Cleanup write ops
    if (scenario.category === "write" || scenario.category === "multi-step") {
      const ids = extractIdsFromResult(result.result_text);
      for (const id of ids) {
        // Try cleaning up as different types
        for (const type of ["company", "note", "task", "comment"] as const) {
          extraCleanupIds.push({ type, id });
        }
      }
    }
    await sleep(DELAY_MS);
  }

  // --- CLI Path ---
  for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
    log(`Scenario ${scenarioIndex}/${totalScenarios}: ${scenario.name} [CLI run ${i + 1}/${RUNS_PER_SCENARIO}]...`);
    const prompt = scenario.getPrompt ? scenario.getPrompt(i) : scenario.prompt;
    const result = runClaudeCli(prompt);
    cliRuns.push({
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
      total_input_tokens: result.total_input_tokens,
      latency_ms: Math.round(result.latency_ms),
      num_turns: result.num_turns,
      success: result.success,
      cost_usd: result.cost_usd,
      ...(result.error ? { error: result.error } : {}),
    });

    if (scenario.category === "write" || scenario.category === "multi-step") {
      const ids = extractIdsFromResult(result.result_text);
      for (const id of ids) {
        for (const type of ["company", "note", "task", "comment"] as const) {
          extraCleanupIds.push({ type, id });
        }
      }
    }
    await sleep(DELAY_MS);
  }

  // --- Direct Path ---
  if (scenario.directArgs) {
    for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
      log(`Scenario ${scenarioIndex}/${totalScenarios}: ${scenario.name} [Direct run ${i + 1}/${RUNS_PER_SCENARIO}]...`);
      const args = scenario.getDirectArgs ? scenario.getDirectArgs(i) : scenario.directArgs;
      try {
        const { stdout, durationMs } = runAttioDirect(args);
        directRuns.push({ latency_ms: Math.round(durationMs), success: true });

        // Cleanup direct write results
        if (scenario.category === "write") {
          try {
            const parsed = JSON.parse(stdout);
            const id = parsed?.id;
            const rid = id?.record_id ?? id?.note_id ?? id?.task_id ?? id?.comment_id;
            if (rid) {
              extraCleanupIds.push({ type: "company", id: rid });
              extraCleanupIds.push({ type: "note", id: rid });
              extraCleanupIds.push({ type: "task", id: rid });
              extraCleanupIds.push({ type: "comment", id: rid });
            }
          } catch { /* best effort */ }
        }
      } catch (err: any) {
        directRuns.push({
          latency_ms: Math.round(err.durationMs ?? 0),
          success: false,
          error: err.message?.slice(0, 200),
        });
      }
      await sleep(DELAY_MS);
    }
  }

  // Calculate medians (discard first run = warmup, median of runs 2-5)
  const mcpTimed = mcpRuns.slice(1).filter(r => r.success);
  const cliTimed = cliRuns.slice(1).filter(r => r.success);
  const directTimed = directRuns.slice(1).filter(r => r.success);

  return {
    id: scenario.id,
    name: scenario.name,
    category: scenario.category,
    prompt: scenario.prompt,
    mcp: {
      runs: mcpRuns,
      median_input_tokens: mcpTimed.length > 0 ? Math.round(median(mcpTimed.map(r => r.input_tokens))) : 0,
      median_output_tokens: mcpTimed.length > 0 ? Math.round(median(mcpTimed.map(r => r.output_tokens))) : 0,
      median_total_input_tokens: mcpTimed.length > 0 ? Math.round(median(mcpTimed.map(r => r.total_input_tokens))) : 0,
      median_latency_ms: mcpTimed.length > 0 ? Math.round(median(mcpTimed.map(r => r.latency_ms))) : 0,
      median_cost_usd: mcpTimed.length > 0 ? median(mcpTimed.map(r => r.cost_usd)) : 0,
    },
    cli: {
      runs: cliRuns,
      median_input_tokens: cliTimed.length > 0 ? Math.round(median(cliTimed.map(r => r.input_tokens))) : 0,
      median_output_tokens: cliTimed.length > 0 ? Math.round(median(cliTimed.map(r => r.output_tokens))) : 0,
      median_total_input_tokens: cliTimed.length > 0 ? Math.round(median(cliTimed.map(r => r.total_input_tokens))) : 0,
      median_latency_ms: cliTimed.length > 0 ? Math.round(median(cliTimed.map(r => r.latency_ms))) : 0,
      median_cost_usd: cliTimed.length > 0 ? median(cliTimed.map(r => r.cost_usd)) : 0,
    },
    direct: {
      runs: directRuns,
      median_latency_ms: directTimed.length > 0 ? Math.round(median(directTimed.map(r => r.latency_ms))) : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log("============================================================");
  log("  MCP vs CLI Benchmark Suite");
  log("============================================================");
  log(`  Date: ${new Date().toISOString()}`);
  log(`  Runs per scenario: ${RUNS_PER_SCENARIO} (1 warmup + ${RUNS_PER_SCENARIO - 1} timed)`);

  // Setup test data
  const testData = await setupTestData();
  const extraCleanupIds: Array<{ type: string; id: string }> = [];

  // Build scenario list
  const scenarios: Scenario[] = [
    // ---- Read Operations (10) ----
    {
      id: 1,
      name: "List companies",
      category: "read",
      prompt: "List the first 10 companies in my Attio workspace. Return JSON.",
      directArgs: ["companies", "list", "--limit", "10"],
    },
    {
      id: 2,
      name: "Search companies by name",
      category: "read",
      prompt: "Find companies whose name contains 'Benchmark'. Return JSON.",
      directArgs: ["companies", "list", "--filter", "name~Benchmark"],
    },
    {
      id: 3,
      name: "Get company by ID",
      category: "read",
      prompt: `Get the company with ID ${testData.companyId}. Return JSON.`,
      directArgs: ["companies", "get", testData.companyId],
    },
    {
      id: 4,
      name: "List people",
      category: "read",
      prompt: "List all people in my Attio workspace, limit 10. Return JSON.",
      directArgs: ["people", "list", "--limit", "10"],
    },
    {
      id: 5,
      name: "List tasks",
      category: "read",
      prompt: "List all tasks. Return JSON.",
      directArgs: ["tasks", "list"],
    },
    {
      id: 6,
      name: "List notes on company",
      category: "read",
      prompt: `List notes on company ${testData.companyId}. Return JSON.`,
      directArgs: ["notes", "list", "--object", "companies", "--record", testData.companyId],
    },
    {
      id: 7,
      name: "List comments on company",
      category: "read",
      prompt: `List comments on company ${testData.companyId}. Return JSON.`,
      directArgs: ["comments", "list", "--object", "companies", "--record", testData.companyId],
    },
    {
      id: 8,
      name: "List workspace members",
      category: "read",
      prompt: "List all workspace members. Return JSON.",
      directArgs: ["members", "list"],
    },
    {
      id: 9,
      name: "Show workspace identity",
      category: "read",
      prompt: "Show my current Attio identity. Return JSON.",
      directArgs: ["whoami"],
    },
    {
      id: 10,
      name: "List attribute definitions",
      category: "read",
      prompt: "List all attribute definitions for companies. Return JSON.",
      directArgs: ["attributes", "list", "companies"],
    },

    // ---- Write Operations (5) ----
    {
      id: 11,
      name: "Create a company",
      category: "write",
      prompt: "Create a company named '__MCP_BENCH_WRITE__'. Return JSON.",
      directArgs: ["companies", "create", "--set", "name=__MCP_BENCH_WRITE__"],
      getPrompt: (i) => `Create a company named '__MCP_BENCH_WRITE_${i}_${Date.now()}__'. Return JSON.`,
      getDirectArgs: (i) => ["companies", "create", "--set", `name=__MCP_BENCH_WRITE_${i}_${Date.now()}`],
    },
    {
      id: 12,
      name: "Update company name",
      category: "write",
      prompt: `Update company ${testData.companyId}, set the name to '__MCP_BENCH_UPDATED__'. Return JSON.`,
      directArgs: ["records", "update", "companies", testData.companyId, "--set", "name=__MCP_BENCH_UPDATED__"],
    },
    {
      id: 13,
      name: "Create a note on company",
      category: "write",
      prompt: `Create a note on company ${testData.companyId} with title 'Bench' and content 'test'. Return JSON.`,
      directArgs: [
        "notes", "create",
        "--object", "companies",
        "--record", testData.companyId,
        "--title", "Bench",
        "--content", "test",
      ],
    },
    {
      id: 14,
      name: "Create a task",
      category: "write",
      prompt: "Create a task with content 'Bench write test'. Return JSON.",
      directArgs: ["tasks", "create", "--content", "Bench write test"],
    },
    {
      id: 15,
      name: "Create a comment on company",
      category: "write",
      prompt: `Create a comment on company ${testData.companyId} with content 'Bench write test'. Return JSON.`,
      directArgs: [
        "comments", "create",
        "--object", "companies",
        "--record", testData.companyId,
        "--content", "Bench write test",
      ],
    },

    // ---- Multi-step Operations (2) ----
    {
      id: 16,
      name: "Create company + add note",
      category: "multi-step",
      prompt: "Create a company named '__MCP_BENCH_ONBOARD__', then add a note titled 'Welcome' with content 'New customer'. Return the company ID and note ID as JSON.",
      getPrompt: (i) =>
        `Create a company named '__MCP_BENCH_ONBOARD_${i}_${Date.now()}__', then add a note titled 'Welcome' with content 'New customer'. Return the company ID and note ID as JSON.`,
    },
    {
      id: 17,
      name: "Create company + note + task + comment",
      category: "multi-step",
      prompt: "Create a company named '__MCP_BENCH_FULL__', add a note titled 'Onboarding', create a follow-up task 'Schedule kickoff', and add a comment 'Welcome aboard'. Return all IDs as JSON.",
      getPrompt: (i) =>
        `Create a company named '__MCP_BENCH_FULL_${i}_${Date.now()}__', add a note titled 'Onboarding', create a follow-up task 'Schedule kickoff', and add a comment 'Welcome aboard'. Return all IDs as JSON.`,
    },
  ];

  // For multi-step, the direct path runs each command sequentially
  // We'll handle that specially when needed - no directArgs for multi-step

  const scenariosToRun = TEST_MODE ? scenarios.slice(0, 1) : scenarios;
  log(`\n=== RUNNING ${scenariosToRun.length} SCENARIOS${TEST_MODE ? " (TEST MODE)" : ""} ===\n`);

  const results: ScenarioResult[] = [];

  for (let i = 0; i < scenariosToRun.length; i++) {
    const scenario = scenariosToRun[i];
    try {
      const result = await runScenario(scenario, i + 1, scenariosToRun.length, extraCleanupIds);
      results.push(result);

      // Intermediate save after each scenario
      const partial = buildOutput(results);
      writeFileSync(RESULTS_PATH, JSON.stringify(partial, null, 2));
      log(`  -> Saved partial results (${results.length}/${scenarios.length})`);
    } catch (err: any) {
      log(`  SCENARIO ${scenario.id} ERROR: ${err.message}`);
      results.push({
        id: scenario.id,
        name: scenario.name,
        category: scenario.category,
        prompt: scenario.prompt,
        mcp: { runs: [], median_input_tokens: 0, median_output_tokens: 0, median_total_input_tokens: 0, median_latency_ms: 0, median_cost_usd: 0 },
        cli: { runs: [], median_input_tokens: 0, median_output_tokens: 0, median_total_input_tokens: 0, median_latency_ms: 0, median_cost_usd: 0 },
        direct: { runs: [], median_latency_ms: 0 },
      });
    }
  }

  // Cleanup
  await cleanupTestData(testData, extraCleanupIds);

  // Final save
  const output = buildOutput(results);
  writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2));

  log("\n============================================================");
  log("  BENCHMARK COMPLETE");
  log(`  Results: ${RESULTS_PATH}`);
  log(`  Scenarios: ${results.length}`);
  log("============================================================\n");
}

function buildOutput(results: ScenarioResult[]) {
  return {
    timestamp: new Date().toISOString(),
    model: "claude-sonnet-4-5-20250929",
    environment: {
      os: process.platform,
      node: process.version,
      runsPerScenario: RUNS_PER_SCENARIO,
      warmupRuns: 1,
    },
    calibration: CALIBRATION,
    scenarios: results,
  };
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});

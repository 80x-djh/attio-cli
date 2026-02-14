#!/usr/bin/env npx tsx

/**
 * Live benchmark suite for attio-cli.
 *
 * Creates test data in Attio, times every scenario (5 runs each, discard
 * first warm-up, median of last 4), cleans up, and writes results to
 * benchmarks/live-results.json.
 *
 * Run: npx tsx benchmarks/bench.ts
 */

import { execFileSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ATTIO = join(import.meta.dirname, "..", "bin", "attio.ts");
const RUNS_PER_SCENARIO = 5;
const DELAY_BETWEEN_RUNS_MS = 150; // rate-limit safety
const RESULTS_PATH = join(import.meta.dirname, "live-results.json");

// Prefixes for test data
const BENCH_COMPANY = "__BENCHMARK_Company";
const BENCH_NOTE_TITLE = "__BENCH_Note";
const BENCH_TASK_CONTENT = "__BENCH_Task";
const BENCH_COMMENT = "__BENCH_Comment";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Run the attio CLI and return { stdout, durationMs }. Throws on non-zero exit. */
function runAttio(
  args: string[],
): { stdout: string; durationMs: number } {
  const fullArgs = ["--import=tsx", ATTIO, ...args, "--no-color", "--json"];
  const start = performance.now();
  try {
    const buf = execFileSync("node", fullArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
      encoding: "utf-8",
    });
    const durationMs = performance.now() - start;
    return { stdout: (buf ?? "").toString().trim(), durationMs };
  } catch (err: any) {
    const durationMs = performance.now() - start;
    const stdout = err.stdout?.toString?.()?.trim?.() ?? "";
    throw Object.assign(new Error(`attio ${args.join(" ")} failed: ${err.message}`), {
      stdout,
      durationMs,
    });
  }
}

/** Run attio CLI, return stdout string. */
function attio(args: string[]): string {
  return runAttio(args).stdout;
}

/**
 * Run attio CLI with --json and extract the appropriate ID from the response.
 * Handles different ID shapes: records (id.record_id), notes (id.note_id),
 * tasks (id.task_id), comments (id.comment_id).
 */
function attioCreateAndGetId(args: string[]): string {
  const stdout = attio(args);
  const parsed = JSON.parse(stdout);
  const id = parsed?.id;
  if (!id) throw new Error("No id in response");
  // Try each known ID field
  return id.record_id ?? id.note_id ?? id.task_id ?? id.comment_id ?? (typeof id === "string" ? id : JSON.stringify(id));
}

/** Median of sorted array */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

// ---------------------------------------------------------------------------
// Scenario timing
// ---------------------------------------------------------------------------

interface ScenarioResult {
  scenario: string;
  category: "read" | "write" | "compound";
  medianMs: number;
  runs: number[];
  warmupMs: number;
  error?: string;
}

async function timeScenario(
  name: string,
  category: "read" | "write" | "compound",
  fn: () => number,
): Promise<ScenarioResult> {
  console.log(`  [${category}] ${name}`);
  const allRuns: number[] = [];
  let warmupMs = 0;

  for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
    try {
      const ms = fn();
      if (i === 0) {
        warmupMs = ms;
      }
      allRuns.push(ms);
    } catch (err: any) {
      console.log(`    run ${i + 1} FAILED: ${err.message}`);
      allRuns.push(-1);
    }
    await sleep(DELAY_BETWEEN_RUNS_MS);
  }

  // Discard first run (warmup), median of last 4
  const timedRuns = allRuns.slice(1).filter((r) => r >= 0);
  const med = timedRuns.length > 0 ? median(timedRuns) : -1;

  const tag = med >= 0 ? `${med.toFixed(0)}ms` : "FAILED";
  console.log(`    -> median: ${tag}  (runs: ${allRuns.map((r) => r >= 0 ? r.toFixed(0) : "ERR").join(", ")})`);

  return {
    scenario: name,
    category,
    medianMs: Math.round(med * 100) / 100,
    runs: allRuns.map((r) => Math.round(r * 100) / 100),
    warmupMs: Math.round(warmupMs * 100) / 100,
    ...(med < 0 ? { error: "one or more runs failed" } : {}),
  };
}

// ---------------------------------------------------------------------------
// Setup: Create test data
// ---------------------------------------------------------------------------

interface TestData {
  companyIds: string[];
  personIds: string[];
  noteIds: string[];
  taskIds: string[];
  commentIds: string[];
}

async function setup(): Promise<TestData> {
  console.log("\n=== SETUP: Creating test data ===\n");

  const data: TestData = {
    companyIds: [],
    personIds: [],
    noteIds: [],
    taskIds: [],
    commentIds: [],
  };

  // Create 3 companies
  for (let i = 1; i <= 3; i++) {
    const name = `${BENCH_COMPANY}_${i}_${Date.now()}`;
    console.log(`  Creating company: ${name}`);
    try {
      const id = attioCreateAndGetId(["companies", "create", "--set", `name=${name}`]);
      data.companyIds.push(id);
      console.log(`    -> ${id}`);
    } catch (err: any) {
      console.log(`    FAILED: ${err.message}`);
    }
    await sleep(DELAY_BETWEEN_RUNS_MS);
  }

  // Create 3 people (email_addresses is multi-select, must use --values JSON)
  for (let i = 1; i <= 3; i++) {
    const email = `__benchmark_person_${i}_${Date.now()}@example.com`;
    console.log(`  Creating person: ${email}`);
    try {
      const id = attioCreateAndGetId([
        "people", "create",
        "--values", JSON.stringify({ email_addresses: [email] }),
      ]);
      data.personIds.push(id);
      console.log(`    -> ${id}`);
    } catch (err: any) {
      console.log(`    FAILED: ${err.message}`);
    }
    await sleep(DELAY_BETWEEN_RUNS_MS);
  }

  // Create notes (attached to first company)
  if (data.companyIds.length > 0) {
    for (let i = 1; i <= 2; i++) {
      const title = `${BENCH_NOTE_TITLE}_${i}_${Date.now()}`;
      console.log(`  Creating note: ${title}`);
      try {
        const id = attioCreateAndGetId([
          "notes", "create",
          "--object", "companies",
          "--record", data.companyIds[0],
          "--title", title,
          "--content", `Benchmark note content ${i}`,
        ]);
        data.noteIds.push(id);
        console.log(`    -> ${id}`);
      } catch (err: any) {
        console.log(`    FAILED: ${err.message}`);
      }
      await sleep(DELAY_BETWEEN_RUNS_MS);
    }
  }

  // Create tasks
  for (let i = 1; i <= 2; i++) {
    const content = `${BENCH_TASK_CONTENT}_${i}_${Date.now()}`;
    console.log(`  Creating task: ${content}`);
    try {
      const id = attioCreateAndGetId(["tasks", "create", "--content", content]);
      data.taskIds.push(id);
      console.log(`    -> ${id}`);
    } catch (err: any) {
      console.log(`    FAILED: ${err.message}`);
    }
    await sleep(DELAY_BETWEEN_RUNS_MS);
  }

  // Create comments (on first company)
  if (data.companyIds.length > 0) {
    for (let i = 1; i <= 2; i++) {
      const content = `${BENCH_COMMENT}_${i}_${Date.now()}`;
      console.log(`  Creating comment: ${content}`);
      try {
        const id = attioCreateAndGetId([
          "comments", "create",
          "--object", "companies",
          "--record", data.companyIds[0],
          "--content", content,
        ]);
        data.commentIds.push(id);
        console.log(`    -> ${id}`);
      } catch (err: any) {
        console.log(`    FAILED: ${err.message}`);
      }
      await sleep(DELAY_BETWEEN_RUNS_MS);
    }
  }

  console.log(`\n  Test data created:`);
  console.log(`    Companies: ${data.companyIds.length}`);
  console.log(`    People:    ${data.personIds.length}`);
  console.log(`    Notes:     ${data.noteIds.length}`);
  console.log(`    Tasks:     ${data.taskIds.length}`);
  console.log(`    Comments:  ${data.commentIds.length}`);

  return data;
}

// ---------------------------------------------------------------------------
// Cleanup helper
// ---------------------------------------------------------------------------

async function cleanupItems(
  items: Array<{ type: string; id: string }>,
  label: string,
): Promise<void> {
  if (items.length === 0) return;
  console.log(`\n=== CLEANUP: ${label} (${items.length} items) ===\n`);

  const failed: string[] = [];
  const cleanupOrder = ["comment", "note", "task", "person", "company"];

  for (const type of cleanupOrder) {
    const batch = items.filter((i) => i.type === type);
    for (const item of batch) {
      try {
        if (item.type === "comment") {
          attio(["comments", "delete", item.id, "--yes"]);
        } else if (item.type === "note") {
          attio(["notes", "delete", item.id, "--yes"]);
        } else if (item.type === "task") {
          attio(["tasks", "delete", item.id, "--yes"]);
        } else if (item.type === "person") {
          attio(["records", "delete", "people", item.id, "--yes"]);
        } else if (item.type === "company") {
          attio(["records", "delete", "companies", item.id, "--yes"]);
        }
        console.log(`  Deleted ${item.type} ${item.id}`);
      } catch {
        console.log(`  WARNING: Failed to delete ${item.type} ${item.id}`);
        failed.push(`${item.type}:${item.id}`);
      }
      await sleep(DELAY_BETWEEN_RUNS_MS);
    }
  }

  if (failed.length > 0) {
    console.log(`\n  WARNING: ${failed.length} resources need manual cleanup:`);
    for (const f of failed) {
      console.log(`    - ${f}`);
    }
  } else {
    console.log(`\n  All ${label} cleaned up.`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("============================================================");
  console.log("  attio-cli Live Benchmark Suite");
  console.log("============================================================");
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log(`  Runs per scenario: ${RUNS_PER_SCENARIO} (1 warmup + 4 timed)`);
  console.log(`  Delay between runs: ${DELAY_BETWEEN_RUNS_MS}ms`);

  // Verify CLI works
  console.log("\n  Verifying CLI connectivity...");
  try {
    const { durationMs } = runAttio(["whoami"]);
    console.log(`  -> whoami OK (${durationMs.toFixed(0)}ms)`);
  } catch (err: any) {
    console.error(`  FATAL: CLI not working: ${err.message}`);
    process.exit(1);
  }

  // Setup
  const data = await setup();

  // Track write-scenario artifacts for cleanup
  const writeCleanupIds: { type: string; id: string }[] = [];

  // Build scenario list
  const scenarios: Array<{
    name: string;
    category: "read" | "write" | "compound";
    fn: () => number;
  }> = [];

  // =========================================================================
  // READ SCENARIOS (19-20)
  // =========================================================================

  scenarios.push({ name: "whoami", category: "read", fn: () => runAttio(["whoami"]).durationMs });
  scenarios.push({ name: "objects list", category: "read", fn: () => runAttio(["objects", "list"]).durationMs });
  scenarios.push({ name: "objects get companies", category: "read", fn: () => runAttio(["objects", "get", "companies"]).durationMs });
  scenarios.push({ name: "attributes list companies", category: "read", fn: () => runAttio(["attributes", "list", "companies"]).durationMs });
  scenarios.push({ name: "companies list", category: "read", fn: () => runAttio(["companies", "list"]).durationMs });
  scenarios.push({ name: "companies list --limit 5", category: "read", fn: () => runAttio(["companies", "list", "--limit", "5"]).durationMs });

  if (data.companyIds.length > 0) {
    scenarios.push({ name: "companies get <id>", category: "read", fn: () => runAttio(["companies", "get", data.companyIds[0]]).durationMs });
  }

  scenarios.push({ name: "companies search __BENCHMARK", category: "read", fn: () => runAttio(["companies", "search", "__BENCHMARK"]).durationMs });
  scenarios.push({ name: "companies list --filter name~__BENCHMARK", category: "read", fn: () => runAttio(["companies", "list", "--filter", "name~__BENCHMARK"]).durationMs });
  scenarios.push({ name: "people list", category: "read", fn: () => runAttio(["people", "list"]).durationMs });
  scenarios.push({ name: "people list --limit 5", category: "read", fn: () => runAttio(["people", "list", "--limit", "5"]).durationMs });

  if (data.personIds.length > 0) {
    scenarios.push({ name: "people get <id>", category: "read", fn: () => runAttio(["people", "get", data.personIds[0]]).durationMs });
  }

  scenarios.push({ name: "notes list", category: "read", fn: () => runAttio(["notes", "list"]).durationMs });

  if (data.companyIds.length > 0) {
    scenarios.push({ name: "notes list --object companies --record <id>", category: "read", fn: () => runAttio(["notes", "list", "--object", "companies", "--record", data.companyIds[0]]).durationMs });
  }

  if (data.noteIds.length > 0) {
    scenarios.push({ name: "notes get <id>", category: "read", fn: () => runAttio(["notes", "get", data.noteIds[0]]).durationMs });
  }

  scenarios.push({ name: "tasks list", category: "read", fn: () => runAttio(["tasks", "list"]).durationMs });

  if (data.taskIds.length > 0) {
    scenarios.push({ name: "tasks get <id>", category: "read", fn: () => runAttio(["tasks", "get", data.taskIds[0]]).durationMs });
  }

  if (data.companyIds.length > 0) {
    scenarios.push({ name: "comments list --object companies --record <id>", category: "read", fn: () => runAttio(["comments", "list", "--object", "companies", "--record", data.companyIds[0]]).durationMs });
  }

  scenarios.push({ name: "lists list", category: "read", fn: () => runAttio(["lists", "list"]).durationMs });
  scenarios.push({ name: "members list", category: "read", fn: () => runAttio(["members", "list"]).durationMs });

  // =========================================================================
  // WRITE SCENARIOS (7)
  // =========================================================================

  // companies create
  scenarios.push({
    name: "companies create",
    category: "write",
    fn: () => {
      const name = `${BENCH_COMPANY}_write_${Date.now()}`;
      const { durationMs, stdout } = runAttio(["companies", "create", "--set", `name=${name}`]);
      try {
        const id = JSON.parse(stdout)?.id?.record_id;
        if (id) writeCleanupIds.push({ type: "company", id });
      } catch { /* best effort */ }
      return durationMs;
    },
  });

  // people create (using --values for multi-select email_addresses)
  scenarios.push({
    name: "people create",
    category: "write",
    fn: () => {
      const email = `__benchmark_write_${Date.now()}@example.com`;
      const { durationMs, stdout } = runAttio([
        "people", "create",
        "--values", JSON.stringify({ email_addresses: [email] }),
      ]);
      try {
        const id = JSON.parse(stdout)?.id?.record_id;
        if (id) writeCleanupIds.push({ type: "person", id });
      } catch { /* best effort */ }
      return durationMs;
    },
  });

  // records update
  if (data.companyIds.length > 0) {
    scenarios.push({
      name: "records update companies <id>",
      category: "write",
      fn: () => {
        const { durationMs } = runAttio([
          "records", "update", "companies", data.companyIds[0],
          "--set", `name=${BENCH_COMPANY}_updated_${Date.now()}`,
        ]);
        return durationMs;
      },
    });
  }

  // notes create
  if (data.companyIds.length > 0) {
    scenarios.push({
      name: "notes create",
      category: "write",
      fn: () => {
        const title = `${BENCH_NOTE_TITLE}_write_${Date.now()}`;
        const { durationMs, stdout } = runAttio([
          "notes", "create",
          "--object", "companies",
          "--record", data.companyIds[0],
          "--title", title,
          "--content", "Benchmark write test",
        ]);
        try {
          const id = JSON.parse(stdout)?.id?.note_id;
          if (id) writeCleanupIds.push({ type: "note", id });
        } catch { /* best effort */ }
        return durationMs;
      },
    });
  }

  // tasks create
  scenarios.push({
    name: "tasks create",
    category: "write",
    fn: () => {
      const content = `${BENCH_TASK_CONTENT}_write_${Date.now()}`;
      const { durationMs, stdout } = runAttio(["tasks", "create", "--content", content]);
      try {
        const id = JSON.parse(stdout)?.id?.task_id;
        if (id) writeCleanupIds.push({ type: "task", id });
      } catch { /* best effort */ }
      return durationMs;
    },
  });

  // comments create
  if (data.companyIds.length > 0) {
    scenarios.push({
      name: "comments create",
      category: "write",
      fn: () => {
        const content = `${BENCH_COMMENT}_write_${Date.now()}`;
        const { durationMs, stdout } = runAttio([
          "comments", "create",
          "--object", "companies",
          "--record", data.companyIds[0],
          "--content", content,
        ]);
        try {
          const id = JSON.parse(stdout)?.id?.comment_id;
          if (id) writeCleanupIds.push({ type: "comment", id });
        } catch { /* best effort */ }
        return durationMs;
      },
    });
  }

  // records delete (create throwaway company, then time the delete)
  scenarios.push({
    name: "records delete",
    category: "write",
    fn: () => {
      const name = `${BENCH_COMPANY}_del_${Date.now()}`;
      const id = attioCreateAndGetId(["companies", "create", "--set", `name=${name}`]);
      const { durationMs } = runAttio(["records", "delete", "companies", id, "--yes"]);
      return durationMs;
    },
  });

  // =========================================================================
  // COMPOUND SCENARIOS (4)
  // =========================================================================

  // create company + add note
  scenarios.push({
    name: "compound: create company + add note",
    category: "compound",
    fn: () => {
      const start = performance.now();
      const name = `${BENCH_COMPANY}_compound_${Date.now()}`;
      const companyId = attioCreateAndGetId(["companies", "create", "--set", `name=${name}`]);
      const noteStdout = attio([
        "notes", "create",
        "--object", "companies",
        "--record", companyId,
        "--title", `${BENCH_NOTE_TITLE}_compound_${Date.now()}`,
        "--content", "Compound benchmark",
      ]);
      const elapsed = performance.now() - start;
      writeCleanupIds.push({ type: "company", id: companyId });
      try {
        const noteId = JSON.parse(noteStdout)?.id?.note_id;
        if (noteId) writeCleanupIds.push({ type: "note", id: noteId });
      } catch { /* best effort */ }
      return elapsed;
    },
  });

  // create company + add task linked to it
  scenarios.push({
    name: "compound: create company + add task",
    category: "compound",
    fn: () => {
      const start = performance.now();
      const name = `${BENCH_COMPANY}_comptask_${Date.now()}`;
      const companyId = attioCreateAndGetId(["companies", "create", "--set", `name=${name}`]);
      const taskStdout = attio([
        "tasks", "create",
        "--content", `${BENCH_TASK_CONTENT}_compound_${Date.now()}`,
        "--record", `companies:${companyId}`,
      ]);
      const elapsed = performance.now() - start;
      writeCleanupIds.push({ type: "company", id: companyId });
      try {
        const taskId = JSON.parse(taskStdout)?.id?.task_id;
        if (taskId) writeCleanupIds.push({ type: "task", id: taskId });
      } catch { /* best effort */ }
      return elapsed;
    },
  });

  // create person + add comment
  scenarios.push({
    name: "compound: create person + add comment",
    category: "compound",
    fn: () => {
      const start = performance.now();
      const email = `__benchmark_compound_${Date.now()}@example.com`;
      const personId = attioCreateAndGetId([
        "people", "create",
        "--values", JSON.stringify({ email_addresses: [email] }),
      ]);
      const commentStdout = attio([
        "comments", "create",
        "--object", "people",
        "--record", personId,
        "--content", `${BENCH_COMMENT}_compound_${Date.now()}`,
      ]);
      const elapsed = performance.now() - start;
      writeCleanupIds.push({ type: "person", id: personId });
      try {
        const commentId = JSON.parse(commentStdout)?.id?.comment_id;
        if (commentId) writeCleanupIds.push({ type: "comment", id: commentId });
      } catch { /* best effort */ }
      return elapsed;
    },
  });

  // search + get detail
  scenarios.push({
    name: "compound: search + get detail",
    category: "compound",
    fn: () => {
      const start = performance.now();
      const searchResult = attio(["companies", "search", "__BENCHMARK"]);
      let firstId: string | undefined;
      try {
        const parsed = JSON.parse(searchResult);
        if (Array.isArray(parsed) && parsed.length > 0) {
          firstId = parsed[0]?.id?.record_id;
        }
      } catch { /* */ }
      if (firstId) {
        attio(["companies", "get", firstId]);
      }
      return performance.now() - start;
    },
  });

  // =========================================================================
  // Run all scenarios
  // =========================================================================

  console.log(`\n=== RUNNING ${scenarios.length} SCENARIOS ===\n`);

  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    try {
      const result = await timeScenario(scenario.name, scenario.category, scenario.fn);
      results.push(result);
    } catch (err: any) {
      console.log(`  SCENARIO ERROR: ${scenario.name}: ${err.message}`);
      results.push({
        scenario: scenario.name,
        category: scenario.category,
        medianMs: -1,
        runs: [],
        warmupMs: -1,
        error: err.message,
      });
    }
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  // Build setup data cleanup list
  const setupCleanup: Array<{ type: string; id: string }> = [
    ...data.commentIds.map((id) => ({ type: "comment", id })),
    ...data.noteIds.map((id) => ({ type: "note", id })),
    ...data.taskIds.map((id) => ({ type: "task", id })),
    ...data.personIds.map((id) => ({ type: "person", id })),
    ...data.companyIds.map((id) => ({ type: "company", id })),
  ];

  await cleanupItems(writeCleanupIds, "Write scenario artifacts");
  await cleanupItems(setupCleanup, "Setup test data");

  // =========================================================================
  // Write results
  // =========================================================================

  const readResults = results.filter((r) => r.category === "read");
  const writeResults = results.filter((r) => r.category === "write");
  const compoundResults = results.filter((r) => r.category === "compound");

  const successful = results.filter((r) => r.medianMs >= 0);
  const allMedians = successful.map((r) => r.medianMs);

  const output = {
    meta: {
      date: new Date().toISOString(),
      runsPerScenario: RUNS_PER_SCENARIO,
      timedRuns: RUNS_PER_SCENARIO - 1,
      delayBetweenRunsMs: DELAY_BETWEEN_RUNS_MS,
      totalScenarios: scenarios.length,
      successfulScenarios: successful.length,
      failedScenarios: results.length - successful.length,
    },
    summary: {
      overallMedianMs: allMedians.length > 0 ? Math.round(median(allMedians) * 100) / 100 : -1,
      readMedianMs: readResults.filter((r) => r.medianMs >= 0).length > 0
        ? Math.round(median(readResults.filter((r) => r.medianMs >= 0).map((r) => r.medianMs)) * 100) / 100
        : -1,
      writeMedianMs: writeResults.filter((r) => r.medianMs >= 0).length > 0
        ? Math.round(median(writeResults.filter((r) => r.medianMs >= 0).map((r) => r.medianMs)) * 100) / 100
        : -1,
      compoundMedianMs: compoundResults.filter((r) => r.medianMs >= 0).length > 0
        ? Math.round(median(compoundResults.filter((r) => r.medianMs >= 0).map((r) => r.medianMs)) * 100) / 100
        : -1,
      fastestScenario: successful.length > 0
        ? successful.reduce((a, b) => (a.medianMs < b.medianMs ? a : b)).scenario
        : "N/A",
      slowestScenario: successful.length > 0
        ? successful.reduce((a, b) => (a.medianMs > b.medianMs ? a : b)).scenario
        : "N/A",
    },
    results,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2));
  console.log(`\n=== RESULTS ===\n`);
  console.log(`  Written to: ${RESULTS_PATH}`);
  console.log(`  Total scenarios: ${scenarios.length}`);
  console.log(`  Successful: ${successful.length}`);
  console.log(`  Failed: ${results.length - successful.length}`);
  console.log(`  Overall median: ${output.summary.overallMedianMs}ms`);
  console.log(`  Read median: ${output.summary.readMedianMs}ms`);
  console.log(`  Write median: ${output.summary.writeMedianMs}ms`);
  console.log(`  Compound median: ${output.summary.compoundMedianMs}ms`);
  console.log(`  Fastest: ${output.summary.fastestScenario}`);
  console.log(`  Slowest: ${output.summary.slowestScenario}`);
  console.log("\n============================================================\n");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

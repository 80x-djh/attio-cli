# Live Benchmark Spec: attio-cli vs Attio MCP

You are running a comprehensive live benchmark of the `attio-cli` project at `/Users/daniel/attio-cli`. The goal is to measure real CLI latency for every scenario, then generate an accurate comparison report against the Attio MCP.

## Prerequisites

- The CLI is installed globally (`attio` command available)
- An API key is configured (`attio whoami` succeeds)
- If the CLI is not built, run `npm run build` in `/Users/daniel/attio-cli` first
- If `attio` is not on PATH, use `npx tsx bin/attio.ts` instead

## What You're Measuring

For each scenario below, run the CLI command **5 times** and record the **median** wall-clock time in milliseconds. Use `performance.now()` or shell `time` — whatever gives you millisecond precision. Discard the first run as a cold start; take the median of runs 2-5.

All commands should use `--json` output and pipe to `/dev/null` so output rendering doesn't affect timing.

## Test Data Lifecycle

You must create real test data to benchmark against, then clean it up afterward. Follow this exact order:

### Phase 1: Setup (create test data)

1. Create a test company:
   ```bash
   attio records create companies --set name="__BENCHMARK_TEST_COMPANY__" --json
   ```
   Save the returned record ID as `$COMPANY_ID`.

2. Create a test person:
   ```bash
   attio records create people --set name="Benchmark, Test" --set email_addresses='["benchmark-test@example.com"]' --json
   ```
   Save the returned record ID as `$PERSON_ID`.

3. Create a test note on the company:
   ```bash
   attio notes create --object companies --record "$COMPANY_ID" --title "Benchmark Test Note" --content "This is a benchmark test note" --json
   ```
   Save the returned note ID as `$NOTE_ID`.

4. Create a test task:
   ```bash
   attio tasks create --content "Benchmark test task" --json
   ```
   Save the returned task ID as `$TASK_ID`.

5. Create a test comment on the company:
   ```bash
   attio comments create --object companies --record "$COMPANY_ID" --content "Benchmark test comment" --json
   ```
   Save the returned comment ID as `$COMMENT_ID`.

If any of these fail, log the error and skip scenarios that depend on that resource. Do NOT stop the whole benchmark.

### Phase 2: Benchmark (time every scenario)

Run each of these scenarios 5 times (discard first, median of last 4):

#### Read operations

| # | Scenario | Command |
|---|----------|---------|
| 1 | List companies | `attio companies list --json --limit 10` |
| 2 | List people | `attio people list --json --limit 10` |
| 3 | List companies (filtered) | `attio companies list --filter 'name~Benchmark' --json` |
| 4 | List companies (sorted) | `attio companies list --sort name:asc --json --limit 10` |
| 5 | List companies (filter + sort) | `attio companies list --filter 'name~Benchmark' --sort name:asc --json` |
| 6 | Get company by ID | `attio companies get "$COMPANY_ID" --json` |
| 7 | Get person by ID | `attio people get "$PERSON_ID" --json` |
| 8 | Search companies | `attio companies search "Benchmark" --json` |
| 9 | Search people | `attio people search "Benchmark" --json` |
| 10 | List objects | `attio objects list --json` |
| 11 | List attributes | `attio attributes list companies --json` |
| 12 | List lists | `attio lists list --json` |
| 13 | List tasks | `attio tasks list --json` |
| 14 | Get task by ID | `attio tasks get "$TASK_ID" --json` |
| 15 | List notes | `attio notes list --object companies --record "$COMPANY_ID" --json` |
| 16 | Get note by ID | `attio notes get "$NOTE_ID" --json` |
| 17 | List comments | `attio comments list --object companies --record "$COMPANY_ID" --json` |
| 18 | List members | `attio members list --json` |
| 19 | Whoami | `attio whoami --json` |

#### Write operations

For write operations, create and then immediately use/clean up the resource:

| # | Scenario | Command | Cleanup |
|---|----------|---------|---------|
| 20 | Create company | `attio records create companies --set name="__BENCH_WRITE_TEST__" --json` | Delete it after timing |
| 21 | Update company | `attio records update companies "$COMPANY_ID" --set name="__BENCHMARK_TEST_COMPANY_UPDATED__" --json` | Revert name after |
| 22 | Create note | `attio notes create --object companies --record "$COMPANY_ID" --title "Bench" --content "test" --json` | Delete it after timing |
| 23 | Create task | `attio tasks create --content "Bench write test" --json` | Delete it after timing |
| 24 | Update task | `attio tasks update "$TASK_ID" --set content="Updated benchmark task" --json` | N/A |
| 25 | Create comment | `attio comments create --object companies --record "$COMPANY_ID" --content "Bench write test" --json` | Delete it after timing |
| 26 | Delete comment | Create a throwaway comment, then time the delete | N/A |

#### Compound operations

These test chained commands (the kind you'd put in a script):

| # | Scenario | Commands | Notes |
|---|----------|----------|-------|
| 27 | Create + get | Create a company, then immediately get it by ID | Time the full sequence |
| 28 | Create + note + task | Create company, add note, add task | Time full 3-command sequence |
| 29 | List + count (pipe) | `attio companies list --all --json \| jq length` | Tests pagination + pipe |
| 30 | Filter + quiet + xargs | `attio companies list --filter 'name^__BENCH' -q` | Just the list part; don't delete |

### Phase 3: Cleanup

Delete all test data in reverse order. Use `--yes` to skip confirmation:

```bash
attio comments delete "$COMMENT_ID" --yes
attio tasks delete "$TASK_ID" --yes
attio notes delete "$NOTE_ID" --yes
attio records delete people "$PERSON_ID" --yes
attio records delete companies "$COMPANY_ID" --yes
```

Also find and delete any leftover benchmark records:
```bash
attio companies list --filter 'name^__BENCH' -q | xargs -I{} attio records delete companies {} --yes
```

## Output

Write the results to `/Users/daniel/attio-cli/benchmarks/live-results.json` with this structure:

```json
{
  "timestamp": "2026-02-14T...",
  "environment": {
    "os": "macOS ...",
    "node": "v...",
    "cliVersion": "0.1.0",
    "runsPerScenario": 5,
    "warmupRuns": 1
  },
  "scenarios": [
    {
      "id": 1,
      "name": "List companies",
      "category": "read",
      "command": "attio companies list --json --limit 10",
      "runs": [443, 412, 398, 405, 410],
      "median": 410,
      "min": 398,
      "max": 443,
      "failed": false,
      "error": null
    }
  ],
  "setup": {
    "companyId": "...",
    "personId": "...",
    "noteId": "...",
    "taskId": "...",
    "commentId": "..."
  },
  "cleanup": {
    "success": true,
    "errors": []
  }
}
```

Then update `benchmarks/run.ts` to accept a `--results <path>` flag that reads from `live-results.json` and uses those real timings instead of estimates. Map each result by scenario name to the corresponding scenario in the report generator.

Finally, regenerate the report:
```bash
npx tsx benchmarks/run.ts --results benchmarks/live-results.json > benchmarks/REPORT.md
```

## Important Notes

- Do NOT modify any source code in `src/` or `bin/`. You are only working in `benchmarks/`.
- If a command fails, log the error and continue. Do not retry more than once.
- Rate limiting: Attio allows ~10 req/sec. Add a 150ms delay between runs to stay safe.
- All test data uses the `__BENCHMARK_` or `__BENCH_` prefix so it's easy to identify and clean up.
- If cleanup fails, print a warning with the IDs that need manual cleanup.
- Pipe command output to /dev/null during timing so stdout buffering doesn't affect measurements.
- Use `--no-color` on all commands to avoid ANSI escape overhead.

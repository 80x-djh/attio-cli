# attio-cli

CLI for the Attio CRM API. Built for scripts, agents, and humans who prefer terminals.

## Install

```bash
npm install -g attio-cli
```

## Quick Start

```bash
attio init          # guided setup — paste your API key, done
attio whoami        # verify connection
attio people list --limit 5
```

You'll need an API key from [Attio Developer Settings](https://app.attio.com/settings/developers). `attio init` walks you through the rest.

## Examples

```bash
# List companies, filter by name
attio companies list --filter 'name~Acme'

# Search for a person
attio people search "Jane"

# Create a company and get back just the ID
attio companies create --set name="Acme" --set domains='["acme.com"]' -q

# Get a record as JSON and pipe to jq
attio companies list --json | jq '.[].values.name[0].value'

# Export all companies to CSV
attio companies list --all --csv > companies.csv
```

See [Scripting Examples](#scripting-examples) for more advanced workflows (bulk updates, chaining commands, etc.).

For non-interactive environments (CI, scripts), use any of:

```bash
attio init --api-key <key>           # validates and saves
export ATTIO_API_KEY=<key>           # env var (takes precedence)
attio config set api-key <key>       # direct config write
```

## Agent Setup

To let AI agents (Claude, etc.) discover this CLI, append the auto-generated snippet to your project's `CLAUDE.md`:

```bash
attio config claude-md >> CLAUDE.md
```

## Command Reference

| Command | Description |
|---------|-------------|
| `attio init` | Interactive setup wizard — connect to your Attio workspace |
| `attio whoami` | Show current workspace and user info |
| **Objects** | |
| `attio objects list` | List all objects in the workspace |
| `attio objects get <slug>` | Get details for a specific object |
| **Attributes** | |
| `attio attributes list <object>` | List attributes for an object |
| **Records** | |
| `attio records list <object>` | List records for an object |
| `attio records get <object> <id>` | Get a specific record |
| `attio records create <object>` | Create a new record |
| `attio records update <object> <id>` | Update an existing record |
| `attio records delete <object> <id>` | Delete a record |
| `attio records assert <object>` | Create or update a record by matching attribute |
| `attio records upsert <object>` | Alias for `records assert` |
| `attio records search <query>` | Full-text search across one or more objects |
| `attio records values <object> <id>` | List current and historic attribute values |
| `attio records entries <object> <id>` | List list entries where this record is the parent |
| **People** | |
| `attio people list` | List people |
| `attio people get <id>` | Get a person by ID |
| `attio people create` | Create a person |
| `attio people update <id>` | Update a person |
| `attio people delete <id>` | Delete a person |
| `attio people assert` | Assert (upsert) a person by matching attribute |
| `attio people search <query>` | Search people by name or email |
| **Companies** | |
| `attio companies list` | List companies |
| `attio companies get <id>` | Get a company by ID |
| `attio companies create` | Create a company |
| `attio companies update <id>` | Update a company |
| `attio companies delete <id>` | Delete a company |
| `attio companies assert` | Assert (upsert) a company by matching attribute |
| `attio companies search <query>` | Search companies by name or domain |
| **Deals** | |
| `attio deals list` | List deals |
| `attio deals get <id>` | Get a deal by ID |
| `attio deals create` | Create a deal |
| `attio deals update <id>` | Update a deal |
| `attio deals delete <id>` | Delete a deal |
| `attio deals assert` | Assert (upsert) a deal by matching attribute |
| `attio deals search <query>` | Search deals |
| **Users** | |
| `attio users list` | List users |
| `attio users get <id>` | Get a user by ID |
| `attio users create` | Create a user |
| `attio users update <id>` | Update a user |
| `attio users delete <id>` | Delete a user |
| `attio users assert` | Assert (upsert) a user by matching attribute |
| `attio users search <query>` | Search users |
| **Workspaces (Standard Object)** | |
| `attio workspaces list` | List workspace records |
| `attio workspaces get <id>` | Get a workspace record by ID |
| `attio workspaces create` | Create a workspace record |
| `attio workspaces update <id>` | Update a workspace record |
| `attio workspaces delete <id>` | Delete a workspace record |
| `attio workspaces assert` | Assert (upsert) a workspace record by matching attribute |
| `attio workspaces search <query>` | Search workspace records |
| **Lists** | |
| `attio lists list` | List all lists |
| `attio lists get <id>` | Get a specific list |
| **Entries** | |
| `attio entries list <list>` | List entries in a list |
| `attio entries get <list> <id>` | Get a specific entry |
| `attio entries create <list>` | Add an entry to a list |
| `attio entries assert <list>` | Assert (upsert) an entry by parent record |
| `attio entries update <list> <id>` | Update a list entry |
| `attio entries delete <list> <id>` | Remove an entry from a list |
| **Tasks** | |
| `attio tasks list` | List tasks |
| `attio tasks get <id>` | Get a specific task |
| `attio tasks create` | Create a task |
| `attio tasks update <id>` | Update a task |
| `attio tasks delete <id>` | Delete a task |
| **Notes** | |
| `attio notes list` | List notes |
| `attio notes get <id>` | Get a specific note |
| `attio notes create` | Create a note |
| `attio notes delete <id>` | Delete a note |
| **Comments** | |
| `attio comments list` | List comments on a thread |
| `attio comments create` | Create a comment |
| `attio comments delete <id>` | Delete a comment |
| **Threads** | |
| `attio threads list` | List threaded conversations |
| `attio threads get <id>` | Get a thread by ID |
| **Meetings (Beta)** | |
| `attio meetings list` | List meetings (beta endpoint) |
| `attio meetings get <id>` | Get a meeting (beta endpoint) |
| **Recordings (Beta)** | |
| `attio recordings list --meeting <id>` | List call recordings for a meeting |
| `attio recordings get <id> --meeting <id>` | Get a call recording, optionally with transcript |
| **Webhooks** | |
| `attio webhooks events` | List supported webhook event types |
| `attio webhooks list` | List webhooks |
| `attio webhooks get <id>` | Get a webhook by ID |
| `attio webhooks create` | Create a webhook |
| `attio webhooks update <id>` | Update a webhook |
| `attio webhooks delete <id>` | Delete a webhook |
| **Members** | |
| `attio members list` | List workspace members |
| **Config** | |
| `attio config set <key> <value>` | Set a config value |
| `attio config get <key>` | Get a config value |
| `attio config path` | Print the config file path |
| **Open** | |
| `attio open` | Open the Attio web app in your browser |

## Global Flags

| Flag | Description |
|------|-------------|
| `--api-key <key>` | Override the API key for this request |
| `--json` | Force JSON output |
| `--table` | Force table output |
| `--csv` | Force CSV output |
| `-q, --quiet` | Only output IDs (one per line) |
| `--no-color` | Disable colored output |
| `--debug` | Print request/response details to stderr |

Output format is auto-detected: table when stdout is a TTY (interactive terminal), JSON when piped.

## Filtering

Use `--filter` to narrow results. The syntax is `attribute operator value`.

| Operator | Meaning | Example |
|----------|---------|---------|
| `=` | Equals | `--filter 'name=Acme'` |
| `!=` | Not equals | `--filter 'status!=closed'` |
| `~` | Contains | `--filter 'name~corp'` |
| `!~` | Does not contain | `--filter 'name!~test'` |
| `^` | Starts with | `--filter 'name^Acme'` |
| `>` | Greater than | `--filter 'revenue>1000000'` |
| `>=` | Greater than or equal | `--filter 'created_at>=2024-01-01'` |
| `<` | Less than | `--filter 'revenue<500000'` |
| `<=` | Less than or equal | `--filter 'created_at<=2024-12-31'` |
| `?` | Is set / not empty | `--filter 'email?'` |

Multiple filters are ANDed together:

```bash
attio records list companies --filter 'name~Acme' --filter 'revenue>=1000000'
```

## Sorting

Use `--sort` with the format `attribute:direction`:

```bash
attio records list companies --sort name:asc
attio people list --sort name.last_name:desc
```

## Scripting Examples

```bash
# Create a company and immediately add a note
ID=$(attio records create companies --set name="Acme" --set domains='["acme.com"]' -q)
attio notes create --object companies --record $ID --title "New lead" --content "From website"

# Export all companies to JSON
attio records list companies --all --json > companies.json

# Pipe to jq
attio records list companies --all --json | jq -r '.[].values.name[0].value'
```

```bash
# Bulk update from a CSV
while IFS=, read -r id status; do
  attio records update companies "$id" --set "status=$status"
done < updates.csv
```

```bash
# Find and delete test records
attio records list companies --filter 'name^TEST_' --json -q | \
  xargs -I{} attio records delete companies {}
```

## Why CLI over MCP for Agents

While MCP tools work well, a CLI is often the better choice for AI agent workflows:

- **Simpler** — a single bash command vs. structured tool-call JSON
- **Self-documenting** — `attio --help` and `attio companies --help` let agents discover capabilities without external docs
- **LLM-native** — language models are heavily RL'd on command-line usage; they generate CLI invocations more reliably than tool-call schemas
- **Composable** — pipe `attio` output into `jq`, `grep`, `xargs`, or any other Unix tool, building complex workflows from simple parts
- **Cheaper** — MCP servers load all tool schemas as input tokens on every LLM call (14,521 tokens for Attio's 30 tools), even if only one tool is used. A CLI just needs the Bash tool schema (~200 tokens). See [benchmarks/REPORT.md](benchmarks/REPORT.md) for detailed cost comparisons.

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Submit a pull request

## License

MIT -- see [LICENSE](LICENSE) for details.

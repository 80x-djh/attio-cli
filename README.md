# attio-cli

CLI for the Attio CRM API. Built for scripts, agents, and humans who prefer terminals.

## Install

```bash
npm install -g attio-cli
```

## Quick Start

```bash
export ATTIO_API_KEY=your_key
# or
attio config set api-key your_key

attio whoami
attio objects list
attio people list --limit 5
```

## Command Reference

| Command | Description |
|---------|-------------|
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
| `attio records upsert <object>` | Create or update a record by matching attribute |
| `attio records search <object>` | Full-text search across records |
| **People** | |
| `attio people list` | List people |
| `attio people get <id>` | Get a person by ID |
| `attio people create` | Create a person |
| `attio people update <id>` | Update a person |
| `attio people delete <id>` | Delete a person |
| `attio people search <query>` | Search people by name or email |
| **Companies** | |
| `attio companies list` | List companies |
| `attio companies get <id>` | Get a company by ID |
| `attio companies create` | Create a company |
| `attio companies update <id>` | Update a company |
| `attio companies delete <id>` | Delete a company |
| `attio companies search <query>` | Search companies by name or domain |
| **Lists** | |
| `attio lists list` | List all lists |
| `attio lists get <id>` | Get a specific list |
| **Entries** | |
| `attio entries list <list>` | List entries in a list |
| `attio entries get <list> <id>` | Get a specific entry |
| `attio entries create <list>` | Add an entry to a list |
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

While MCP tools let AI agents call APIs through natural language, a CLI is often the better choice for automated workflows. CLI commands are deterministic -- the same input always produces the same output, with no LLM interpretation layer to introduce variance. They are cheaper because they skip the token cost of encoding tool schemas and parsing responses. They are faster since there is no round-trip through a language model. And they are composable: you can pipe `attio` output into `jq`, `grep`, `xargs`, or any other Unix tool, building complex workflows from simple parts that are easy to debug and reproduce.

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Submit a pull request

## License

MIT -- see [LICENSE](LICENSE) for details.

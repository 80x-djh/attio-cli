# Attio CLI

Read SPEC.md for the full specification. It contains everything you need:
architecture, API mappings, implementation code for tricky parts, and edge cases.

Read openapi.json for exact Attio API endpoint paths, request bodies, and response shapes.
Cross-reference SPEC.md with openapi.json when implementing each command.

Key rules:
- Use POST (not GET) for /records/query and /entries/query endpoints
- Always unwrap the {"data": ...} response envelope
- Use the filter parser from SPEC.md exactly as specified
- Use the value flattener from SPEC.md exactly as specified
- Auto-detect TTY for output format (table for terminal, JSON for pipes)
- --quiet mode outputs only IDs, one per line

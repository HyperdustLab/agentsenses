# Auto Router Layer

This directory contains an explicit router layer that inspects a task and dispatches execution to the correct OpenClaw agent profile automatically.

## Router script

- `auto-route.sh`

### Behavior

- chooses `main` (local model) for low-risk / retrospective-style tasks
- chooses `advanced` (hosted model) for high-stakes or high-complexity tasks
- prints a routing decision line before execution:
  - route (`local` or `hosted`)
  - selected agent id
  - reason

## Usage

```bash
# Dry-run decision only
tools/auto-route.sh --dry-run "Summarize this session and list TODOs."
tools/auto-route.sh --dry-run "Design secure multi-tenant auth architecture."
```

```bash
# Execute routed task
tools/auto-route.sh "Summarize this thread and list next actions."
tools/auto-route.sh "Write a production incident response plan."
```

## Environment overrides

You can override the route target agents:

- `OPENCLAW_ROUTE_AGENT_LOCAL` (default: `main`)
- `OPENCLAW_ROUTE_AGENT_HOSTED` (default: `advanced`)

Example:

```bash
OPENCLAW_ROUTE_AGENT_LOCAL=main OPENCLAW_ROUTE_AGENT_HOSTED=advanced tools/auto-route.sh "..."
```

## Hook/service integration pattern

You can integrate the script as:

- a shell alias
- a small HTTP wrapper service that forwards incoming task text to `auto-route.sh`
- a gateway hook wrapper that extracts the incoming task string, then executes `auto-route.sh`

Minimal wrapper pattern:

```bash
task_text="...incoming task..."
tools/auto-route.sh "$task_text"
```

The routing logic is explicit and deterministic in one place, which makes it a good demonstration companion for Agent Senses advice-based behavior.

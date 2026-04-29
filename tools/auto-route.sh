#!/usr/bin/env bash
set -euo pipefail

LOCAL_AGENT="${OPENCLAW_ROUTE_AGENT_LOCAL:-main}"
HOSTED_AGENT="${OPENCLAW_ROUTE_AGENT_HOSTED:-advanced}"

FORCE_ROUTE=""
DRY_RUN=0
OUTPUT_JSON=1

usage() {
  cat <<'EOF'
Usage:
  auto-route.sh [options] "<task prompt>"
  echo "<task prompt>" | auto-route.sh [options]

Options:
  --dry-run              Print selected route only.
  --force local|hosted   Force a specific route.
  --plain                Disable --json when calling openclaw agent.
  -h, --help             Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --force)
      FORCE_ROUTE="${2:-}"
      [[ "$FORCE_ROUTE" == "local" || "$FORCE_ROUTE" == "hosted" ]] || {
        echo "error: --force must be 'local' or 'hosted'" >&2
        exit 2
      }
      shift 2
      ;;
    --plain) OUTPUT_JSON=0; shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift; break ;;
    -*) echo "error: unknown option: $1" >&2; usage >&2; exit 2 ;;
    *) break ;;
  esac
done

if [[ $# -gt 0 ]]; then
  PROMPT="$*"
else
  [[ -t 0 ]] && { echo "error: missing prompt argument" >&2; usage >&2; exit 2; }
  PROMPT="$(python3 -c 'import sys; print(sys.stdin.read().strip())')"
fi

[[ -z "${PROMPT// }" ]] && { echo "error: prompt is empty" >&2; exit 2; }

choose_route() {
  local text="$1"
  local lower chars
  lower="$(printf '%s' "$text" | tr '[:upper:]' '[:lower:]')"
  chars="${#text}"

  local hosted_pattern="security|compliance|legal|finance|payment|incident|outage|breach|threat model|architecture|multi-tenant|migration|publish|public|customer-impact|production|gdpr|sox|hipaa"
  local local_pattern="retrospective|summary|summarize|rewrite|rephrase|todo|checklist|notes|journal|brainstorm|draft"

  if [[ "$lower" =~ $hosted_pattern ]]; then
    ROUTE="hosted"
    REASON="high-stakes or high-complexity keywords matched"
    return
  fi
  if (( chars > 1800 )); then
    ROUTE="hosted"
    REASON="very long prompt (${chars} chars) suggests complex task"
    return
  fi
  if [[ "$lower" =~ $local_pattern ]]; then
    ROUTE="local"
    REASON="retrospective/low-risk task pattern matched"
    return
  fi
  ROUTE="local"
  REASON="default local-first policy"
}

ROUTE=""
REASON=""
if [[ -n "$FORCE_ROUTE" ]]; then
  ROUTE="$FORCE_ROUTE"
  REASON="forced by --force ${FORCE_ROUTE}"
else
  choose_route "$PROMPT"
fi

if [[ "$ROUTE" == "hosted" ]]; then
  AGENT="$HOSTED_AGENT"
else
  AGENT="$LOCAL_AGENT"
fi

echo "[auto-route] route=${ROUTE} agent=${AGENT} reason=${REASON}" >&2
(( DRY_RUN == 1 )) && exit 0

if (( OUTPUT_JSON == 1 )); then
  exec openclaw agent --agent "$AGENT" --local --message "$PROMPT" --json
else
  exec openclaw agent --agent "$AGENT" --local --message "$PROMPT"
fi

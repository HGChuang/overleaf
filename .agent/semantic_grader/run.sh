#!/usr/bin/env bash

set -euo pipefail

AGENT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$AGENT_ROOT/../.." && pwd)"
INPUT_FILE="$(mktemp)"
PROMPT_FILE="$(mktemp)"
OUTPUT_FILE="$(mktemp)"
trap 'rm -f "$INPUT_FILE" "$PROMPT_FILE" "$OUTPUT_FILE"' EXIT

cat >"$INPUT_FILE"
{
  cat "$AGENT_ROOT/instructions.md"
  printf '\n\n<semantic_grader_input>\n'
  cat "$INPUT_FILE"
  printf '\n</semantic_grader_input>\n'
} >"$PROMPT_FILE"

MODEL="${EVAL_SEMANTIC_GRADER_MODEL:-gpt-5.6-luna}"
codex exec \
  --ephemeral \
  --sandbox read-only \
  -C "$REPO_ROOT" \
  -m "$MODEL" \
  --output-schema "$AGENT_ROOT/output.schema.json" \
  --output-last-message "$OUTPUT_FILE" \
  - <"$PROMPT_FILE" >/dev/null

cat "$OUTPUT_FILE"

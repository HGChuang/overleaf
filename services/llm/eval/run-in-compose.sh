#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../../.." && pwd)"

runner_entry="${1:-eval/pilot/runPilotCase.ts}"
if [[ "$runner_entry" == -* ]]; then
  runner_entry="eval/pilot/runPilotCase.ts"
else
  shift || true
fi

compose_project_dir="${EVAL_COMPOSE_PROJECT_DIR:-$REPO_ROOT/develop}"
compose_service="${EVAL_COMPOSE_SERVICE:-llm}"
compose_args=(
  --project-directory "$compose_project_dir"
  -f "$compose_project_dir/docker-compose.yml"
)
if [[ "${EVAL_COMPOSE_DEV:-true}" != "false" ]]; then
  compose_args+=( -f "$compose_project_dir/docker-compose.dev.yml" )
fi

if [[ -z "${EVAL_GIT_COMMIT:-}" ]]; then
  EVAL_GIT_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
fi
if [[ -z "$EVAL_GIT_COMMIT" ]]; then
  echo "run-in-compose: unable to determine EVAL_GIT_COMMIT" >&2
  exit 2
fi

eval_env_names=(
  EVAL_CONTEXT_TRACE EVAL_ARTIFACT_ROOT EVAL_CASE_ID EVAL_CLSI_URL EVAL_COMPILE_TIMEOUT_MS
  EVAL_EXPERIMENT_ID EVAL_GIT_COMMIT EVAL_INJECT_RUNNER_FAILURE_AFTER_PATCH
  EVAL_RESUME_RESULT EVAL_TRIAL_ID EVAL_USER_ID EVAL_USER_MESSAGES_JSON
  EVAL_USER_MESSAGE EVAL_USER_PROTOCOL_TIMEOUT_MS EVAL_USER_SESSION_ID
)
# The dev service runs its long-lived process under the Node inspector. An eval
# subprocess must not inherit that flag: concurrent trials would all contend
# for the same inspector port even though the runner itself does not need it.
exec_env=( -e "NODE_OPTIONS=" -e "EVAL_GIT_COMMIT=$EVAL_GIT_COMMIT" )
for env_name in "${eval_env_names[@]}"; do
  [[ "$env_name" == EVAL_GIT_COMMIT ]] && continue
  if [[ "${!env_name+x}" == x ]]; then
    exec_env+=( -e "$env_name=${!env_name}" )
  fi
done

exec docker compose "${compose_args[@]}" exec -T "${exec_env[@]}" \
  "$compose_service" npx tsx "$runner_entry" "$@"

#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
runtime_image=${L0_RUNTIME_IMAGE:-develop-llm:latest}
mongo_name="copilot-l0-mongo-$$"
cleanup() { docker rm -f "$mongo_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker image inspect --format 'L0 runtime image: {{.Id}}' "$runtime_image"
# A new replica set, no host port/volume and no external network. The test
# process shares only this container's loopback, never a development database.
docker run -d --name "$mongo_name" --network none --tmpfs /data/db mongo:5 \
  mongod --replSet l0 --bind_ip 127.0.0.1 --quiet >/dev/null
ready=false
for attempt in {1..50}; do
  if docker exec "$mongo_name" mongo --quiet --eval 'db.adminCommand({ping:1}).ok' >/dev/null 2>&1; then ready=true; break; fi
  sleep 0.2
done
if [ "$ready" != true ]; then echo 'Isolated Mongo did not start' >&2; exit 1; fi
docker exec "$mongo_name" mongo --quiet --eval 'rs.initiate({_id:"l0",members:[{_id:0,host:"127.0.0.1:27017"}]})' >/dev/null
docker run --rm --network "container:$mongo_name" --user root \
  -v "$root/services/llm/app:/overleaf/services/llm/app:ro" \
  -v "$root/services/llm/config:/overleaf/services/llm/config:ro" \
  -v "$root/services/llm/harness-checks:/overleaf/services/llm/harness-checks:ro" \
  -v "$root/services/llm/tsconfig.json:/overleaf/services/llm/tsconfig.json:ro" \
  -v "$root/services/llm/app.ts:/overleaf/services/llm/app.ts:ro" \
  -v "$root/services/web/app/src/Features/Copilot:/overleaf/services/web/app/src/Features/Copilot:ro" \
  -v "$root/libraries/copilot-contracts:/overleaf/libraries/copilot-contracts:ro" \
  -v "$root/libraries/settings:/overleaf/libraries/settings:ro" \
  -e COPILOT_AGENT_RECURSION_LIMIT=4 -e COPILOT_CONTEXT_WINDOW=200000 \
  -e L0_MONGO_URL='mongodb://127.0.0.1:27017/copilot_l0?replicaSet=l0' \
  --entrypoint sh "$runtime_image" -c \
  'ln -sfn /overleaf/libraries/copilot-contracts /overleaf/node_modules/@overleaf/copilot-contracts && node --version && node --import tsx --test --test-concurrency=1 --test-timeout=20000 harness-checks/*.test.ts && /overleaf/node_modules/.bin/tsc --noEmit -p tsconfig.json && echo "L0 business TypeScript check: PASS"'

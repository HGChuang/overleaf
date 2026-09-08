#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../../.." && pwd)
mode=${1:-preflight}
run_id=${2:-baseline-01}
case_ids=${3:-all}
[[ "$mode" == preflight || "$mode" == run ]] || { echo 'Use preflight or run' >&2; exit 1; }
[[ "$run_id" =~ ^[a-zA-Z0-9_-]+$ ]] || exit 1
out="$root/doc/copilot-l1-artifacts/$run_id"
mkdir -p "$out/compiler"
secret_dir=$(mktemp -d)
mongo_name="copilot-l1-mongo-$$"
tex_name="copilot-l1-tex-$$"
runtime_name="copilot-l1-runtime-$$"
cleanup() {
  docker rm -f "$runtime_name" "$tex_name" "$mongo_name" >/dev/null 2>&1 || true
  rm -rf "$secret_dir"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
runtime_image=${L1_RUNTIME_IMAGE:-develop-llm:latest}
tex_image=${L1_TEX_IMAGE:-texlive-full:latest}
docker image inspect --format '{{.Id}}' "$runtime_image" > "$out/runtime-image.txt"
docker image inspect --format '{{.Id}}' "$tex_image" > "$out/compiler-image.txt"
# Fingerprint current source only, never inspect VCS or old evaluation files.
python3 - "$root" "$out" <<'PY'
import hashlib, json, sys
from pathlib import Path
root, out = map(Path, sys.argv[1:])
paths = []
for directory in ['services/llm/app', 'services/llm/config', 'services/llm/harness-checks/l1',
                  'libraries/copilot-contracts', 'libraries/settings', 'services/web/app/src/Features/Copilot']:
    paths.extend(p for p in (root / directory).rglob('*') if p.is_file() and p.suffix in ('.ts', '.mjs', '.cjs', '.js', '.json', '.py', '.sh'))
paths.extend(root / p for p in ['package-lock.json', 'services/llm/package.json'])
manifest = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}
(out / 'source-manifest-current.json').write_text(json.dumps(manifest, indent=2))
PY
if [[ "$mode" == run ]]; then
  # Secret stays in a mode-600 temporary file, never stdout or artifacts.
  docker exec develop-mongo-1 mongo --quiet sharelatex --eval '
    var entries=[]; db.users.find({"llminfo.name":"huoshan"},{llminfo:1}).forEach(function(u){u.llminfo.forEach(function(p){
      if(p.name==="huoshan") {var m=p.models[p.usingChatModel]; if(m && /deepseek/i.test(m.id)) entries.push({name:p.name,baseUrl:p.baseUrl,apiKey:p.apiKey,model:{id:m.id,contextWindow:m.contextWindow,maxTokens:m.maxTokens}});}
    });}); if(entries.length!==1 || !entries[0].apiKey) throw new Error("Expected one configured huoshan DeepSeek model"); print(JSON.stringify(entries[0]));
  ' > "$secret_dir/model.json"
  chmod 600 "$secret_dir/model.json"
  docker exec develop-llm-1 node -e 'process.stdout.write(process.env.COPILOT_MODEL_PROFILES || "{}")' > "$secret_dir/profiles.json"
else
  echo '{}' > "$secret_dir/model.json"
  echo '{}' > "$secret_dir/profiles.json"
fi
# Mongo has no host ports. Its bridge supplies model egress to the runtime,
# which shares loopback; no connection is made to development data from it.
docker run -d --name "$mongo_name" --tmpfs /data/db mongo:5 \
  mongod --replSet l1 --bind_ip 127.0.0.1 --quiet >/dev/null
ready=false
for attempt in {1..50}; do
  if docker exec "$mongo_name" mongo --quiet --eval 'db.adminCommand({ping:1}).ok' >/dev/null 2>&1; then ready=true; break; fi
  sleep 0.2
done
[[ "$ready" == true ]] || { echo 'L1 isolated Mongo failed' >&2; exit 1; }
docker exec "$mongo_name" mongo --quiet --eval 'rs.initiate({_id:"l1",members:[{_id:0,host:"127.0.0.1:27017"}]})' >/dev/null
docker run -d --name "$tex_name" --network none --read-only --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,nosuid,size=512m --memory 1g --cpus 2 --pids-limit 128 \
  -v "$out/compiler:/spool" -v "$root/services/llm/harness-checks/l1/compiler.py:/compiler.py:ro" \
  --entrypoint python3 "$tex_image" /compiler.py >/dev/null
docker run --rm --name "$runtime_name" --network "container:$mongo_name" --user root \
  -v "$root/services/llm/app:/overleaf/services/llm/app:ro" \
  -v "$root/services/llm/config:/overleaf/services/llm/config:ro" \
  -v "$root/services/llm/tsconfig.json:/overleaf/services/llm/tsconfig.json:ro" \
  -v "$root/services/llm/harness-checks/l1:/overleaf/services/llm/harness-checks/l1:ro" \
  -v "$root/services/web/app/src/Features/Copilot:/overleaf/services/web/app/src/Features/Copilot:ro" \
  -v "$root/libraries/copilot-contracts:/overleaf/libraries/copilot-contracts:ro" \
  -v "$root/libraries/settings:/overleaf/libraries/settings:ro" \
  -v "$out:/output" -v "$out/compiler:/spool" -v "$secret_dir:/secrets:ro" \
  -e L1_MODE="$mode" -e L1_CASES="$case_ids" \
  -e MONGO_URL='mongodb://127.0.0.1:27017/copilot_l1?replicaSet=l1' \
  -e COPILOT_AGENT_RECURSION_LIMIT=12 -e COPILOT_TURN_TIMEOUT_MS=300000 \
  -e COPILOT_QDRANT_URL= -e COPILOT_EMBEDDING_URL= \
  --entrypoint sh "$runtime_image" -c \
  'ln -sfn /overleaf/libraries/copilot-contracts /overleaf/node_modules/@overleaf/copilot-contracts && /overleaf/node_modules/.bin/tsc -p harness-checks/l1/tsconfig.json && node --import tsx harness-checks/l1/run.ts'

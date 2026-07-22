FROM node:22-bookworm AS base

WORKDIR /overleaf/services/llm
RUN npm config set registry https://registry.npmmirror.com


FROM base AS app

COPY package.json package-lock.json /overleaf/
COPY services/llm/package.json /overleaf/services/llm/
COPY libraries/ /overleaf/libraries/

# Install only the llm workspace subtree (+ its linked libraries/*). A full
# root install builds unrelated services' native modules (pprof) which have
# no Node 22 support. --ignore-scripts skips the root patch-package
# postinstall (patches only affect web/filestore deps); none of the patched
# packages are in llm's dependency subtree.
RUN cd /overleaf && npm install --workspace=services/llm --ignore-scripts

COPY services/llm/ /overleaf/services/llm/

# Compile TypeScript (also serves as a build-time type check). The dev
# container overrides this with `tsx watch app.ts` against bind-mounted
# sources, so dist/ only matters for the image CMD.
RUN cd /overleaf/services/llm && npx tsc -p tsconfig.json

FROM app
USER node
CMD ["node", "dist/app.js"]

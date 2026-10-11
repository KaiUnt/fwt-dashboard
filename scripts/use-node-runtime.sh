#!/bin/bash
# Source this file before installing dependencies or building this project.
FWT_PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
FWT_NODE_BIN="$FWT_PROJECT_DIR/.runtime/node/bin"

if [ -x "$FWT_NODE_BIN/node" ]; then
    export PATH="$FWT_NODE_BIN:$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
    echo "Node.js 22+ is required; install Node.js 24 LTS in $FWT_PROJECT_DIR/.runtime/node." >&2
    return 1
fi

node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Node.js 22+ is required. Install a project-local Node.js 24 LTS runtime before deploying."); process.exit(1); }' || return 1
echo "Using Node.js $(node --version) from $(command -v node)"

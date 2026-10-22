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

if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required before deployment; install a complete Node.js runtime including npm." >&2
    return 1
fi

if ! FWT_NPM_VERSION="$(npm --version 2>&1)"; then
    echo "npm could not start; repair the Node.js runtime and preserve its npm/npx symlinks before deploying." >&2
    printf '%s\n' "$FWT_NPM_VERSION" >&2
    return 1
fi

echo "Using Node.js $(node --version) from $(command -v node)"
echo "Using npm $FWT_NPM_VERSION from $(command -v npm)"

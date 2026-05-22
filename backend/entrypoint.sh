#!/bin/bash
set -e

# Ensure volume-mounted directories are writable by appuser
# (Docker volumes are created as root by default)
if [ -d /app/uploads ] && [ ! -w /app/uploads ]; then
    echo "Fixing uploads permissions..."
fi

# Ensure .claude directory exists for Agent SDK credentials
mkdir -p "$HOME/.claude"

exec "$@"

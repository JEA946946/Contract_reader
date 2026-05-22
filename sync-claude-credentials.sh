#!/bin/bash
# Sync Claude Code OAuth credentials from local Keychain to the server container.
# Run this when the reader backend reports authentication errors.
# The local Claude Code CLI auto-refreshes tokens; this script copies them to the server.
#
# Usage: ./sync-claude-credentials.sh

set -e

SERVER="root@144.76.60.47"
CONTAINER="hotelprice_reader_app"

# Extract credentials from macOS Keychain
CREDS=$(security find-generic-password -a "$(whoami)" -s "Claude Code-credentials" -w 2>/dev/null)
if [ -z "$CREDS" ]; then
    echo "ERROR: Could not read Claude Code credentials from Keychain"
    exit 1
fi

# Check token expiry
HOURS_LEFT=$(echo "$CREDS" | python3 -c "
import sys, json, time
d = json.loads(sys.stdin.read())
exp = d.get('claudeAiOauth', {}).get('expiresAt', 0)
now = int(time.time() * 1000)
print(f'{(exp - now) / 3600000:.1f}')
")
echo "Token valid for ${HOURS_LEFT} hours"

# Push to server
echo "$CREDS" | ssh "$SERVER" "
cat > /tmp/_creds.json
docker cp /tmp/_creds.json ${CONTAINER}:/home/appuser/.claude/.credentials.json
docker exec -u root ${CONTAINER} chown appuser:appuser /home/appuser/.claude/.credentials.json
docker exec -u root ${CONTAINER} chmod 600 /home/appuser/.claude/.credentials.json
rm /tmp/_creds.json
"

echo "Credentials synced to ${CONTAINER}"

#!/bin/bash
# Double-click to start the local preview server for the S/SF Location Atlas.
# portable: works on any Mac, any user, wherever this folder is copied
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")" || exit 1

echo "============================================"
echo "  S/SF Location Atlas — local preview"
echo "  Opening http://localhost:8099 ..."
echo ""
echo "  KEEP THIS WINDOW OPEN while you work."
echo "  Press  Control+C  to stop the server."
echo "============================================"
echo ""

# open the browser a moment after the server comes up
( sleep 1 && open "http://localhost:8099" ) &

python3 -m http.server 8099 --directory site

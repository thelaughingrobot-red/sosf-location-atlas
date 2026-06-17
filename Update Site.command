#!/bin/bash
# Double-click AFTER editing the Google Sheet to pull changes and rebuild the site.
# portable: works on any Mac, any user, wherever this folder is copied
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")" || exit 1

echo "============================================"
echo "  Updating from the Google Sheet ..."
echo "============================================"
echo ""

node update.js

echo ""
echo "============================================"
echo "  Done. Hard-refresh your browser:  Cmd+Shift+R"
echo "  (You can close this window.)"
echo "============================================"

#!/bin/bash
# Double-click this on a Mac to preview the app locally.
# Opening index.html straight from Finder does not work: browsers refuse to
# fetch() the data/*.json files over file:// URLs. A tiny local web server
# sidesteps that entirely.
cd "$(dirname "$0")" || exit 1
PORT=8000
while lsof -i ":$PORT" >/dev/null 2>&1; do PORT=$((PORT+1)); done
echo "Serving $(pwd) at http://localhost:$PORT"
echo "Press Ctrl-C in this window to stop."
( sleep 1; open "http://localhost:$PORT" ) &
python3 -m http.server "$PORT"

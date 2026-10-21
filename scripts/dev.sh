#!/usr/bin/env bash
# Accept --port <n> from harness; default 8080
PORT=8080
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --port=*) PORT="${1#*=}"; shift ;;
    *) shift ;;
  esac
done
exec python3 -m http.server "$PORT"

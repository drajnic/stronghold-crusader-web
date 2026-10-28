#!/bin/sh
set -eu
cd "$(dirname "$0")"
if command -v pnpm >/dev/null 2>&1; then
  exec pnpm dev "$@"
fi
printf '%s\n' 'pnpm was not found on PATH. Install Node.js 22.13+ (22.x) or 24+ and pnpm 11.25.0, then run pnpm install --frozen-lockfile and ./start.sh.' >&2
exit 1

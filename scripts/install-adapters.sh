#!/usr/bin/env bash
# Deploy the goofish adapters into OpenCLI's local-override directory.
#
# OpenCLI (v1.8.7, dist/src/cli.js listJsFiles) walks ~/.opencli/clis with
# readdirSync({ withFileTypes: true }) and keeps only entries that are a real
# directory or a real .js file. A symlink is neither, so a symlinked site dir
# is silently never loaded. Commands register under the adapter's `site:`
# field, not the directory name, so the `xianyu` alias is a second real copy
# with that one line rewritten.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${GOOFISH_ADAPTER_SRC:-$ROOT/clis/goofish}"
DEST_ROOT="${OPENCLI_CLIS_DIR:-$HOME/.opencli/clis}"
ALIASES="${GOOFISH_SITE_ALIASES:-xianyu}"
OPENCLI="${OPENCLI_BIN:-opencli}"

for f in "$SRC"/*.js; do node --check "$f"; done

install_site() {
  local site="$1" dest="$DEST_ROOT/$1" n=0
  if [ -L "$dest" ]; then
    echo "replacing symlink $dest (OpenCLI never loaded it)"
    rm "$dest"
  fi
  mkdir -p "$dest"
  for f in "$SRC"/*.js; do
    if [ "$site" = "goofish" ]; then
      cp -p "$f" "$dest/$(basename "$f")"
    else
      sed "s/^\([[:space:]]*site:[[:space:]]*\)'goofish'/\1'$site'/" "$f" > "$dest/$(basename "$f")"
    fi
    n=$((n + 1))
  done
  echo "installed $n adapters -> $dest (site: $site)"
}

install_site goofish
for alias in $ALIASES; do install_site "$alias"; done

"$OPENCLI" daemon restart >/dev/null 2>&1 || true
sleep 1
# The receipt is OpenCLI's own command list, not the copy's exit code.
for site in goofish $ALIASES; do
  if "$OPENCLI" list 2>/dev/null | grep -A30 "^  $site\$" | grep -q '^    whoami '; then
    echo "receipt: opencli $site whoami is registered"
  else
    echo "FAIL: 'opencli list' does not show '$site whoami' — OpenCLI did not load $DEST_ROOT/$site" >&2
    exit 1
  fi
done

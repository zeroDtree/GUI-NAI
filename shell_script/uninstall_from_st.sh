#!/usr/bin/env bash
# Remove the NekoAI SillyTavern extension and server plugin code.
# plugins/nekoai-gui/data and config.json stay unless --purge is passed.
set -euo pipefail

source "$(dirname "$0")/common.sh"

usage() {
  cat <<'EOF'
Usage: uninstall_from_st.sh [options] ST_ROOT

Remove the NekoAI UI extension and server plugin code.
ST_ROOT is the SillyTavern install directory and is required.

Options:
  --purge     Also delete plugins/nekoai-gui/data and config.json
  --dry-run   Print actions without writing
  -h, --help  Show this help

enableServerPlugins is left unchanged. Other server plugins may still need it.
A previous install may have saved config.yaml.bak.nekoai.
EOF
}

PURGE=0
DRY_RUN=0
ST_ARG=

while [[ $# -gt 0 ]]; do
  case "$1" in
    --purge) PURGE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    --) shift; break ;;
    -*) die "unknown option: $1" ;;
    *)
      [[ -z "$ST_ARG" ]] || die "unexpected argument: $1"
      ST_ARG=$1
      ;;
  esac
  shift
done

export DRY_RUN
ST=$(resolve_st_root "$ST_ARG")
DATA=$(data_root_of "$ST")
GLOBAL="$ST/public/scripts/extensions/third-party/$EXTENSION_NAME"
PLUGIN=$(plugin_dest "$ST")

if [[ -e "$GLOBAL" || -L "$GLOBAL" ]]; then
  remove_extension "$GLOBAL"
fi

if [[ -d "$DATA" ]]; then
  while IFS= read -r handle; do
    dest="$DATA/$handle/extensions/$EXTENSION_NAME"
    if [[ -e "$dest" || -L "$dest" ]]; then
      remove_extension "$dest"
    fi
  done < <(list_user_handles "$DATA")
fi

if [[ -e "$PLUGIN" || -L "$PLUGIN" ]]; then
  remove_plugin_code "$PLUGIN" "$PURGE"
else
  info "no plugin directory at $PLUGIN"
fi

info "NekoAI uninstalled from $ST"
info "enableServerPlugins was not changed."

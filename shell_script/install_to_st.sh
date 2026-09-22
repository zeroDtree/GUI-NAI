#!/usr/bin/env bash
# Install the NekoAI SillyTavern extension and server plugin.
# Re-running updates code and keeps plugins/nekoai-gui/data and config.json.
set -euo pipefail

source "$(dirname "$0")/common.sh"

usage() {
  cat <<'EOF'
Usage: install_to_st.sh [options] ST_ROOT

Copy the built UI extension and server plugin into SillyTavern.
ST_ROOT is the SillyTavern install directory and is required.

Options:
  --build         Run pnpm build:st before copying
  --user HANDLE   Install the UI for one account under data/<handle>/extensions
                  Default: all users, public/scripts/extensions/third-party
  --no-config     Do not set enableServerPlugins: true
  --dry-run       Print actions without writing
  -h, --help      Show this help

User data in plugins/nekoai-gui/data and config.json is never overwritten.
EOF
}

DO_BUILD=0
NO_CONFIG=0
DRY_RUN=0
USER_HANDLE=
ST_ARG=

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build) DO_BUILD=1 ;;
    --user)
      shift
      [[ $# -gt 0 ]] || die "--user needs a handle"
      USER_HANDLE=$1
      ;;
    --no-config) NO_CONFIG=1 ;;
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

if [[ -n "$USER_HANDLE" && ! "$USER_HANDLE" =~ ^[A-Za-z0-9._-]+$ ]]; then
  die "invalid user handle: $USER_HANDLE"
fi

export DRY_RUN
REPO=$(repo_root)
ST=$(resolve_st_root "$ST_ARG")
DIST="$REPO/packages/st-nekoai/dist"
EXT_DEST=$(extension_dest "$ST" "$USER_HANDLE")
PLUGIN_DEST=$(plugin_dest "$ST")

if [[ "$DO_BUILD" == 1 ]]; then
  info "building st-nekoai"
  if [[ "$DRY_RUN" == 1 ]]; then
    info "+ pnpm build:st"
  else
    (cd "$REPO" && pnpm build:st)
  fi
fi
require_dist "$REPO"

if [[ "$NO_CONFIG" == 0 ]]; then
  config="$ST/config.yaml"
  if grep -qE '^enableServerPlugins:[[:space:]]*true[[:space:]]*(#.*)?$' "$config"; then
    info "enableServerPlugins already true"
  elif [[ "$DRY_RUN" == 1 ]]; then
    info "+ set enableServerPlugins: true in $config"
  else
    backup="${config}.bak.nekoai"
    [[ -f "$backup" ]] || cp "$config" "$backup"
    if grep -qE '^enableServerPlugins:' "$config"; then
      if [[ "$(uname -s)" == Darwin ]]; then
        sed -i '' -E 's/^enableServerPlugins:.*/enableServerPlugins: true/' "$config"
      else
        sed -i -E 's/^enableServerPlugins:.*/enableServerPlugins: true/' "$config"
      fi
    else
      printf '\nenableServerPlugins: true\n' >> "$config"
    fi
    info "set enableServerPlugins: true (backup: ${backup})"
  fi
fi

# One copy only. The same folder name in two places loads the UI twice.
DATA=$(data_root_of "$ST")
GLOBAL_EXT="$ST/public/scripts/extensions/third-party/$EXTENSION_NAME"
if [[ "$GLOBAL_EXT" != "$EXT_DEST" && ( -e "$GLOBAL_EXT" || -L "$GLOBAL_EXT" ) ]]; then
  info "removing the other NekoAI UI copy so it is not loaded twice: $GLOBAL_EXT"
  remove_extension "$GLOBAL_EXT"
fi
if [[ -d "$DATA" ]]; then
  while IFS= read -r handle; do
    candidate="$DATA/$handle/extensions/$EXTENSION_NAME"
    if [[ "$candidate" != "$EXT_DEST" && ( -e "$candidate" || -L "$candidate" ) ]]; then
      info "removing the other NekoAI UI copy so it is not loaded twice: $candidate"
      remove_extension "$candidate"
    fi
  done < <(list_user_handles "$DATA")
fi

copy_extension "$DIST/extension" "$EXT_DEST"
copy_plugin_code "$DIST/plugin" "$PLUGIN_DEST"

info "installed NekoAI"
info "  extension: $EXT_DEST"
info "  plugin:    $PLUGIN_DEST"
info "Restart SillyTavern, enable NekoAI in the Extensions panel, then open the palette button or run /nekoai."
info "Token stays in $PLUGIN_DEST/config.json (or NOVELAI_TOKEN). Presets and images stay in $PLUGIN_DEST/data."

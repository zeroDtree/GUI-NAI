#!/usr/bin/env bash
# Shared helpers for the SillyTavern install and uninstall scripts.

EXTENSION_NAME=nekoai-gui
PLUGIN_FILES=(index.mjs package.json)

repo_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '%s\n' "$*"
}

run() {
  if [[ "${DRY_RUN:-0}" == 1 ]]; then
    printf '+ %s\n' "$*"
    return 0
  fi
  "$@"
}

is_st_root() {
  local root=$1
  [[ -f "$root/config.yaml" && -f "$root/package.json" ]] || return 1
  grep -qiE '"name"[[:space:]]*:[[:space:]]*"sillytavern"' "$root/package.json"
}

resolve_st_root() {
  local arg=${1:-} abs
  [[ -n "$arg" ]] || die "SillyTavern path is required."
  [[ -d "$arg" ]] || die "directory not found: $arg"
  abs=$(cd "$arg" && pwd)
  is_st_root "$abs" || die "not a SillyTavern root (config.yaml + package.json name sillytavern): $abs"
  printf '%s\n' "$abs"
}

data_root_of() {
  local st=$1 line value
  line=$(grep -E '^dataRoot:[[:space:]]*[^#[:space:]]+' "$st/config.yaml" | head -n 1 || true)
  value=${line#dataRoot:}
  value=${value%%#*}
  value=$(printf '%s' "$value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/^["'\'']//; s/["'\'']$//')
  [[ -n "$value" ]] || value=./data
  if [[ "$value" != /* ]]; then
    value="$st/$value"
  fi
  if [[ -d "$value" ]]; then
    (cd "$value" && pwd)
  else
    printf '%s\n' "$value"
  fi
}

extension_dest() {
  local st=$1 user=${2:-}
  if [[ -n "$user" ]]; then
    printf '%s\n' "$(data_root_of "$st")/$user/extensions/$EXTENSION_NAME"
  else
    printf '%s\n' "$st/public/scripts/extensions/third-party/$EXTENSION_NAME"
  fi
}

plugin_dest() {
  printf '%s\n' "$1/plugins/$EXTENSION_NAME"
}

is_our_extension() {
  local dir=$1
  [[ -f "$dir/manifest.json" ]] && grep -q '"display_name"[[:space:]]*:[[:space:]]*"NekoAI"' "$dir/manifest.json"
}

is_our_plugin() {
  local dir=$1
  [[ -f "$dir/.nekoai-managed" || -f "$dir/package.json" ]] || return 1
  [[ -f "$dir/package.json" ]] && grep -q '"name"[[:space:]]*:[[:space:]]*"nekoai-gui"' "$dir/package.json" && return 0
  [[ -f "$dir/.nekoai-managed" ]]
}

list_user_handles() {
  local root=$1 dir base
  [[ -d "$root" ]] || return 0
  for dir in "$root"/*; do
    [[ -d "$dir" ]] || continue
    base=$(basename "$dir")
    [[ "$base" == _* || "$base" == .* ]] && continue
    if [[ -f "$dir/settings.json" || -d "$dir/characters" || -d "$dir/chats" || -d "$dir/extensions" ]]; then
      printf '%s\n' "$base"
    fi
  done
}

require_dist() {
  local root=$1 file
  local files=(
    packages/st-nekoai/dist/extension/manifest.json
    packages/st-nekoai/dist/extension/bootstrap.js
    packages/st-nekoai/dist/extension/index.js
    packages/st-nekoai/dist/extension/index.css
    packages/st-nekoai/dist/plugin/index.mjs
    packages/st-nekoai/dist/plugin/package.json
  )
  for file in "${files[@]}"; do
    [[ -f "$root/$file" ]] || die "missing $file. Run pnpm build:st, or pass --build."
  done
}

copy_extension() {
  local src=$1 dest=$2
  run mkdir -p "$(dirname "$dest")"
  if [[ -L "$dest" ]]; then
    run rm "$dest"
  fi
  run mkdir -p "$dest"
  if [[ "${DRY_RUN:-0}" == 1 ]]; then
    info "+ rsync -a --delete $src/ $dest/"
    return 0
  fi
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$src/" "$dest/"
  else
    find "$dest" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp -R "$src/." "$dest/"
  fi
}

copy_plugin_code() {
  local src=$1 dest=$2
  run mkdir -p "$dest"
  run cp "$src/index.mjs" "$dest/index.mjs"
  run cp "$src/package.json" "$dest/package.json"
  if [[ "${DRY_RUN:-0}" == 1 ]]; then
    info "+ write $dest/.nekoai-managed"
  else
    printf 'gui-nai\n' > "$dest/.nekoai-managed"
  fi
}

remove_extension() {
  local dest=$1
  [[ -e "$dest" || -L "$dest" ]] || return 0
  if [[ -e "$dest" ]]; then
    is_our_extension "$dest" || die "refusing to remove $dest (manifest is not NekoAI)"
  fi
  # rm on a symlink deletes the link, not the target.
  run rm -rf "$dest"
  info "removed $dest"
}

remove_plugin_code() {
  local dest=$1 purge=$2
  [[ -e "$dest" || -L "$dest" ]] || return 0
  if [[ -L "$dest" ]]; then
    run rm "$dest"
    info "removed symlink $dest"
    return 0
  fi
  is_our_plugin "$dest" || die "refusing to remove $dest (not the NekoAI plugin)"
  if [[ "$purge" == 1 ]]; then
    run rm -rf "$dest"
    info "purged $dest (including data and config.json)"
    return 0
  fi
  local file
  for file in index.mjs package.json .nekoai-managed; do
    [[ -e "$dest/$file" ]] && run rm -f "$dest/$file"
  done
  info "removed plugin code in $dest"
  if [[ -d "$dest/data" || -f "$dest/config.json" ]]; then
    info "kept $dest/data and config.json (pass --purge to delete them)"
  elif [[ -d "$dest" ]]; then
    run rmdir "$dest" 2>/dev/null || true
  fi
}

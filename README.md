# GUI-NAI

NovelAI UI for [Cordis](https://github.com/cordiverse/cordis), via [`nekoai-js`](https://www.npmjs.com/package/nekoai-js). The API token stays in the local Node process.

The same screens run in [SillyTavern](https://github.com/SillyTavern/SillyTavern) as an extension and a small server plugin.

## Features

| Path | |
| --- | --- |
| `/generate` | Image generation and named presets |
| `/director` | Line art, background removal, colorize, emotion, and other Director tools |
| `/upscale` | 2× / 4× and Enhance |
| `/text` | `chat` · `chatStream` · `completion` |
| `/inspect` | Image metadata |
| `/history` | Gallery |
| `/nai-settings` | Host, timeout, retry, token |

Images are stored in `data/nekoai-gui/` (Cordis) or `plugins/nekoai-gui/data/` (SillyTavern).

## Standalone

Node.js and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm start
```

`pnpm dev` opens [127.0.0.1:3140](http://127.0.0.1:3140) (port in [`app.yml`](app.yml)). After editing `packages/nekoai-gui/client`, run `pnpm build`.

**Token.** `NOVELAI_TOKEN`, then `nekoai-gui.config.token` in `app.yml`, then the value saved in NekoAI Settings. Do not commit a real token.

## SillyTavern

```bash
./shell_script/install_to_st.sh --build /path/to/SillyTavern
```

`ST_ROOT` is a SillyTavern tree (`config.yaml`, package name `sillytavern`). `--build` runs `pnpm build:st`.

That command turns on `enableServerPlugins` (backup: `config.yaml.bak.nekoai`), installs the UI for every account at `public/scripts/extensions/third-party/nekoai-gui`, and installs the plugin at `plugins/nekoai-gui`. Any extra UI copy is removed so NekoAI loads once. Running it again refreshes code and keeps `data/` and `config.json`.

| Flag | |
| --- | --- |
| `--user HANDLE` | One account, at `data/<handle>/extensions/nekoai-gui` |
| `--no-config` | Leave `enableServerPlugins` as it is |
| `--dry-run` | Print only |

Restart SillyTavern, enable **NekoAI**, then use the palette button or `/nekoai`.

```bash
./shell_script/uninstall_from_st.sh /path/to/SillyTavern
./shell_script/uninstall_from_st.sh --purge /path/to/SillyTavern
```

The first removes extension and plugin code. `--purge` also deletes presets, images, and the saved token. `enableServerPlugins` stays unchanged.

**Token.** `NOVELAI_TOKEN`, or `plugins/nekoai-gui/config.json`. Keep that data directory separate from the Cordis `dataDir`.

The UI follows SillyTavern's language, or Chinese / English chosen on the settings page.

`[img-gen]prompt[/img-gen]` adds a generate button on that message. `/nekoai [prompt]` opens the panel. The palette button copies the message into Generate.

## Layout

- `packages/nekoai-gui` — Cordis plugin and shared host
- `packages/st-nekoai` — SillyTavern extension and server plugin
- `shell_script/` — install and uninstall

## License

AGPL-3.0

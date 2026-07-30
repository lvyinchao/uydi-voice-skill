---
name: uydi-voice
description: >
  Design AI voices, clone voices from audio samples, and synthesize speech using the
  Uydi voice platform (https://uydi.com). Use this skill when the user asks to create
  or design a custom voice, clone their own voice from a recording, convert text to
  speech / generate narration audio, list or manage their Uydi voices, check their
  Uydi credits, or review their synthesis history. Requires Node.js 18+ and a one-time
  OAuth login in the browser.
---

# Uydi Voice

Use the Uydi voice platform from any agent: voice design (text description → new voice),
voice cloning (audio sample → digital voice), and text-to-speech synthesis, all through
a single zero-dependency CLI script.

## Requirements

- Node.js 18 or newer (`node --version`) — the script uses only built-in modules.
- A Uydi account (register free at https://uydi.com).
- All commands run as: `node scripts/uydi.mjs <command>` (relative to this skill directory).

## First-time login (one-time, needs the user)

Authentication uses OAuth; the token is stored in `~/.uydi/credentials.json` (mode 600)
and stays valid for 365 days.

```bash
node scripts/uydi.mjs login
```

- Default: opens the browser for the user to approve access (authorization code + PKCE
  with a local loopback callback).
- Headless / no browser: automatically falls back to a device code flow — the terminal
  prints a URL (https://uydi.com/activate) and an 8-character code (`XXXX-XXXX`) for the
  user to enter on any device. Use `login --device` to force this mode.
- IMPORTANT: the login must be completed by the human user in a browser. If a command
  fails with a 401 / "Not logged in" error, ask the user to run the login and wait.

## Commands

```bash
node scripts/uydi.mjs whoami                # current account
node scripts/uydi.mjs credits               # credit balance and pricing
node scripts/uydi.mjs voices                # list voices (id, kind, name, status)
node scripts/uydi.mjs delete-voice <id>     # delete a voice permanently

# Design a brand-new voice from a text description (costs credits;
# --name, --prompt and --preview-text are all required):
node scripts/uydi.mjs design --name "Warm Narrator" \
  --prompt "A warm, deep male narrator voice, slow pace, documentary style" \
  --preview-text "Hello, this is a preview." -o preview.wav

# Clone a voice from a 10-20s clean speech sample (wav/mp3/m4a, costs credits):
node scripts/uydi.mjs clone --name "My Voice" --file sample.wav

# Synthesize speech with any voice (1 credit / 10 chars, max 2000 chars per run):
node scripts/uydi.mjs tts --voice <voiceId> --text "Text to speak, any language." -o out.wav

node scripts/uydi.mjs history --limit 10    # recent syntheses
node scripts/uydi.mjs logout                # revoke token + delete local credentials
```

Optional flags: `--provider qwen|cosyvoice` on design/clone (default `qwen`, the
general-purpose multilingual engine; `cosyvoice` focuses on dialects).

## Typical workflows

1. **Narration from scratch**: `design` a voice matching the user's description →
   `tts` the script text → deliver the WAV file.
2. **Speak in the user's own voice**: ask for a 10–20 s clean recording → `clone` →
   `tts` with the new voice id.
3. **Reuse an existing voice**: `voices` to find the id → `tts`.

## Security & trust

- The CLI is a single zero-dependency script (`scripts/uydi.mjs`, Node.js built-ins only)
  — fully auditable before running, no install step, no postinstall hooks.
- Downloads can be verified: `https://uydi.com/downloads/uydi-voice-skill.zip.sha256`
  holds the SHA-256 of the official zip (`shasum -a 256 -c` after download).
- The token only grants access to the user's own Uydi voices/credits; it never touches
  the account password. The user can revoke it anytime with `logout` or from the website.
- Approval always happens on uydi.com in the user's browser; the script never asks for
  or handles the account password.

## Notes

- Every design / clone / tts call consumes real credits from the user's account
  (`credits` shows pricing). Confirm with the user before large batch synthesis.
- Voice slots are limited per plan (free: 1 voice, Pro: 5). If design/clone fails with a
  quota error, list voices with `voices` and ask the user which one to `delete-voice`.
- Voice cloning requires the user to own the voice or have explicit permission.
- Output audio is WAV. Text over 2000 characters must be split into multiple `tts` runs.
- Set `UYDI_BASE_URL` to target a different deployment (e.g. a local dev server).

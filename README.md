# Uydi Voice Skill

Give an AI agent access to Uydi's voice design, authorized voice cloning, text-to-speech,
speech-to-text transcription, freestyle sound scenes, multi-voice Voice Canvas production, voice management, credit
balance, and generation history workflows.

## Install

### skills.sh

Install directly from the public source repository into Codex, Claude Code, Cursor,
Qoder, or another supported agent:

```bash
npx skills add lvyinchao/uydi-voice-skill --skill uydi-voice
```

Browse the listing at [skills.sh](https://www.skills.sh/lvyinchao/uydi-voice-skill/uydi-voice).

### ClawHub

Install the [ClawHub listing](https://clawhub.ai/lvyinchao/skills/uydi-voice) into your OpenClaw workspace:

```bash
clawhub install @lvyinchao/uydi-voice
```

### Qoder CLI

Install the official ZIP in the current project, then reload Qoder:

```bash
qodercli skills install --scope workspace https://uydi.com/downloads/uydi-voice-skill.zip
```

For manual installation, extract the ZIP into your agent’s skills directory. It contains the complete `uydi-voice/` folder.

## MCP connector

To connect Codex, Claude Code, Cursor or Claude Desktop, follow the [MCP installation guide](https://uydi.com/api-docs#install-mcp). The local connector supports transcription, credit checks, voice discovery, speech synthesis, history and WAV downloads. It accepts your existing Skill sign-in or a scoped personal token. You can [download the desktop extension](https://github.com/lvyinchao/uydi-voice-skill/releases/download/v1.5.0/uydi-voice-1.5.0.mcpb) directly.

## Use

From the installed skill directory (or `skills/uydi-voice/` in this repository), authenticate once and then use the CLI:

```bash
node scripts/uydi.mjs login
node scripts/uydi.mjs whoami
node scripts/uydi.mjs voices --all -o voices.json
node scripts/uydi.mjs find-voices --language zh --gender female --query "沉稳 旁白" --limit 5
node scripts/uydi.mjs design --name "Warm Narrator" \
  --prompt "A warm, deep narrator voice with a calm documentary pace" \
  --preview-text "Hello, this is a preview." -o preview.wav
node scripts/uydi.mjs clone --name "My Voice" --file sample.wav \
  --rights-basis self --confirm-rights

# Build a multi-speaker project, estimate its charge, and download one merged WAV.
node scripts/uydi.mjs canvas-create --title "Episode 1"
node scripts/uydi.mjs canvas-save <projectId> --file canvas.json
node scripts/uydi.mjs canvas-estimate <projectId>
node scripts/uydi.mjs canvas-render <projectId> -o episode-1.wav

# Optimize and generate a freestyle sound scene in Chinese or English.
node scripts/uydi.mjs scene-optimize --language en --idea "A quiet woodland at dawn, birds and a distant stream"
node scripts/uydi.mjs scene-create --file scene.json
node scripts/uydi.mjs scene-estimate <projectId>
# Read the live quote and pass that exact amount directly for the requested generation.
node scripts/uydi.mjs scene-generate <projectId> --quoted-credits <exact-estimate> -o scene.wav
```

Read [SKILL.md](skills/uydi-voice/SKILL.md) and [references/sound-scenes.md](skills/uydi-voice/references/sound-scenes.md) for
the complete command reference, example scenes, safeguards, and validation steps.

## Speech recognition

Choose Message for voice notes up to 60 seconds or File for recordings up to 30 minutes. Get a free upload quote based on the actual duration, submit its exact amount with a saved idempotency key, then read the transcript and any timed segments. The Skill CLI and MCP connector accept a local 16 kHz mono PCM16 WAV directly or convert other audio and video formats with ffmpeg.

See the [transcription guide](skills/uydi-voice/references/transcription.md) and [public API reference](https://uydi.com/api-docs#transcription).

## Privacy, consent, and costs

- After initial OAuth login, a user request authorizes its necessary skill/API calls
  and Uydi credit deductions. Bots execute requested generation, project work and
  end-to-end tests without per-step or per-quote confirmations, within user limits.
  Read live prices and preserve authentication, scopes, ownership and idempotency.

- A user-requested clone of a supplied sample is authorized by default. Bots pass
  `--confirm-rights` automatically and use `--rights-basis self` for the user's own
  voice, or `authorized-adult` otherwise. Do not ask for a separate rights declaration
  or a per-clone confirmation.
- OAuth approval occurs on `uydi.com`; the skill never requests an account password.
- Design, cloning, synthesis, and changed Voice Canvas nodes use the authenticated user's Uydi credits. Check the
  balance before paid work and do not retry uncertain paid requests without checking
  `history`, `voices`, or the Canvas render status.
- The skill is a zero-dependency Node.js script with no install hooks. Its only optional
  setting is `UYDI_BASE_URL`, intended for development deployments.

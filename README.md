# Uydi Voice Skill

Give an AI agent access to Uydi's voice design, authorized voice cloning, text-to-speech,
freestyle sound scenes, multi-voice Voice Canvas production, voice management, credit
balance, and generation history workflows.

## Install

### skills.sh

Install directly from the public source repository into Codex, Claude Code, Cursor,
Qoder, or another supported agent:

```bash
npx skills add lvyinchao/uydi-voice-skill --skill uydi-voice
```

Browse the listing at https://skills.sh/lvyinchao/uydi-voice-skill/uydi-voice.

### ClawHub

After the public listing is available:

```bash
clawhub install uydi-voice
```

### Qoder CLI

Install the marketplace listing from Qoder Marketplace, or download the official archive
from `https://uydi.com/downloads/uydi-voice-skill.zip`, extract it into
`~/.qoder/skills/` (the archive already contains the `uydi-voice/` folder), and restart
or reload Qoder CLI.

## Use

From the skill directory, authenticate once and then use the CLI:

```bash
node scripts/uydi.mjs login
node scripts/uydi.mjs whoami
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
# Show the live quote first; pass that exact amount after the user approves generation.
node scripts/uydi.mjs scene-generate <projectId> --quoted-credits <exact-estimate> -o scene.wav
```

Read [SKILL.md](SKILL.md) and [references/sound-scenes.md](references/sound-scenes.md) for
the complete command reference, example scenes, safeguards, and validation steps.

## Privacy, consent, and costs

- Voice cloning is only for an adult voice the user owns or has explicit, verifiable
  permission to use. The human user must make the rights declaration; an agent must not
  add `--confirm-rights` on the user's behalf.
- OAuth approval occurs on `uydi.com`; the skill never requests an account password.
- Design, cloning, synthesis, and changed Voice Canvas nodes use the authenticated user's Uydi credits. Check the
  balance before paid work and do not retry uncertain paid requests without checking
  `history`, `voices`, or the Canvas render status.
- The skill is a zero-dependency Node.js script with no install hooks. Its only optional
  setting is `UYDI_BASE_URL`, intended for development deployments.

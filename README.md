# Uydi Voice Skill

Give an AI agent access to Uydi's voice design, authorized voice cloning, text-to-speech,
multi-voice Voice Canvas production, voice management, credit balance, and generation
history workflows.

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

### Qoder

Install the marketplace listing from Qoder Marketplace, or download the official archive
from `https://uydi.com/downloads/uydi-voice-skill.zip`, extract it into
`~/.qoder/skills/uydi-voice`, and restart or reload Qoder.

## Use

From the skill directory, authenticate once and then use the CLI:

```bash
node scripts/uydi.mjs login
node scripts/uydi.mjs whoami
node scripts/uydi.mjs design --name "Warm Narrator" \
  --prompt "A warm, deep narrator voice with a calm documentary pace" \
  --preview-text "Hello, this is a preview." -o preview.wav

# Build a multi-speaker project, estimate its charge, and download one merged WAV.
node scripts/uydi.mjs canvas-create --title "Episode 1"
node scripts/uydi.mjs canvas-save <projectId> --file canvas.json
node scripts/uydi.mjs canvas-estimate <projectId>
node scripts/uydi.mjs canvas-render <projectId> -o episode-1.wav
```

Read [SKILL.md](skills/uydi-voice/SKILL.md) for the complete command reference, safeguards, and validation
steps.

## Privacy, consent, and costs

- Voice cloning is only for a voice the user owns or has explicit permission to use.
- OAuth approval occurs on `uydi.com`; the skill never requests an account password.
- Design, cloning, synthesis, and changed Voice Canvas nodes use the authenticated user's Uydi credits. Check the
  balance before paid work and do not retry uncertain paid requests without checking
  `history`, `voices`, or the Canvas render status.
- The skill is a zero-dependency Node.js script with no install hooks. Its only optional
  setting is `UYDI_BASE_URL`, intended for development deployments.

# Uydi Voice Skill

Give an AI agent access to Uydi's voice design, authorized voice cloning, text-to-speech,
voice management, credit balance, and synthesis history workflows.

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
```

Read [SKILL.md](SKILL.md) for the complete command reference, safeguards, and validation
steps.

## Privacy, consent, and costs

- Voice cloning is only for a voice the user owns or has explicit permission to use.
- OAuth approval occurs on `uydi.com`; the skill never requests an account password.
- Design, cloning, and synthesis use the authenticated user's Uydi credits. Check the
  balance before paid work and do not retry uncertain paid requests without checking
  `history` or `voices`.
- The skill is a zero-dependency Node.js script with no install hooks. Its only optional
  setting is `UYDI_BASE_URL`, intended for development deployments.

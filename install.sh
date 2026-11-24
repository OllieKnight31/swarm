#!/bin/bash
# Installs the swarm skill for Claude Code into ~/.claude/skills/swarm
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/skill"
DEST="$HOME/.claude/skills/swarm"

if [ ! -f "$SRC/SKILL.md" ] || [ ! -f "$SRC/scripts/swarm.workflow.js" ]; then
  echo "Cannot find the skill folder next to this script (looked in: $SRC)."
  echo "Unzip the whole download and run install.sh from inside it."
  exit 1
fi

mkdir -p "$HOME/.claude/skills"

if [ -e "$DEST" ]; then
  # The backup must live outside the skills folder, or Claude Code would load it as a second skill.
  BACKUP="$HOME/.claude/skills-backup/swarm-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$HOME/.claude/skills-backup"
  mv "$DEST" "$BACKUP"
  echo "An existing swarm skill was moved to: $BACKUP"
  if [ -f "$BACKUP/references/learnings.md" ]; then
    echo "Your own notes, if any, are in: $BACKUP/references/learnings.md"
  fi
fi

cp -R "$SRC" "$DEST"
echo "Installed to: $DEST"

if command -v python3 >/dev/null 2>&1; then
  if python3 "$DEST/scripts/validate_plan.py" "$DEST/references/example-plan.json" >/dev/null 2>&1; then
    echo "Self-test passed (plan checker runs)."
  else
    echo "Warning: the plan checker did not run cleanly. Run this to see why:"
    echo "  python3 \"$DEST/scripts/validate_plan.py\" \"$DEST/references/example-plan.json\""
  fi
else
  echo "Note: python3 was not found. The skill still works, but it cannot check plans automatically."
  echo "To add it, run: xcode-select --install"
fi

echo
echo "Next: open a NEW Claude Code session and type:  /swarm --dry-run <your job>"

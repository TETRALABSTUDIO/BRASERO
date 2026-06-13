#!/usr/bin/env python3
"""UserPromptSubmit hook: every 20 messages, nudge to update the project sheet
and start a fresh session. Counter is per-session, stored in /tmp."""
import sys, json, os, re

THRESHOLD = 20

try:
    data = json.load(sys.stdin)
except Exception:
    data = {}

sid = re.sub(r'[^A-Za-z0-9_-]', '_', str(data.get('session_id', 'default')))
countfile = f"/tmp/brasero_msgcount_{sid}"

try:
    n = int(open(countfile).read().strip())
except Exception:
    n = 0
n += 1
try:
    open(countfile, 'w').write(str(n))
except Exception:
    pass

out = {}
if n % THRESHOLD == 0:
    # 38;5;141 = violet (xterm-256). Bold. Emoji 👾 = phantom pixel violet.
    banner = (
        f"\033[1;38;5;141m👾 Checkpoint: {n} messages dans cette session 👾\033[0m\n"
        f"\033[38;5;141mTemps de mettre a jour la fiche projet (project-sheet.md) "
        f"et d'ouvrir une nouvelle session.\033[0m"
    )
    out["systemMessage"] = banner
    out["hookSpecificOutput"] = {
        "hookEventName": "UserPromptSubmit",
        "additionalContext": (
            f"[Session checkpoint atteint: {n} messages] Avant de traiter la demande, "
            f"propose de facon tres visible (emoji 👾, ton violet/phantom pixel) a "
            f"l'utilisateur de: (1) mettre a jour la fiche projet BRASERO "
            f"(project-sheet.md) avec ce qui a change cette session, puis (2) ouvrir "
            f"une nouvelle session (/clear). Pas de tirets cadratins."
        ),
    }

print(json.dumps(out))

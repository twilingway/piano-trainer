"""UserPromptSubmit hook: nudge toward a fresh session once the context grows large.

Every model call re-reads the whole conversation from the prompt cache, so a session
that keeps going past a few hundred thousand tokens pays for that history on every
step. When the last request already ran with more than THRESHOLD tokens of context,
this hook warns the user and asks Claude to checkpoint the current subtask and
propose a new session. It never blocks the prompt.

The same file lives in a project (.claude/hooks/) and globally (~/.claude/hooks/).
The global copy steps aside when the project has its own, so the warning shows once.
"""

import json
import os
import sys

THRESHOLD = 250_000
TAIL_BYTES = 4 * 1024 * 1024


def project_copy_wins():
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR")
    if not project_dir:
        return False
    project_copy = os.path.join(project_dir, ".claude", "hooks", "context-budget.py")
    if not os.path.exists(project_copy):
        return False
    return not os.path.samefile(project_copy, __file__)


def last_context_tokens(transcript_path):
    with open(transcript_path, "rb") as f:
        f.seek(0, os.SEEK_END)
        f.seek(max(0, f.tell() - TAIL_BYTES))
        lines = f.read().decode("utf-8", errors="replace").splitlines()
    for line in reversed(lines):
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if entry.get("type") != "assistant" or entry.get("isSidechain"):
            continue
        usage = entry.get("message", {}).get("usage")
        if usage:
            return (
                (usage.get("input_tokens") or 0)
                + (usage.get("cache_read_input_tokens") or 0)
                + (usage.get("cache_creation_input_tokens") or 0)
            )
    return 0


def main():
    if project_copy_wins():
        return
    try:
        payload = json.load(sys.stdin)
        tokens = last_context_tokens(payload["transcript_path"])
    except (OSError, ValueError, KeyError):
        return
    if tokens < THRESHOLD:
        return
    k = tokens // 1000
    print(json.dumps({
        "systemMessage": f"Context budget: the last request ran with ~{k}k tokens "
                         f"(threshold {THRESHOLD // 1000}k). Consider a fresh session.",
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": (
                f"Context budget hook: the previous request ran with ~{k}k tokens of context, "
                f"above the {THRESHOLD // 1000}k threshold. Every further call re-reads this history. "
                "Handle the user's message, but do not start a new, unrelated task in this session: "
                "finish or checkpoint the current subtask, write a handoff (done, next, key files) "
                "to memory or the task file, and propose a fresh session. The user decides."
            ),
        },
    }))


main()

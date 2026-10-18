import json, sys

path = sys.argv[1]
targets = {"tool_use": 0, "tool_result": 0, "file-history-delta": 0, "ai-title": 0}
LIMIT = 1


def show(label, obj):
    s = json.dumps(obj, indent=2, default=str)
    if len(s) > 2000:
        s = s[:2000] + "\n...[truncated]"
    print(f"\n===== {label} =====")
    print(s)


with open(path) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
        except Exception:
            continue

        t = o.get("type", "?")

        # assistant/user entries contain content blocks
        if t in ("assistant", "user"):
            content = (o.get("message") or {}).get("content") or []
            if isinstance(content, str):
                content = []
            for block in content:
                bt = block.get("type") if isinstance(block, dict) else None
                if bt == "tool_use" and targets["tool_use"] < LIMIT:
                    targets["tool_use"] += 1
                    show("tool_use block", block)
                if bt == "tool_result" and targets["tool_result"] < LIMIT:
                    targets["tool_result"] += 1
                    show("tool_result block", block)

        if t == "file-history-delta" and targets["file-history-delta"] < LIMIT:
            targets["file-history-delta"] += 1
            show("file-history-delta", o)

        if t == "ai-title" and targets["ai-title"] < LIMIT:
            targets["ai-title"] += 1
            show("ai-title", o)

        if all(v >= LIMIT for v in targets.values()):
            break

print("\n=== found counts ===", targets)

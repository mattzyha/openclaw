"""OC-2 feasibility probe: inject a user message into a running Claude CLI stream-json query.

Records the init capabilities, every command_lifecycle receipt, and every result event,
for (A) an injection while a tool is running and (B) an injection after the answer started.

Run from an empty scratch directory (it spends a few subscription tokens):
  doppler run -p minimatt -c dev --only-secrets CLAUDE_CODE_OAUTH_TOKEN -- \
    python3 -I ~/projects/openclaw/.matt/scripts/steer-probe.py <model> <empty-work-dir>
Take <model> from ~/.openclaw/openclaw.json (agents.defaults.model.primary, without the
provider prefix). Results from 2026-11-26 on CLI 2.1.316 are in .matt/docs/status.md.
"""
import json
import subprocess
import sys
import threading
import time
import uuid

MODEL = sys.argv[1]
WORK_DIR = sys.argv[2]
START = time.time()

process = subprocess.Popen(
    [
        "claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json",
        "--verbose", "--replay-user-messages", "--model", MODEL,
        "--allowedTools", "Bash(sleep:*)",
    ],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    text=True, cwd=WORK_DIR, bufsize=1,
)
events = []
events_lock = threading.Condition()


def log(text):
    print(f"[{time.time() - START:6.1f}s] {text}", flush=True)


def send_user(text, label):
    message_uuid = str(uuid.uuid4())
    payload = {
        "type": "user", "session_id": "", "parent_tool_use_id": None, "uuid": message_uuid,
        "message": {"role": "user", "content": text},
    }
    process.stdin.write(json.dumps(payload) + "\n")
    process.stdin.flush()
    log(f"SENT {label} uuid={message_uuid[:8]} text={text!r}")
    return message_uuid


def read_stdout():
    for line in process.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            log(f"NON-JSON {line[:120]}")
            continue
        describe(event)
        with events_lock:
            events.append(event)
            events_lock.notify_all()


def describe(event):
    kind = event.get("type")
    if kind == "system" and event.get("subtype") == "init":
        log(f"init capabilities={event.get('capabilities')} version={event.get('claude_code_version')}")
    elif kind == "command_lifecycle":
        log(f"command_lifecycle state={event.get('state')} uuid={str(event.get('command_uuid'))[:8]}")
    elif kind == "result":
        log(f"RESULT subtype={event.get('subtype')} turns={event.get('num_turns')} text={str(event.get('result'))[:120]!r}")
    elif kind == "assistant":
        parts = []
        for block in event.get("message", {}).get("content", []):
            if block.get("type") == "text":
                parts.append(f"text={block.get('text', '')[:80]!r}")
            elif block.get("type") == "tool_use":
                parts.append(f"tool_use={block.get('name')} {json.dumps(block.get('input'))[:60]}")
            else:
                parts.append(block.get("type"))
        log(f"assistant {' | '.join(parts)}")
    elif kind == "user":
        content = event.get("message", {}).get("content")
        shape = "tool_result" if isinstance(content, list) else f"text={str(content)[:60]!r}"
        log(f"user isReplay={event.get('isReplay')} uuid={str(event.get('uuid'))[:8]} {shape}")
    elif kind == "system":
        log(f"system subtype={event.get('subtype')} state={event.get('state')}")
    else:
        log(f"other type={kind}")


def wait_for(predicate, timeout, start_index=0):
    deadline = time.time() + timeout
    with events_lock:
        while True:
            for index in range(start_index, len(events)):
                if predicate(events[index]):
                    return index
            remaining = deadline - time.time()
            if remaining <= 0:
                return None
            events_lock.wait(remaining)


def has_tool_use(event):
    return event.get("type") == "assistant" and any(
        block.get("type") == "tool_use" for block in event.get("message", {}).get("content", [])
    )


def has_text(event):
    return event.get("type") == "assistant" and any(
        block.get("type") == "text" for block in event.get("message", {}).get("content", [])
    )


def quiet_for(seconds, limit):
    """Wait until no new event has arrived for `seconds` (bounded by `limit`)."""
    deadline = time.time() + limit
    while time.time() < deadline:
        with events_lock:
            count = len(events)
        time.sleep(seconds)
        with events_lock:
            if len(events) == count:
                return


threading.Thread(target=read_stdout, daemon=True).start()

log("=== PHASE A: inject while a tool is running ===")
send_user("Run the bash command `sleep 15` exactly once. When it finishes, reply with the single word ALPHA and nothing else.", "A-prompt")
tool_index = wait_for(has_tool_use, 90)
log(f"tool_use seen at event index {tool_index}")
time.sleep(3)
send_user("Extra instruction from the user: in your final reply, put the word BETA after ALPHA.", "A-inject")
first_result = wait_for(lambda event: event.get("type") == "result", 120)
log(f"first result at index {first_result}")
quiet_for(12, 60)

log("=== PHASE B: inject after the answer has started ===")
phase_b_start = len(events)
send_user("Reply with the single word GAMMA and nothing else.", "B-prompt")
wait_for(has_text, 90, phase_b_start)
send_user("Reply with the single word DELTA and nothing else.", "B-inject")
wait_for(lambda event: event.get("type") == "result", 90, phase_b_start)
quiet_for(15, 60)

process.stdin.close()
try:
    process.wait(timeout=30)
except subprocess.TimeoutExpired:
    process.kill()
results = [event for event in events if event.get("type") == "result"]
log(f"SUMMARY result_events={len(results)} exit={process.returncode}")
stderr_text = process.stderr.read()
if stderr_text.strip():
    log(f"stderr: {stderr_text[:400]}")

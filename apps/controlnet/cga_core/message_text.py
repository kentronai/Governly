"""
Text extraction for guards.

Guards must see every message the provider will see. Reading only
``messages[-1]["content"]`` as a plain string let any client bypass input
guards by sending OpenAI multipart content (``[{"type": "text", ...}]``) or by
putting the payload in an earlier message.
"""

from typing import Any, Callable, List


def content_text(content: Any) -> str:
    """Text of one message's ``content``: a string, or a list of OpenAI parts."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and isinstance(part.get("text"), str):
                parts.append(part["text"])
        return "\n".join(parts)
    return str(content)


# Written by the integrating app's developer, not by end users. Scanning them
# would make e.g. a support email in the system prompt block every request.
_TRUSTED_ROLES = {"system", "developer"}


def messages_text(messages: Any) -> str:
    """Text of every non-system message, in order, newline-joined."""
    if not isinstance(messages, list):
        return ""
    return "\n".join(
        t
        for t in (
            content_text(m.get("content")) if isinstance(m, dict) else content_text(m)
            for m in messages
            if not (isinstance(m, dict) and m.get("role") in _TRUSTED_ROLES)
        )
        if t
    )


def last_message_text(messages: Any) -> str:
    """Text of the last message only (format/validation guards check the latest input)."""
    if not isinstance(messages, list) or not messages:
        return ""
    last = messages[-1]
    return content_text(last.get("content")) if isinstance(last, dict) else content_text(last)


def map_messages_text(messages: Any, fn: Callable[[str], str]) -> Any:
    """Return a copy of ``messages`` with ``fn`` applied to every text (string or text part)."""
    if not isinstance(messages, list):
        return messages
    out = []
    for m in messages:
        if not isinstance(m, dict):
            out.append(m)
            continue
        m = dict(m)
        c = m.get("content")
        if isinstance(c, str):
            m["content"] = fn(c)
        elif isinstance(c, list):
            m["content"] = [
                {**p, "text": fn(p["text"])}
                if isinstance(p, dict) and isinstance(p.get("text"), str)
                else p
                for p in c
            ]
        out.append(m)
    return out

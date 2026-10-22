"""Desktop-owned dataset names for both recording paths."""

from __future__ import annotations

import re
import unicodedata


def format_record_repo_id(repo_id: str, task: str, number: int, timestamp: str, pattern: str) -> str:
    """Apply the user-selected name within the existing dataset namespace."""
    namespace, separator, _ = repo_id.partition("/")
    ascii_task = unicodedata.normalize("NFKD", task).encode("ascii", "ignore").decode("ascii")
    task_slug = re.sub(r"[^a-z0-9]+", "-", ascii_task.lower()).strip("-")[:48].rstrip("-")
    name = (
        pattern.replace("{Task}", task_slug or "task")
        .replace("{number}", f"{number:03d}")
        .replace("{timestamp}", timestamp)
    )
    if not name or re.search(r'[\\/<>:"|?*]', name) or "{" in name or "}" in name:
        raise ValueError("Invalid desktop recording name pattern")
    return f"{namespace}/{name}" if separator else name

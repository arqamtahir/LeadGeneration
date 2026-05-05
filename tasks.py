"""
tasks.py — Local task management stored in tasks.json.
"""
import json
import os
import uuid
from datetime import date

TASKS_FILE = "tasks.json"


def load_tasks() -> list[dict]:
    if os.path.exists(TASKS_FILE):
        try:
            return json.load(open(TASKS_FILE))
        except Exception:
            pass
    return []


def save_tasks(tasks: list[dict]) -> None:
    json.dump(tasks, open(TASKS_FILE, "w"), indent=2)


def create_task(title: str, lead_row=None, lead_name="", due_date="", priority="medium") -> dict:
    tasks = load_tasks()
    task  = {
        "id":         str(uuid.uuid4()),
        "title":      title,
        "lead_row":   lead_row,
        "lead_name":  lead_name,
        "due_date":   due_date,
        "priority":   priority,
        "done":       False,
        "created_at": str(date.today()),
    }
    tasks.append(task)
    save_tasks(tasks)
    return task


def update_task(task_id: str, **kwargs) -> bool:
    tasks = load_tasks()
    for t in tasks:
        if t["id"] == task_id:
            t.update(kwargs)
            save_tasks(tasks)
            return True
    return False


def delete_task(task_id: str) -> None:
    tasks = load_tasks()
    save_tasks([t for t in tasks if t["id"] != task_id])

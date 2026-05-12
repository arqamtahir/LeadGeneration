"""
blast.py — Background blast worker and shared state.
"""
import time
import random
import threading
import json
import os
from datetime import date

from email_utils import fill_template, send_email
from sheets import get_sheet, stamp_email_sent

DAILY_LOG_FILE = "daily_sends.json"

# Shared state — read by the /api/blast/status route
state = {
    "running": False,
    "log":     [],
    "total":   0,
    "sent":    0,
}

_lock = threading.Lock()


def _log(msg: str) -> None:
    with _lock:
        state["log"].append(msg)


# ── Daily limit tracking ────────────────────────────────────────────────────────

def _load_daily_log() -> dict:
    if os.path.exists(DAILY_LOG_FILE):
        try:
            return json.load(open(DAILY_LOG_FILE))
        except Exception:
            pass
    return {}


def _save_daily_log(data: dict) -> None:
    json.dump(data, open(DAILY_LOG_FILE, "w"), indent=2)


def get_todays_sent_count() -> int:
    today = str(date.today())
    return _load_daily_log().get(today, 0)


def _increment_daily_count() -> int:
    today = str(date.today())
    data  = _load_daily_log()
    data[today] = data.get(today, 0) + 1
    _save_daily_log(data)
    return data[today]


# ── Public API ─────────────────────────────────────────────────────────────────

def start(leads: list[dict], smtp_cfg: dict, template: dict,
          min_delay: float, max_delay: float, sequence: str,
          ai_mode: bool = False, ai_cfg: dict = None, daily_limit: int = 30,
          google_token: str = None, status_after: str = "") -> None:
    """Spawn the blast thread. Raises if a blast is already running."""
    if state["running"]:
        raise RuntimeError("A blast is already running.")

    state.update(running=True, log=[], total=len(leads), sent=0)
    t = threading.Thread(
        target=_worker,
        args=(leads, smtp_cfg, template, min_delay, max_delay, sequence,
              ai_mode, ai_cfg or {}, daily_limit, google_token, status_after),
        daemon=True,
    )
    t.start()


def stop() -> None:
    state["running"] = False


def get_state() -> dict:
    with _lock:
        return dict(state)


# ── Private ────────────────────────────────────────────────────────────────────

def _worker(leads, smtp_cfg, template, min_d, max_d, sequence,
            ai_mode, ai_cfg, daily_limit, google_token, status_after):
    mode_label = "AI-Research" if ai_mode else "Template"
    _log(f"Blast started — {len(leads)} leads queued  [{mode_label} mode]  daily limit: {daily_limit}")

    # Build a lightweight token holder so get_sheet() can read .google_token
    class _TokenHolder:
        pass
    token_holder = _TokenHolder()
    token_holder.google_token = google_token

    try:
        ws = get_sheet(token_holder)
    except Exception as exc:
        _log(f"Sheet connection failed: {exc}")
        state["running"] = False
        return

    sender_name  = smtp_cfg.get("name", "") or smtp_cfg.get("email", "")
    sender_email = smtp_cfg.get("email", "")

    if ai_mode:
        from researcher import generate_custom_email

    for i, lead in enumerate(leads):
        if not state["running"]:
            _log("Stopped by user.")
            break

        # Enforce daily limit
        today_sent = get_todays_sent_count()
        if today_sent >= daily_limit:
            _log(f"Daily limit of {daily_limit} reached ({today_sent} sent today). Stopping.")
            break

        to_email = lead.get("Email", "").strip()
        if not to_email:
            _log(f"SKIP — no email for {lead.get('FirstName', '?')} {lead.get('LastName', '')}")
            continue

        if ai_mode:
            name_label = f"{lead.get('FirstName','')} {lead.get('LastName','')}".strip()
            _log(f"Researching {name_label} at {lead.get('CompanyName','?')}…")
            try:
                custom = generate_custom_email(
                    lead              = lead,
                    sender_name       = sender_name,
                    sender_email      = sender_email,
                    api_key           = ai_cfg.get("api_key", ""),
                    sequence          = sequence,
                    system_prompt     = ai_cfg.get("system_prompt", ""),
                    value_proposition = ai_cfg.get("value_proposition", ""),
                )
                subject = custom["subject"]
                body    = custom["body"]
            except Exception as exc:
                _log(f"AI research failed for {to_email} — falling back to template: {exc}")
                subject = fill_template(template["subject"], lead, sender_name, sender_email)
                body    = fill_template(template["body"],    lead, sender_name, sender_email)
        else:
            subject = fill_template(template["subject"], lead, sender_name, sender_email)
            body    = fill_template(template["body"],    lead, sender_name, sender_email)

        try:
            send_email(smtp_cfg, to_email, subject, body)
            new_status = f"{sequence} Sent" if sequence else "Contacted"
            stamp_email_sent(ws, lead["_row"], new_status, sequence)
            # Update lead status if user selected one
            if status_after:
                from sheets import update_lead
                update_lead(token_holder, lead["_row"], {"Status": status_after})
            _increment_daily_count()
            with _lock:
                state["sent"] += 1
            status_note = f" → {status_after}" if status_after else ""
            _log(f"OK  [{sequence}]  {lead.get('FirstName','')} {lead.get('LastName','')} <{to_email}>{status_note}")
        except Exception as exc:
            _log(f"FAIL  {to_email}  —  {exc}")

        # Delay between sends (skip after last lead)
        if i < len(leads) - 1 and state["running"]:
            delay = random.uniform(min_d, max_d)
            _log(f"Waiting {int(delay)}s before next send…")
            time.sleep(delay)

    state["running"] = False
    _log(f"Blast complete — {state['sent']} / {state['total']} sent.")

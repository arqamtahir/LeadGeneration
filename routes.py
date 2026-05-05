"""
routes.py — All Flask API routes. Imported and registered in app.py.
"""
import os
import json
import platform
import subprocess

from flask import Blueprint, jsonify, request, render_template
from flask_login import login_required, current_user

import blast as blast_module
from blast import get_todays_sent_count
from config import load_config, save_config, PIPELINE_STATUSES, DEFAULT_FIELD_MAPPING
from sheets import (
    fetch_leads, get_sheet_columns, update_lead,
    stamp_email_sent, get_sheet, extract_sheet_id,
    append_leads,
)
import tasks as tasks_module
from blast import _load_daily_log
from email_utils import fill_template, send_email

api = Blueprint("api", __name__)


# ── Page ───────────────────────────────────────────────────────────────────────

@api.route("/")
@login_required
def index():
    return render_template("index.html", user=current_user)


# ── Config ─────────────────────────────────────────────────────────────────────

@api.route("/api/config", methods=["GET"])
@login_required
def api_get_config():
    cfg  = load_config()
    safe = {k: v for k, v in cfg.items() if k not in ("smtp_accounts", "anthropic_api_key", "service_account_file")}
    safe["smtp_accounts"] = [
        {k2: ("***" if k2 == "password" and v2 else v2) for k2, v2 in acc.items()}
        for acc in cfg["smtp_accounts"]
    ]
    safe["pipeline_statuses"] = PIPELINE_STATUSES
    safe["google_connected"] = bool(current_user.google_token)
    return jsonify(safe)


@api.route("/api/config", methods=["POST"])
@login_required
def api_save_config():
    data = request.json
    cfg  = load_config()

    for key in ("sheet_id", "sheet_name", "min_delay", "max_delay", "field_mapping",
                "table_fields", "email_templates", "daily_limit",
                "ai_value_proposition", "ai_system_prompt"):
        if key in data:
            cfg[key] = data[key]

    cfg["sheet_id"] = extract_sheet_id(cfg.get("sheet_id", ""))

    for i, acc in enumerate(data.get("smtp_accounts", [])):
        if i < len(cfg["smtp_accounts"]):
            for k in ("name", "email", "host", "port", "chrome_profile"):
                if k in acc:
                    cfg["smtp_accounts"][i][k] = acc[k]
            if acc.get("password") and acc["password"] != "***":
                cfg["smtp_accounts"][i]["password"] = acc["password"]

    if "sequence_delays" in data:
        cfg["sequence_delays"] = data["sequence_delays"]

    save_config(cfg)
    return jsonify({"ok": True})


# ── Sequences ───────────────────────────────────────────────────────────────────

@api.route("/api/sequences/config", methods=["GET"])
@login_required
def api_sequences_config():
    cfg = load_config()
    return jsonify(cfg.get("sequence_delays", {"E1_to_E2": 3, "E2_to_E3": 5, "E3_to_E4": 7}))


# ── Analytics ───────────────────────────────────────────────────────────────────

@api.route("/api/analytics/sends")
@login_required
def api_analytics_sends():
    return jsonify(_load_daily_log())


# ── Import ──────────────────────────────────────────────────────────────────────

@api.route("/api/import/leads", methods=["POST"])
@login_required
def api_import_leads():
    data = request.json
    rows = data.get("rows", [])
    if not rows:
        return jsonify({"ok": False, "error": "No rows to import."})
    try:
        count = append_leads(current_user, rows)
        return jsonify({"ok": True, "imported": count})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)})


# ── Tasks ───────────────────────────────────────────────────────────────────────

@api.route("/api/tasks", methods=["GET"])
@login_required
def api_tasks_list():
    return jsonify(tasks_module.load_tasks())


@api.route("/api/tasks", methods=["POST"])
@login_required
def api_tasks_create():
    d = request.json
    t = tasks_module.create_task(
        title     = d.get("title", ""),
        lead_row  = d.get("lead_row"),
        lead_name = d.get("lead_name", ""),
        due_date  = d.get("due_date", ""),
        priority  = d.get("priority", "medium"),
    )
    return jsonify({"ok": True, "task": t})


@api.route("/api/tasks/<task_id>", methods=["PUT"])
@login_required
def api_tasks_update(task_id):
    d    = request.json
    ok   = tasks_module.update_task(task_id, **d)
    return jsonify({"ok": ok})


@api.route("/api/tasks/<task_id>", methods=["DELETE"])
@login_required
def api_tasks_delete(task_id):
    tasks_module.delete_task(task_id)
    return jsonify({"ok": True})


# ── Leads ──────────────────────────────────────────────────────────────────────

@api.route("/api/leads")
@login_required
def api_leads():
    cfg = load_config()
    if not cfg.get("sheet_id"):
        return jsonify({"ok": False, "error": "No Sheet ID set. Open Settings and paste your Sheet ID."})
    if not current_user.google_token:
        return jsonify({"ok": False, "error": "Google account not connected. Click 'Connect Google Sheet' in Settings."})
    try:
        leads, meta = fetch_leads(current_user)
        return jsonify({"ok": True, "leads": leads, "meta": meta})
    except Exception as exc:
        msg = str(exc)
        if "404" in msg:
            msg = "Sheet not found. Make sure the Sheet ID is correct and you have access."
        elif "403" in msg:
            msg = "Permission denied. Make sure you have Editor access to this sheet."
        return jsonify({"ok": False, "error": msg})


@api.route("/api/sheet_columns")
@login_required
def api_sheet_columns():
    try:
        return jsonify({"ok": True, "columns": get_sheet_columns(current_user)})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)})


@api.route("/api/update_lead", methods=["POST"])
@login_required
def api_update_lead():
    data = request.json
    try:
        update_lead(current_user, data["row"], data.get("fields", {}))
        return jsonify({"ok": True})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)})


# ── Email ──────────────────────────────────────────────────────────────────────

@api.route("/api/send_single", methods=["POST"])
@login_required
def api_send_single():
    data     = request.json
    cfg      = load_config()
    smtp_cfg = cfg["smtp_accounts"][data.get("smtp_index", 0)]
    lead     = data["lead"]
    template = data["template"]
    sequence = data.get("sequence", "E1")

    sender_name  = smtp_cfg.get("name", "") or smtp_cfg.get("email", "")
    sender_email = smtp_cfg.get("email", "")
    subject = fill_template(template["subject"], lead, sender_name, sender_email)
    body    = fill_template(template["body"],    lead, sender_name, sender_email)

    try:
        send_email(smtp_cfg, lead["Email"], subject, body)
        ws         = get_sheet(current_user)
        new_status = f"{sequence} Sent" if sequence else "Contacted"
        stamp_email_sent(ws, lead["_row"], new_status, sequence)
        return jsonify({"ok": True, "status": new_status})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)})


# ── Blast ──────────────────────────────────────────────────────────────────────

@api.route("/api/blast/start", methods=["POST"])
@login_required
def api_blast_start():
    data     = request.json
    cfg      = load_config()
    smtp_cfg = cfg["smtp_accounts"][data.get("smtp_index", 0)]

    ai_mode = data.get("ai_mode", False)
    ai_cfg  = {
        "api_key":           os.environ.get("OPENAI_API_KEY", ""),
        "system_prompt":     cfg.get("ai_system_prompt", ""),
        "value_proposition": cfg.get("ai_value_proposition", ""),
    }

    if ai_mode and not ai_cfg["api_key"]:
        return jsonify({"ok": False, "error": "AI Research is not configured on the server."})

    try:
        blast_module.start(
            leads       = data["leads"],
            smtp_cfg    = smtp_cfg,
            template    = data["template"],
            min_delay   = cfg["min_delay"],
            max_delay   = cfg["max_delay"],
            sequence    = data.get("sequence", "E1"),
            ai_mode     = ai_mode,
            ai_cfg      = ai_cfg,
            daily_limit = cfg.get("daily_limit", 30),
        )
        return jsonify({"ok": True})
    except RuntimeError as exc:
        return jsonify({"ok": False, "error": str(exc)})


@api.route("/api/blast/daily_count")
@login_required
def api_blast_daily_count():
    cfg = load_config()
    return jsonify({
        "sent_today": get_todays_sent_count(),
        "daily_limit": cfg.get("daily_limit", 30),
    })


@api.route("/api/blast/stop", methods=["POST"])
@login_required
def api_blast_stop():
    blast_module.stop()
    return jsonify({"ok": True})


@api.route("/api/blast/status")
@login_required
def api_blast_status():
    return jsonify(blast_module.get_state())


# ── LinkedIn ────────────────────────────────────────────────────────────────────

@api.route("/api/linkedin/open", methods=["POST"])
@login_required
def api_linkedin_open():
    """Open a LinkedIn profile URL in Chrome using the specified profile directory."""
    data           = request.json
    url            = data.get("url", "").strip()
    chrome_profile = data.get("chrome_profile", "Default").strip() or "Default"

    if not url:
        return jsonify({"ok": False, "error": "No LinkedIn URL provided."})

    try:
        system = platform.system()
        if system == "Darwin":   # macOS
            subprocess.Popen([
                "open", "-na", "Google Chrome",
                "--args",
                f"--profile-directory={chrome_profile}",
                url,
            ])
        elif system == "Windows":
            chrome_paths = [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            ]
            chrome = next((p for p in chrome_paths if os.path.exists(p)), None)
            if not chrome:
                return jsonify({"ok": False, "error": "Chrome not found. Check installation path."})
            subprocess.Popen([chrome, f"--profile-directory={chrome_profile}", url])
        else:
            subprocess.Popen(["google-chrome", f"--profile-directory={chrome_profile}", url])

        return jsonify({"ok": True})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)})


@api.route("/api/inbox")
@login_required
def api_inbox():
    cfg      = load_config()
    accounts = [
        a for a in cfg.get("smtp_accounts", [])
        if a.get("email") and a.get("password") and a.get("password") != "***"
    ]
    if not accounts:
        return jsonify({"ok": False, "error": "No SMTP accounts with saved passwords. Add them in Settings."})
    try:
        from imap_utils import fetch_all_inboxes
        result = fetch_all_inboxes(accounts, limit_per_account=60)
        return jsonify({"ok": True, "messages": result["messages"], "errors": result["errors"]})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)})


@api.route("/api/leads/bulk_status", methods=["POST"])
@login_required
def api_bulk_status():
    data   = request.json
    rows   = data.get("rows", [])
    status = data.get("status", "")
    if not rows or not status:
        return jsonify({"ok": False, "error": "Missing rows or status."})
    errors = []
    for row in rows:
        try:
            update_lead(current_user, row, {"Status": status})
        except Exception as exc:
            errors.append(str(exc))
    if errors:
        return jsonify({"ok": False, "error": "; ".join(errors)})
    return jsonify({"ok": True, "updated": len(rows)})


@api.route("/api/linkedin/done", methods=["POST"])
@login_required
def api_linkedin_done():
    """Mark LI_Request = Sent and optionally LI_Accepted for a lead row."""
    data   = request.json
    row    = data.get("row")
    status = data.get("status", "Sent")   # "Sent" or "Accepted"
    try:
        ws     = get_sheet(current_user)
        fields = {"LI_Request": status}
        update_lead(row, fields)
        return jsonify({"ok": True})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)})

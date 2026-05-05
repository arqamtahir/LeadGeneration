"""
sheets.py — Google Sheets connection and read/write helpers.
Uses OAuth credentials from the logged-in user instead of a service account.
"""
import re
from datetime import datetime

import gspread

from config import load_config, DEFAULT_FIELD_MAPPING
from oauth_sheets import get_credentials_from_token


def get_sheet(user):
    """Return an authenticated gspread Worksheet for the given user."""
    cfg   = load_config()
    creds = get_credentials_from_token(user.google_token)
    if not creds or not creds.valid:
        raise RuntimeError("Google account not connected. Please reconnect in Settings.")
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(cfg["sheet_id"])
    return sh.worksheet(cfg["sheet_name"])


def resolve(mapping: dict, internal_key: str) -> str:
    return mapping.get(internal_key, internal_key)


def fetch_leads(user) -> tuple[list[dict], dict]:
    cfg     = load_config()
    ws      = get_sheet(user)
    records = ws.get_all_records()
    fm      = cfg.get("field_mapping", DEFAULT_FIELD_MAPPING)

    leads = []
    for i, row in enumerate(records):
        lead = {"_row": i}
        for internal_key, sheet_col in fm.items():
            val = row.get(sheet_col, "")
            lead[internal_key] = str(val) if val not in (None, "") else ""
        leads.append(lead)

    meta = {
        "total":      len(leads),
        "industries": sorted({l.get("Industry", "") for l in leads if l.get("Industry")}),
        "countries":  sorted({l.get("Country",  "") for l in leads if l.get("Country")}),
        "tiers":      sorted({l.get("Tier",      "") for l in leads if l.get("Tier")}),
    }
    return leads, meta


def get_sheet_columns(user) -> list[str]:
    return get_sheet(user).row_values(1)


def update_lead(user, row_index: int, fields: dict) -> None:
    cfg       = load_config()
    fm        = cfg.get("field_mapping", DEFAULT_FIELD_MAPPING)
    ws        = get_sheet(user)
    hdrs      = ws.row_values(1)
    sheet_row = row_index + 2

    for internal_key, value in fields.items():
        col_name = resolve(fm, internal_key)
        if col_name in hdrs:
            ws.update_cell(sheet_row, hdrs.index(col_name) + 1, value)


def stamp_email_sent(ws, row_index: int, status: str, sequence: str | None) -> None:
    now       = datetime.now().strftime("%Y-%m-%d %H:%M")
    cfg       = load_config()
    fm        = cfg.get("field_mapping", DEFAULT_FIELD_MAPPING)
    hdrs      = ws.row_values(1)
    sheet_row = row_index + 2

    def _set(key, val):
        col = resolve(fm, key)
        if col in hdrs:
            ws.update_cell(sheet_row, hdrs.index(col) + 1, val)

    _set("Status",    status)
    _set("LastReply", now)
    if sequence in ("E1", "E2", "E3", "E4"):
        _set(f"{sequence}_Date", now)


def append_leads(user, rows: list[dict]) -> int:
    cfg   = load_config()
    fm    = cfg.get("field_mapping", DEFAULT_FIELD_MAPPING)
    ws    = get_sheet(user)
    hdrs  = ws.row_values(1)

    to_append = []
    for lead in rows:
        row = [""] * len(hdrs)
        for internal_key, value in lead.items():
            col_name = resolve(fm, internal_key)
            if col_name in hdrs:
                row[hdrs.index(col_name)] = value
        to_append.append(row)

    if to_append:
        ws.append_rows(to_append, value_input_option="USER_ENTERED")
    return len(to_append)


def extract_sheet_id(raw: str) -> str:
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9_-]+)", raw)
    return m.group(1) if m else raw

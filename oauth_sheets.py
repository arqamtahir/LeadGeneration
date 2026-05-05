"""
oauth_sheets.py — Google OAuth 2.0 flow for Sheets access.
Replaces the old service_account.json approach.
"""
import os
import json
import gspread
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from flask import url_for, request as flask_request

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def _redirect_uri() -> str:
    """Auto-detect the correct callback URL based on the current request host."""
    # Explicit override via env var takes priority
    if os.environ.get("GOOGLE_REDIRECT_URI"):
        return os.environ["GOOGLE_REDIRECT_URI"]
    # On Render (or any HTTPS host) build it from the incoming request
    try:
        base = flask_request.host_url.rstrip("/")
        if flask_request.headers.get("X-Forwarded-Proto") == "https":
            base = base.replace("http://", "https://")
        return base + "/oauth/callback"
    except RuntimeError:
        # Outside request context (startup) — fall back to localhost
        return "http://127.0.0.1:5001/oauth/callback"


def _client_config():
    uri = _redirect_uri()
    return {
        "web": {
            "client_id":     os.environ.get("GOOGLE_CLIENT_ID", ""),
            "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", ""),
            "redirect_uris": [uri],
            "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
            "token_uri":     "https://oauth2.googleapis.com/token",
        }
    }


def get_oauth_flow():
    config = _client_config()
    flow = Flow.from_client_config(config, scopes=SCOPES)
    flow.redirect_uri = config["web"]["redirect_uris"][0]
    return flow


def get_credentials_from_token(token_json: str) -> Credentials | None:
    """Build and refresh Credentials from stored token JSON."""
    if not token_json:
        return None
    info = json.loads(token_json)
    creds = Credentials(
        token=info.get("token"),
        refresh_token=info.get("refresh_token"),
        token_uri=info.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=os.environ.get("GOOGLE_CLIENT_ID", ""),
        client_secret=os.environ.get("GOOGLE_CLIENT_SECRET", ""),
        scopes=SCOPES,
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return creds


def token_to_json(creds: Credentials) -> str:
    return json.dumps({
        "token":         creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri":     creds.token_uri,
        "scopes":        list(creds.scopes or []),
    })


def get_sheet_for_user(user, sheet_id: str, sheet_name: str = "Sheet1"):
    """Return a gspread Worksheet for the given user's OAuth token."""
    creds = get_credentials_from_token(user.google_token)
    if not creds or not creds.valid:
        raise RuntimeError("Google account not connected. Please reconnect.")
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(sheet_id)
    return sh.worksheet(sheet_name)

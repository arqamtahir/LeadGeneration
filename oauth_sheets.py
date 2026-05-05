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
from flask import url_for, session

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

CLIENT_CONFIG = {
    "web": {
        "client_id":     os.environ.get("GOOGLE_CLIENT_ID", ""),
        "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", ""),
        "redirect_uris": [os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:5001/oauth/callback")],
        "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
        "token_uri":     "https://oauth2.googleapis.com/token",
    }
}


def get_oauth_flow():
    flow = Flow.from_client_config(CLIENT_CONFIG, scopes=SCOPES)
    flow.redirect_uri = CLIENT_CONFIG["web"]["redirect_uris"][0]
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

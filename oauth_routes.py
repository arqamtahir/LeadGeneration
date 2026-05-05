"""
oauth_routes.py — Google OAuth callback and connect/disconnect routes.
"""
import json
from flask import Blueprint, redirect, url_for, request, flash, jsonify
from flask_login import login_required, current_user
from oauth_sheets import get_oauth_flow, token_to_json
from auth import db

oauth_bp = Blueprint("oauth", __name__)


@oauth_bp.route("/oauth/connect")
@login_required
def connect():
    from flask import session
    flow = get_oauth_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    session["oauth_state"] = state
    session["oauth_code_verifier"] = flow.code_verifier
    return redirect(auth_url)


@oauth_bp.route("/oauth/callback")
@login_required
def callback():
    from flask import session
    flow = get_oauth_flow()
    flow.code_verifier = session.pop("oauth_code_verifier", None)
    flow.fetch_token(authorization_response=request.url)
    creds = flow.credentials
    current_user.google_token = token_to_json(creds)
    db.session.commit()
    flash("Google Sheets connected successfully!")
    return redirect("/?tab=settings")


@oauth_bp.route("/oauth/disconnect", methods=["POST"])
@login_required
def disconnect():
    current_user.google_token = None
    db.session.commit()
    return jsonify({"ok": True})


@oauth_bp.route("/oauth/status")
@login_required
def status():
    return jsonify({"connected": bool(current_user.google_token)})

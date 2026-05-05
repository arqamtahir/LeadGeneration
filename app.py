"""
app.py — Entry point. Creates the Flask app and registers blueprints.
Run:  python3 app.py
"""
import os
from dotenv import load_dotenv
load_dotenv()

# Allow OAuth over HTTP for local development (never active on Render/production)
if not os.environ.get("RENDER"):
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

from flask import Flask, redirect, url_for
from flask_login import login_required

from config import load_config, save_config, DEFAULT_CONFIG
from auth import db, login_manager, auth_bp
from oauth_routes import oauth_bp
from routes import api

def create_app():
    app = Flask(__name__)
    app.secret_key = os.environ.get("SECRET_KEY", "change-me-in-production")

    # SQLite for users (not the leads data — that stays in Google Sheets)
    basedir = os.path.abspath(os.path.dirname(__file__))
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
        "DATABASE_URL", f"sqlite:///{os.path.join(basedir, 'users.db')}"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = "auth.login"
    login_manager.login_message = "Please sign in to continue."

    app.register_blueprint(auth_bp)
    app.register_blueprint(oauth_bp)
    app.register_blueprint(api)

    with app.app_context():
        db.create_all()

    return app


app = create_app()

if __name__ == "__main__":
    if not os.path.exists("config.json"):
        save_config(DEFAULT_CONFIG)
    port = int(os.environ.get("PORT", 5001))
    host = "0.0.0.0" if os.environ.get("RENDER") else "127.0.0.1"
    print(f"\n  Farance Command Center  →  http://{host}:{port}\n")
    app.run(debug=False, host=host, port=port)

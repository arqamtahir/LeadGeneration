"""
imap_utils.py — Fetch emails from multiple SMTP accounts via IMAP SSL.
  • Fetches only the last 7 days from INBOX (Primary tab equivalent)
  • Auto-detects IMAP host from SMTP host
  • Provides actionable error messages for Zoho / Gmail auth failures
"""
import imaplib
import email
import re
import ssl
import time
from datetime  import datetime, timedelta
from email.header import decode_header as _dh
from email.utils  import parsedate


# ── Helpers ────────────────────────────────────────────────────────────────────

def _decode(value: str) -> str:
    if not value:
        return ""
    parts = _dh(value)
    out   = []
    for raw, enc in parts:
        if isinstance(raw, bytes):
            out.append(raw.decode(enc or "utf-8", errors="replace"))
        else:
            out.append(str(raw))
    return "".join(out)


def _imap_host(smtp_host: str) -> str:
    h = (smtp_host or "").lower().strip()
    if "gmail" in h:
        return "imap.gmail.com"
    if "zoho" in h:
        return "imap.zoho.eu"      # EU datacenter
    if "outlook" in h or "office365" in h or "hotmail" in h:
        return "outlook.office365.com"
    if h.startswith("smtp."):
        return "imap." + h[5:]
    return h


def _since_str() -> str:
    """IMAP SINCE date string for 7 days ago (e.g. '21-Apr-2026')."""
    d = datetime.now() - timedelta(days=7)
    return d.strftime("%d-%b-%Y")


def _strip_html(html: str) -> str:
    """Convert HTML to readable plain text."""
    # Remove <style> and <script> blocks entirely
    html = re.sub(r'<(style|script|head)[^>]*>.*?</(style|script|head)>',
                  '', html, flags=re.DOTALL | re.IGNORECASE)
    # Block-level tags → newlines
    html = re.sub(r'<(br|tr|p|div|li|h[1-6])[^>]*>', '\n', html, flags=re.IGNORECASE)
    # Strip remaining tags
    text = re.sub(r'<[^>]+>', '', html)
    # Decode common HTML entities
    for ent, ch in [('&nbsp;',' '),('&amp;','&'),('&lt;','<'),('&gt;','>'),
                    ('&quot;','"'),('&#39;',"'"),('&apos;',"'")]:
        text = text.replace(ent, ch)
    # Collapse excess blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _text_body(msg) -> str:
    """Extract best plain-text body. Falls back to HTML → stripped text."""
    html_fallback = None
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/plain":
                try:
                    return part.get_payload(decode=True).decode(
                        part.get_content_charset() or "utf-8", errors="replace")
                except Exception:
                    pass
            elif ct == "text/html" and html_fallback is None:
                try:
                    html_fallback = part.get_payload(decode=True).decode(
                        part.get_content_charset() or "utf-8", errors="replace")
                except Exception:
                    pass
    else:
        ct = msg.get_content_type()
        try:
            raw = msg.get_payload(decode=True).decode(
                msg.get_content_charset() or "utf-8", errors="replace")
            if ct == "text/html":
                html_fallback = raw
            else:
                return raw
        except Exception:
            pass

    if html_fallback:
        return _strip_html(html_fallback)
    return ""


def _ts(date_str: str) -> float:
    try:
        parsed = parsedate(date_str)
        return time.mktime(parsed) if parsed else 0.0
    except Exception:
        return 0.0


def _friendly_error(exc: Exception, imap_host: str, account: str) -> str:
    msg = str(exc)
    if "AUTHENTICATIONFAILED" in msg or "Invalid credentials" in msg:
        if "zoho" in imap_host:
            return (
                "Zoho authentication failed. Fix:\n"
                "1. In Zoho Mail → Settings → Mail Accounts → IMAP Access → Enable IMAP\n"
                "2. If 2FA is on, generate an App Password at accounts.zoho.eu → Security → App Passwords\n"
                "3. Paste the App Password (not your login password) in Settings here."
            )
        if "gmail" in imap_host:
            return (
                "Gmail authentication failed. Fix:\n"
                "1. Go to myaccount.google.com/apppasswords\n"
                "2. Generate an App Password for 'Mail'\n"
                "3. Paste it in Settings — do NOT use your regular Gmail password."
            )
        return f"Authentication failed for {account}. Check your email/password in Settings."
    if "UNAVAILABLE" in msg or "Connection refused" in msg or "timed out" in msg:
        return f"Could not connect to {imap_host}. Check your network or firewall."
    return f"IMAP error ({imap_host}): {msg}"


# ── Public API ─────────────────────────────────────────────────────────────────

def fetch_account_inbox(smtp_cfg: dict, limit: int = 60) -> tuple[list[dict], str | None]:
    """
    Fetch last-7-days INBOX for one account.
    Returns (messages, error_string_or_None).
    """
    account_email = smtp_cfg.get("email", "")
    password      = smtp_cfg.get("password", "")
    smtp_host     = smtp_cfg.get("host", "")

    if not account_email or not password:
        return [], "No credentials configured for this account."

    imap_host = _imap_host(smtp_host)
    if not imap_host:
        return [], f"Cannot determine IMAP host from smtp host: {smtp_host!r}"

    try:
        ctx  = ssl.create_default_context()
        conn = imaplib.IMAP4_SSL(imap_host, 993, ssl_context=ctx)
        conn.login(account_email, password)
    except Exception as exc:
        return [], _friendly_error(exc, imap_host, account_email)

    messages = []
    try:
        conn.select("INBOX", readonly=True)

        # Search last 7 days
        _, data = conn.search(None, "SINCE", _since_str())
        ids = data[0].split() if data[0] else []
        # Newest first, cap at limit
        ids = ids[-limit:][::-1]

        for uid in ids:
            try:
                _, raw = conn.fetch(uid, "(RFC822)")
                msg      = email.message_from_bytes(raw[0][1])
                date_str = msg.get("Date", "")
                body     = _text_body(msg).strip()
                messages.append({
                    "account":  account_email,
                    "from":     _decode(msg.get("From",    "")),
                    "to":       _decode(msg.get("To",      "")),
                    "subject":  _decode(msg.get("Subject", "(no subject)")),
                    "date":     date_str,
                    "ts":       _ts(date_str),
                    "preview":  body[:220],
                    "body":     body,
                })
            except Exception:
                continue
    except Exception as exc:
        conn.logout()
        return [], _friendly_error(exc, imap_host, account_email)

    conn.logout()
    return messages, None


def fetch_all_inboxes(smtp_accounts: list[dict], limit_per_account: int = 60) -> dict:
    all_messages = []
    errors       = []

    for acc in smtp_accounts:
        if not acc.get("email"):
            continue
        msgs, err = fetch_account_inbox(acc, limit=limit_per_account)
        if err:
            errors.append({"account": acc["email"], "error": err})
        else:
            all_messages.extend(msgs)

    all_messages.sort(key=lambda m: m["ts"], reverse=True)
    return {"messages": all_messages, "errors": errors}

"""
email_utils.py — Email sending (Resend API or SMTP) and template filling.

Priority:
  1. If RESEND_API_KEY env var is set → use Resend API (works on all hosts)
  2. Otherwise → fall back to direct SMTP (works locally or on paid Render)
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


TEMPLATE_VARS = {
    "{first_name}":    "FirstName",
    "{last_name}":     "LastName",
    "{company}":       "CompanyName",
    "{designation}":   "EmployeeDesignation",
    "{industry}":      "Industry",
    "{email}":         "Email",
    "{phone}":         "FirstPhone",
    "{country}":       "Country",
    "{website}":       "Website",
    "{linkedin}":      "PersonLinkedIn",
    # legacy double-brace aliases
    "{{name}}":        "FirstName",
    "{{company}}":     "CompanyName",
    "{{email}}":       "Email",
}


def fill_template(text: str, lead: dict, sender_name: str, sender_email: str = "") -> str:
    for placeholder, field in TEMPLATE_VARS.items():
        text = text.replace(placeholder, lead.get(field, "") or "")
    text = text.replace("{sender_name}",   sender_name  or "")
    text = text.replace("{sender_email}",  sender_email or "")
    text = text.replace("{{sender_name}}", sender_name  or "")
    return text


def send_email(smtp_cfg: dict, to_email: str, subject: str, body: str) -> None:
    """
    Send an email. Uses Resend API if RESEND_API_KEY is set, otherwise SMTP.
    Raises on failure — callers should catch and log.
    """
    resend_key = os.environ.get("RESEND_API_KEY", "").strip()
    if resend_key:
        _send_via_resend(resend_key, smtp_cfg, to_email, subject, body)
    else:
        _send_via_smtp(smtp_cfg, to_email, subject, body)


# ── Resend ─────────────────────────────────────────────────────────────────────

def _send_via_resend(api_key: str, smtp_cfg: dict, to_email: str,
                     subject: str, body: str) -> None:
    import resend
    resend.api_key = api_key

    from_name  = smtp_cfg.get("name", "").strip()
    from_email = smtp_cfg.get("email", "")
    from_field = f"{from_name} <{from_email}>" if from_name else from_email

    params = {
        "from":    from_field,
        "to":      [to_email],
        "subject": subject,
        "text":    body,
    }

    reply_to = smtp_cfg.get("reply_to", "").strip()
    if reply_to:
        params["reply_to"] = reply_to

    resend.Emails.send(params)


# ── SMTP fallback ──────────────────────────────────────────────────────────────

def _send_via_smtp(smtp_cfg: dict, to_email: str, subject: str, body: str) -> None:
    from_name  = smtp_cfg.get("name", "").strip()
    from_email = smtp_cfg["email"]
    from_field = f"{from_name} <{from_email}>" if from_name else from_email

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = from_field
    msg["To"]      = to_email

    reply_to = smtp_cfg.get("reply_to", "").strip()
    if reply_to:
        msg["Reply-To"] = reply_to

    msg.attach(MIMEText(body, "plain"))

    with smtplib.SMTP(smtp_cfg["host"], int(smtp_cfg["port"])) as server:
        server.starttls()
        server.login(from_email, smtp_cfg["password"])
        server.sendmail(from_email, to_email, msg.as_string())

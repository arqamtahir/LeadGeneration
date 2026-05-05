"""
email_utils.py — SMTP sending and template variable filling.
"""
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
    """
    Replace {placeholder} variables in subject/body with real lead data.
    Supports both {first_name} style (Farance tracker) and legacy {{name}} style.
    """
    for placeholder, field in TEMPLATE_VARS.items():
        text = text.replace(placeholder, lead.get(field, "") or "")
    text = text.replace("{sender_name}",  sender_name  or "")
    text = text.replace("{sender_email}", sender_email or "")
    text = text.replace("{{sender_name}}", sender_name or "")
    return text


def send_email(smtp_cfg: dict, to_email: str, subject: str, body: str) -> None:
    """
    Send a plain-text email via STARTTLS SMTP.
    If smtp_cfg contains a 'reply_to' address, adds a Reply-To header so
    replies land in that inbox (useful when sending from Zoho free plan
    which has no IMAP — set reply_to to your Gmail address).
    Raises an exception on failure — callers should catch and log.
    """
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

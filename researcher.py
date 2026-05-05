"""
researcher.py — AI-powered lead research and custom email generation via OpenAI API.
"""
import json
import openai
import re


# Sequence-specific instructions injected into the prompt
SEQUENCE_CONTEXT = {
    "E1": (
        "This is a COLD INTRO — the recipient has never heard from the sender before. "
        "Open with a specific observation about their company or role. "
        "Make them curious. Do NOT mention a previous email."
    ),
    "E2": (
        "This is FOLLOW-UP #1 — the sender emailed once before but got no reply. "
        "Briefly reference the previous email (e.g. 'I sent a note last week…'). "
        "Add a new angle or insight — don't just ask 'did you see my email?'. "
        "Keep it even shorter than the first one."
    ),
    "E3": (
        "This is FOLLOW-UP #2 — two previous emails, still no reply. "
        "Be direct and slightly more casual. Try a different angle or ask a simple yes/no question. "
        "Reference that you've reached out twice already, briefly."
    ),
    "E4": (
        "This is a BREAKUP EMAIL — final message, closing the conversation. "
        "Be gracious and leave the door open for the future. "
        "Don't pitch anything. Just say you won't follow up again unless they want to reconnect. "
        "Very short — 2-3 sentences max."
    ),
}

DEFAULT_SYSTEM_PROMPT = """You are an expert B2B sales copywriter writing real, final cold emails — not templates.

CRITICAL RULES:
1. NEVER use any placeholders, brackets, or variables. No [X], no {X}, no <X>. Write the actual words.
2. The email must be completely finished and ready to send as-is.
3. Use the recipient's real name, real company, and real title from the data provided.
4. Sign with the sender's real name.
5. Max 100 words in the body — short emails get more replies.
6. No buzzwords, no "I hope this email finds you well", no "synergy", no "leverage".
7. Be specific to their industry and role.
8. One clear CTA only.
9. Subject line must be specific — NOT "Quick question" or "Following up".

Sound like a thoughtful colleague, not a salesperson.

Respond ONLY with valid JSON: {"subject": "...", "body": "..."}"""


def _has_placeholders(text: str) -> list[str]:
    found = []
    for p in [r'\[[\w\s]+\]', r'\{[\w\s]+\}', r'<[\w\s]+>']:
        found.extend(re.findall(p, text))
    return found


def generate_custom_email(
    lead: dict,
    sender_name: str,
    sender_email: str,
    api_key: str,
    sequence: str = "E1",
    system_prompt: str = "",
    value_proposition: str = "",
    max_retries: int = 2,
) -> dict:
    """
    Use GPT-4o-mini to generate a sequence-aware custom email for a lead.
    Returns {"subject": "...", "body": "..."} or raises on failure.
    """
    client = openai.OpenAI(api_key=api_key)

    first    = lead.get("FirstName", "") or ""
    last     = lead.get("LastName", "")  or ""
    company  = lead.get("CompanyName", "") or ""
    title    = lead.get("EmployeeDesignation", "") or ""
    industry = lead.get("Industry", "") or ""
    country  = lead.get("Country", "") or ""
    website  = lead.get("Website", "") or ""
    linkedin = lead.get("PersonLinkedIn", "") or ""
    co_li    = lead.get("CompanyLinkedIn", "") or ""
    notes    = lead.get("Notes", "") or ""

    seq_instruction = SEQUENCE_CONTEXT.get(sequence, SEQUENCE_CONTEXT["E1"])
    value_prop_line = f"\nValue proposition / what the sender offers: {value_proposition}" if value_proposition else ""

    user_msg = f"""Write a complete, ready-to-send email. Use the actual details below — no placeholders.

SEQUENCE: {sequence}
INSTRUCTION: {seq_instruction}

RECIPIENT:
- First name: {first}
- Last name: {last}
- Job title: {title}
- Company: {company}
- Industry: {industry}
- Country: {country}
- Website: {website or "not provided"}
- Personal LinkedIn: {linkedin or "not provided"}
- Company LinkedIn: {co_li or "not provided"}
- Notes: {notes or "none"}

SENDER:
- Name: {sender_name}
- Email: {sender_email}{value_prop_line}

Write the final email now. Greet "{first}", reference "{company}" naturally, sign off as "{sender_name}". No brackets, no placeholders."""

    sys = system_prompt.strip() if system_prompt.strip() else DEFAULT_SYSTEM_PROMPT

    for attempt in range(max_retries + 1):
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=600,
            messages=[
                {"role": "system", "content": sys},
                {"role": "user",   "content": user_msg},
            ],
            response_format={"type": "json_object"},
        )

        raw    = response.choices[0].message.content.strip()
        result = json.loads(raw)

        if "subject" not in result or "body" not in result:
            raise ValueError(f"Missing subject/body in GPT response: {result}")

        bad = _has_placeholders(result["subject"]) + _has_placeholders(result["body"])
        if not bad:
            return result

        if attempt < max_retries:
            user_msg += f"\n\nFix: your response still has unfilled placeholders {bad}. Replace each with the real value from the data. Return JSON only."
        else:
            # Best-effort cleanup on final attempt
            s = re.sub(r'\{[\w\s]*company[\w\s]*\}', company,     result["subject"], flags=re.I)
            s = re.sub(r'\{[\w\s]*name[\w\s]*\}',    first,       s,                 flags=re.I)
            b = re.sub(r'\[[\w\s]+\]',               '',          result["body"])
            b = re.sub(r'\{[\w\s]*name[\w\s]*\}',    first,       b,                 flags=re.I)
            b = re.sub(r'\{[\w\s]*company[\w\s]*\}', company,     b,                 flags=re.I)
            b = re.sub(r'\{[\w\s]*sender[\w\s]*\}',  sender_name, b,                 flags=re.I)
            result["subject"], result["body"] = s, b
            return result

    return result

"""
researcher.py — AI-powered lead research and custom email generation via OpenAI API.
"""
import json
import openai
import re


SIGNATURE = """\
Huzaifa Khalid
CTO at Algocrew
huzaifa.khalid@algocrew.io
algocrew.io"""

SIGN_OFF_WORDS = {"cordialement", "regards", "best", "sincerely", "thanks", "merci",
                  "bien cordialement", "bien à vous", "à bientôt"}


def _append_signature(body: str) -> str:
    """Strip any GPT-generated sign-off / name and append the fixed signature."""
    lines = body.rstrip().split("\n")
    # Remove trailing blank lines + bare sign-off lines GPT tends to add
    while lines and (not lines[-1].strip() or
                     lines[-1].strip().lower().rstrip(",") in SIGN_OFF_WORDS or
                     lines[-1].strip().lower() in ("huzaifa", "huzaifa khalid")):
        lines.pop()
    clean = "\n".join(lines).rstrip()
    return f"{clean}\n\nCordialement,\n\n{SIGNATURE}"


# Sequence-specific instructions injected into the prompt
SEQUENCE_CONTEXT = {
    "E1": (
        "This is a COLD INTRO — first contact, they have never heard from you.\n"
        "- Open with ONE hyper-specific observation about their company, role, or industry "
        "(something you can infer from their title, company name, industry, website, or LinkedIn).\n"
        "- Do NOT open with 'I noticed' or 'I came across' — find a fresher hook.\n"
        "- Pitch in ONE sentence max — what you do and who you do it for.\n"
        "- End with a low-friction CTA: suggest a specific day/time or ask a yes/no question.\n"
        "- Do NOT mention a previous email. Do NOT say 'I hope this finds you well'."
    ),
    "E2": (
        "This is FOLLOW-UP #1 — you emailed once before, no reply.\n"
        "- Open by briefly referencing the first email in one clause (e.g. 'Sent you a note last week…').\n"
        "- Introduce a NEW angle, stat, or insight — never repeat the first email.\n"
        "- Even shorter than the cold intro — aim for 60 words max in the body.\n"
        "- End with a simple yes/no question or a specific time suggestion."
    ),
    "E3": (
        "This is FOLLOW-UP #2 — two emails sent, still no reply.\n"
        "- Be casual and direct. Acknowledge you've tried twice already.\n"
        "- Ask one dead-simple question: 'Is [the problem] on your radar, or is timing off?'\n"
        "- 3-4 sentences total. No pitch. Pure curiosity tone."
    ),
    "E4": (
        "This is a BREAK-UP EMAIL — final message.\n"
        "- 2-3 sentences only.\n"
        "- Say you're closing the loop and won't follow up again.\n"
        "- Leave the door open warmly — no bitterness, no hard sell.\n"
        "- Do NOT pitch anything."
    ),
}

DEFAULT_SYSTEM_PROMPT = """You are an elite B2B sales copywriter writing in the French business email style — warm, direct, and respectful.

STYLE — French business pattern:
- Always open with "Bonjour {first_name}," on its own line
- One line break after the greeting, then the first paragraph
- Tone: confident but courteous — not pushy, not overly casual
- Close with "Cordialement," on its own line before the signature block
- Write in English unless the lead's country suggests French (France, Belgium, Morocco, Senegal, Algeria, Tunisia, etc.)
- For French-speaking countries write in French using the same structure

HARD RULES — break any of these and the email is rejected:
1. NO placeholders, brackets, or variables whatsoever. No [X], {X}, <X>, or (X). Write the real words.
2. The email must be 100% ready to send — not a template, not a draft.
3. Use the recipient's EXACT name, company, title, and industry from the data.
4. The body must be 80 words or fewer (excluding greeting and sign-off). Shorter = better.
5. NO corporate filler: no "I hope this email finds you well", "synergy", "leverage", "circle back", "touch base".
6. NO vague claims like "impressive growth" or "expanding service offerings" — be specific or say nothing.
7. ONE call-to-action only — a specific day/time or a yes/no question.
8. Subject line must NOT be "Quick question" or "Following up" — make it specific to the recipient.
9. Do NOT include any signature in the body — it will be appended automatically.

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
    value_prop_line = f"\n- What the sender offers: {value_proposition}" if value_proposition else ""

    # Build a rich context block so GPT has real data to work with
    context_lines = []
    if title:    context_lines.append(f"- Their title: {title}")
    if industry: context_lines.append(f"- Their industry: {industry}")
    if country:  context_lines.append(f"- Their country: {country}")
    if website:  context_lines.append(f"- Company website: {website}")
    if linkedin: context_lines.append(f"- Their LinkedIn: {linkedin}")
    if co_li:    context_lines.append(f"- Company LinkedIn: {co_li}")
    if notes:    context_lines.append(f"- Notes / research: {notes}")
    context_block = "\n".join(context_lines) if context_lines else "- (no additional data)"

    user_msg = f"""Write a complete, ready-to-send {sequence} email using ONLY the real data below. Zero placeholders.

━━ SEQUENCE INSTRUCTIONS ━━
{seq_instruction}

━━ RECIPIENT ━━
- Name: {first} {last}
- Company: {company}
{context_block}

━━ SENDER ━━
- Name: {sender_name}
- Email: {sender_email}{value_prop_line}

━━ REQUIREMENTS ━━
- Start the body with "Bonjour {first}," on its own line
- Reference "{company}" at least once naturally
- End the body with "Cordialement," — the full signature is appended automatically, do NOT write it
- Body ≤ 80 words (excluding greeting and sign-off lines)
- No placeholders, no brackets, no generic filler
- Subject must reference something specific about {company}, {title}, or {industry}
- If {country} is France/Algeria/Morocco/Senegal/Belgium/Tunisia → write in French

Write the final email now. Return JSON only."""

    sys = system_prompt.strip() if system_prompt.strip() else DEFAULT_SYSTEM_PROMPT
    # OpenAI requires the word "json" somewhere in messages when using json_object mode
    if "json" not in sys.lower():
        sys += "\n\nRespond ONLY with valid JSON: {\"subject\": \"...\", \"body\": \"...\"}"

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
            result["body"] = _append_signature(result["body"])
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
            result["subject"], result["body"] = s, _append_signature(b)
            return result

    return result

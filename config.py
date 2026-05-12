"""
config.py — App configuration: defaults, load, save.
"""
import os
import json

CONFIG_FILE = "config.json"

PIPELINE_STATUSES = [
    "Not started", "Researched", "Connected",
    "Sent E1", "Sent E2", "Sent E3", "Sent E4",
    "Replied", "Meeting booked", "Qualified",
    "Proposal sent", "Won", "Lost",
]

DEFAULT_FIELD_MAPPING = {
    "FirstName":           "FirstName",
    "LastName":            "LastName",
    "EmployeeDesignation": "EmployeeDesignation",
    "CompanyName":         "CompanyName",
    "Industry":            "Industry",
    "Email":               "Email",
    "PersonLinkedIn":      "PersonLinkedIn",
    "CompanyLinkedIn":     "Company Linkedin Url",
    "Website":             "Website",
    "FirstPhone":          "FirstPhone",
    "Country":             "Country",
    "Status":              "Status",
    "Tier":                "Tier",
    "PriorityScore":       "PriorityScore",
    "Owner":               "Owner",
    "SendingInbox":        "SendingInbox",
    "E1_Date":             "E1_Date",
    "E2_Date":             "E2_Date",
    "E3_Date":             "E3_Date",
    "E4_Date":             "E4_Date",
    "LI_Request":          "LI_Request",
    "LI_Accepted":         "LI_Accepted",
    "LastReply":           "LastReply",
    "Notes":               "Notes",
}

DEFAULT_TABLE_FIELDS = [
    "FirstName", "LastName", "CompanyName", "EmployeeDesignation",
    "Industry", "Email", "Country", "Status", "Tier", "E1_Date", "LastReply",
]

DEFAULT_CONFIG = {
    "sheet_id":             "",
    "sheet_name":           "Sheet1",
    "service_account_file": "service_account.json",
    "field_mapping":        DEFAULT_FIELD_MAPPING,
    "table_fields":         DEFAULT_TABLE_FIELDS,
    "min_delay":            120,
    "max_delay":            300,
    "smtp_accounts": [
        {"name": "", "email": "", "password": "", "host": "smtp.zoho.eu",   "port": 587},
        {"name": "", "email": "", "password": "", "host": "smtp.zoho.eu",   "port": 587},
        {"name": "", "email": "", "password": "", "host": "smtp.gmail.com", "port": 587},
        {"name": "", "email": "", "password": "", "host": "smtp.gmail.com", "port": 587},
        {"name": "", "email": "", "password": "", "host": "smtp.gmail.com", "port": 587},
    ],
    "email_templates": [
        {
            "name": "E1 - Cold Intro (EN)", "sequence": "E1",
            "subject": "Quick question, {first_name}",
            "body": (
                "Hi {first_name},\n\n"
                "I came across {company} and was impressed by what you're building in the {industry} space.\n\n"
                "I work with companies like yours to [specific value proposition — e.g. reduce operational costs / "
                "grow pipeline / automate workflows] — usually seeing results within the first 30 days.\n\n"
                "Would a quick 15-min call this week make sense? Happy to work around your schedule.\n\n"
                "Best,\n{sender_name}"
            ),
        },
        {
            "name": "E2 - Follow-up 1 (EN)", "sequence": "E2",
            "subject": "Re: Quick question, {first_name}",
            "body": (
                "Hi {first_name},\n\n"
                "Wanted to bump this up in case it got buried.\n\n"
                "I've been helping {industry} companies solve [specific problem] — "
                "thought it could be relevant for {company} given your growth stage.\n\n"
                "Even a 10-minute chat could be worth it. Would Thursday or Friday work?\n\n"
                "Best,\n{sender_name}"
            ),
        },
        {
            "name": "E3 - Follow-up 2 (EN)", "sequence": "E3",
            "subject": "Still worth a chat, {first_name}?",
            "body": (
                "Hi {first_name},\n\n"
                "I know you're busy — I'll keep this short.\n\n"
                "Is [the problem we solve] something {company} is actively working on, "
                "or is the timing just not right?\n\n"
                "Either answer helps — just reply with a yes or no and I'll take it from there.\n\n"
                "Thanks,\n{sender_name}"
            ),
        },
        {
            "name": "E4 - Break-up (EN)", "sequence": "E4",
            "subject": "Closing the loop, {first_name}",
            "body": (
                "Hi {first_name},\n\n"
                "I've reached out a few times and haven't heard back, so I'll assume the timing isn't right.\n\n"
                "I'll leave it here — no hard feelings at all. "
                "If things change down the road, feel free to reach out and I'll be happy to reconnect.\n\n"
                "Wishing you and the {company} team all the best.\n\n"
                "{sender_name}"
            ),
        },
        {
            "name": "E1 - Cold Intro (FR)", "sequence": "E1",
            "subject": "Question rapide, {first_name}",
            "body": (
                "Bonjour {first_name},\n\n"
                "J'ai decouvert {company} et j'ai ete impressionne par ce que vous faites dans le secteur {industry}.\n\n"
                "J'accompagne des entreprises comme la votre pour [proposition de valeur specifique — "
                "ex. reduire les couts / accelerer la croissance / automatiser les processus] "
                "— avec des resultats concrets des les premieres semaines.\n\n"
                "Un echange de 15 min cette semaine serait-il possible ?\n\n"
                "Cordialement,\n{sender_name}"
            ),
        },
        {
            "name": "E2 - Follow-up 1 (FR)", "sequence": "E2",
            "subject": "Re: Question rapide, {first_name}",
            "body": (
                "Bonjour {first_name},\n\n"
                "Je me permets de relancer mon precedent message, au cas ou il serait passe inapercru.\n\n"
                "J'ai aide plusieurs entreprises du secteur {industry} a resoudre [probleme specifique] — "
                "je pense que cela pourrait aussi etre pertinent pour {company}.\n\n"
                "Avez-vous 10 minutes jeudi ou vendredi ?\n\n"
                "Cordialement,\n{sender_name}"
            ),
        },
        {
            "name": "E3 - Follow-up 2 (FR)", "sequence": "E3",
            "subject": "Ca vaut encore un echange, {first_name} ?",
            "body": (
                "Bonjour {first_name},\n\n"
                "Je sais que vous etes pris — je serai bref.\n\n"
                "[Le probleme que nous resolvons] est-il une priorite pour {company} en ce moment, "
                "ou le timing n'est simplement pas le bon ?\n\n"
                "Un simple oui ou non suffit — je m'adapte en fonction.\n\n"
                "Merci,\n{sender_name}"
            ),
        },
        {
            "name": "E4 - Break-up (FR)", "sequence": "E4",
            "subject": "On ferme le dossier, {first_name}",
            "body": (
                "Bonjour {first_name},\n\n"
                "Je vous ai contacte a plusieurs reprises sans retour de votre part — "
                "je comprends tout a fait que le timing ne soit pas ideal.\n\n"
                "Je ne vous soliciterai plus, mais si la situation evolue, "
                "n'hesitez pas a revenir vers moi — ce sera avec plaisir.\n\n"
                "Bonne continuation a vous et a toute l'equipe {company}.\n\n"
                "{sender_name}"
            ),
        },
    ],
}


def load_config() -> dict:
    if os.path.exists(CONFIG_FILE):
        cfg = json.load(open(CONFIG_FILE))
        for k, v in DEFAULT_CONFIG.items():   # back-fill new keys
            if k not in cfg:
                cfg[k] = v
        return cfg
    return DEFAULT_CONFIG.copy()


def save_config(cfg: dict) -> None:
    json.dump(cfg, open(CONFIG_FILE, "w"), indent=2)

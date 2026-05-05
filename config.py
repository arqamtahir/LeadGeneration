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
            "name": "E1 - Cold Intro (FR)", "sequence": "E1",
            "subject": "Question rapide, {first_name}",
            "body": (
                "Bonjour {first_name},\n\n"
                "Je tombe sur {company} et j'ai remarque votre travail dans le secteur {industry}.\n\n"
                "Chez Farance, on aide des entreprises comme la votre a accelerer leurs projets "
                "sans grossir l'equipe.\n\n"
                "Ca vaut un echange de 15 min la semaine prochaine ?\n\n"
                "Cordialement,\n{sender_name}"
            ),
        },
        {
            "name": "E2 - Follow-up 1 (FR)", "sequence": "E2",
            "subject": "Re: Question rapide, {first_name}",
            "body": (
                "Bonjour {first_name},\n\n"
                "Je me permets de relancer mon message precedent.\n\n"
                "Nous avons aide des entreprises similaires a obtenir des resultats concrets rapidement.\n\n"
                "Un echange de 15 min cette semaine ?\n\n"
                "Cordialement,\n{sender_name}"
            ),
        },
        {
            "name": "E3 - Follow-up 2 (FR)", "sequence": "E3",
            "subject": "Derniere tentative -- {company}",
            "body": (
                "Bonjour {first_name},\n\n"
                "C'est mon dernier message pour ne pas encombrer votre boite.\n\n"
                "Si le timing n'est pas bon maintenant, je reviendrai dans quelques mois.\n\n"
                "Mais si vous avez 15 minutes cette semaine, je suis disponible.\n\n"
                "Cordialement,\n{sender_name}"
            ),
        },
        {
            "name": "E4 - Break-up (FR)", "sequence": "E4",
            "subject": "On ferme le dossier, {first_name}",
            "body": (
                "Bonjour {first_name},\n\n"
                "Je ferme votre dossier pour l'instant -- je ne veux pas vous deranger.\n\n"
                "Si les choses changent, n'hesitez pas a me recontacter.\n\n"
                "Bonne continuation,\n{sender_name}"
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

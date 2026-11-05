"""Populate a multi-wallet demo household through the API; no password is stored."""
import argparse
import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from getpass import getpass
from http.cookiejar import CookieJar
import json
from pathlib import Path
import random
import sys
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener


@dataclass(frozen=True)
class Movement:
    date: date
    type: str
    cents: int
    path: tuple[str, ...]
    label: str
    detail: str = ""


def money(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    absolute = abs(cents)
    return f"{sign}{absolute // 100}.{absolute % 100:02d}"


def month_at(index: int) -> tuple[int, int]:
    return index // 12, index % 12 + 1


def generate(end_month: str, include_current: bool = True):
    end_year, end_number = map(int, end_month.split("-"))
    if not 1 <= end_number <= 12:
        raise ValueError("Mois invalide.")
    last = date(end_year, end_number, calendar.monthrange(end_year, end_number)[1])
    if last >= date.today().replace(day=1):
        raise ValueError("Choisissez un mois entièrement terminé.")
    end_index = end_year * 12 + end_number - 1
    first_year, first_month = month_at(end_index - 11)
    first = date(first_year, first_month, 1)
    cap = date.today() if include_current and last + timedelta(days=1) == date.today().replace(day=1) else last
    rng = random.Random(510182226)
    items: list[Movement] = []

    def add(year, month, day, cents, category, label, detail="", type="expense"):
        when = date(year, month, min(day, calendar.monthrange(year, month)[1]))
        if cents <= 0:
            raise ValueError("Un mouvement doit être positif.")
        # Generation consumes random values before this filter, so reruns stay deterministic.
        if first <= when <= cap:
            items.append(Movement(when, type, cents, tuple(category.split(" / ")), label, detail))

    def varied(base, spread):
        return base + rng.randint(-spread, spread)

    for index in range(end_index - 11, end_index + 1 + (cap > last)):
        year, month = month_at(index)
        def expense(day, cents, category, label, detail=""):
            add(year, month, day, cents, category, label, detail)
        def income(day, cents, category, label, detail=""):
            add(year, month, day, cents, category, label, detail, type="income")

        # Two parents' net wages and contributions paid into the shared household account.
        increase = 8000 if year >= 2026 else 0
        income(25, 272500 + increase, "Revenus / Salaires / Sophie", "Salaire net de Sophie", "Parent de 49 ans ; revenu effectivement versé au compte familial.")
        income(26, 241000 + increase, "Revenus / Salaires / Thomas", "Salaire net de Thomas", "Parent de 52 ans ; revenu effectivement versé au compte familial.")
        income(2, 42000, "Revenus / Participation des enfants / Alex", "Participation d’Alex aux frais du ménage", "26 ans, salarié vivant au domicile ; seule sa participation est incluse, pas son salaire personnel.")
        if month not in (7, 8):
            income(8, 14000, "Revenus / Participation des enfants / Noah", "Participation de Noah — travail étudiant", "22 ans, étudiant en master et emploi étudiant à temps partiel.")
        if month in (7, 8):
            income(28, 26000, "Revenus / Participation des enfants / Noah", "Participation estivale de Noah", "Contribution issue de son emploi étudiant d’été.")
            income(29, 14000, "Revenus / Participation des enfants / Lina", "Participation estivale de Lina", "18 ans, étudiante ; petite participation issue d’un emploi d’été.")
        if month == 12:
            income(17, 138000, "Revenus / Primes / Fin d’année", "Prime de fin d’année — Sophie")
            income(18, 112500, "Revenus / Primes / Fin d’année", "Prime de fin d’année — Thomas")
        if month == 5:
            income(21, 168500, "Revenus / Primes / Vacances", "Prime de vacances — Sophie")
        if month == 6:
            income(23, 142000, "Revenus / Primes / Vacances", "Prime de vacances — Thomas")
        if month == 7:
            income(14, 64835, "Impôts et assurances / Impôts / Régularisation", "Remboursement d’impôt", "Régularisation fictive ; la même catégorie peut aussi recevoir des dépenses.")

        expense(1, 139240, "Logement / Crédit immobilier", "Mensualité du crédit immobilier", "Résidence principale ; aucun transfert d’épargne n’est généré.")
        expense(3, 8490, "Logement / Eau", "Eau — provision mensuelle")
        energy = {1: 28600, 2: 26400, 3: 22900, 4: 18400, 5: 14800, 6: 12300, 7: 11600, 8: 11800, 9: 14600, 10: 19700, 11: 24400, 12: 27900}[month]
        expense(6, varied(energy, 1450), "Logement / Énergie / Gaz et électricité", "Énergie — consommation du mois", "Facturation fictive saisonnière pour une maison occupée par cinq personnes.")
        expense(4, 6490, "Logement / Télécommunications / Internet", "Internet du domicile")
        expense(5, 7495, "Logement / Télécommunications / Téléphones", "Téléphonie — cinq lignes mobiles")
        expense(2, 3460, "Impôts et assurances / Assurances / Habitation", "Assurance habitation")
        expense(2, 6875, "Transport / Voiture familiale / Assurance", "Assurance de la voiture familiale")
        expense(3, 4820, "Transport / Seconde voiture / Assurance", "Assurance de la seconde voiture")
        for day, base, category, label in [
            (7, 8750, "Transport / Voiture familiale / Carburant", "Carburant — voiture familiale"),
            (21, 8120, "Transport / Voiture familiale / Carburant", "Carburant — voiture familiale"),
            (12, 6690, "Transport / Seconde voiture / Carburant", "Carburant — seconde voiture"),
        ]:
            expense(day, varied(base, 1250), category, label)
        expense(17, varied(1750, 650), "Transport / Stationnement", "Parkings et stationnement du mois")
        if month not in (7, 8):
            expense(2, 3850, "Transport / Transports publics / Noah", "Abonnement de transport — Noah")
            expense(3, 2950, "Transport / Transports publics / Lina", "Abonnement de transport — Lina")

        for day in range(1, calendar.monthrange(year, month)[1] + 1):
            weekday = date(year, month, day).weekday()
            away = month == 7 and 12 <= day <= 25
            if weekday == 0:
                amount = varied(23600, 4300)
                if not away:
                    expense(day, amount, "Alimentation / Courses / Supermarché", "Courses hebdomadaires — cinq personnes", "Alimentation commune, repas du domicile et provisions ; hors produits ménagers.")
            if weekday == 3:
                amount = varied(4650, 1100)
                if not away:
                    expense(day, amount, "Alimentation / Courses / Marché et produits frais", "Marché — fruits, légumes et produits frais")
            if weekday == 5:
                amount = varied(2475, 650)
                if not away:
                    expense(day, amount, "Alimentation / Courses / Boulangerie", "Boulangerie — pain et petit-déjeuner familial")
            if weekday == 2 and month not in (7, 8):
                expense(day, varied(2140, 550), "Alimentation / Repas hors domicile / Repas de travail et études", "Repas hors domicile — parents et étudiants", "Part des repas réglée par le compte familial.")
        expense(10, varied(7420, 1300), "Alimentation / Repas hors domicile / À emporter", "Repas à emporter — cinq personnes")
        if month % 2 == 0:
            expense(23, varied(14600, 2400), "Alimentation / Repas hors domicile / Restaurant", "Restaurant en famille")
        expense(11, varied(6250, 1300), "Vie quotidienne / Produits ménagers", "Lessive, entretien et produits ménagers")
        expense(15, varied(5380, 1200), "Vie quotidienne / Hygiène", "Hygiène et soins du quotidien — famille")
        expense(16, varied(3680, 1400), "Santé / Pharmacie", "Pharmacie — achats du mois")
        if month % 2:
            expense(14, 3250, "Santé / Consultations / Parents", "Consultation médicale — Sophie")
            income(22, 2180, "Santé / Consultations / Parents", "Remboursement de la consultation — Sophie", "Remboursement fictif, rattaché à la même catégorie que la consultation.")
        if month in (1, 3, 5, 9, 11):
            expense(9, 3850, "Santé / Consultations / Enfants adultes", "Consultation médicale — Noah")
            income(19, 2670, "Santé / Consultations / Enfants adultes", "Remboursement de la consultation — Noah")
        expense(9, 1799, "Loisirs / Abonnements / Musique", "Musique — abonnement familial")
        expense(11, 1699, "Loisirs / Abonnements / Vidéo", "Streaming vidéo — abonnement familial")
        expense(13, 499, "Loisirs / Abonnements / Stockage", "Stockage numérique partagé")
        expense(4, 3490, "Loisirs / Sport / Parents", "Club de sport — Thomas")
        expense(4, 2490, "Loisirs / Sport / Enfants adultes", "Club de sport — Alex")
        if month not in (7, 8):
            expense(5, 1990, "Loisirs / Sport / Enfants adultes", "Activité sportive étudiante — Noah")
        expense(20, varied(4860, 1400), "Loisirs / Sorties / Cinéma et culture", "Sortie cinéma ou culturelle en famille")
        expense(27, 1500, "Cadeaux et solidarité / Dons", "Don mensuel à une association")

        # Seasonal costs and irregular bills create believable peaks.
        events = {
            1: [(15, 16800, "Loisirs / Sport / Parents", "Abonnement annuel piscine — Sophie"), (19, 9750, "Études / Noah / Livres et matériel", "Livres et supports du second semestre — Noah"), (24, 12640, "Vie quotidienne / Vêtements / Lina", "Vêtements d’hiver — Lina")],
            2: [(8, 12800, "Santé / Dentaire", "Contrôle et soins dentaires — Alex"), (12, 36580, "Logement / Entretien / Chauffage", "Réparation imprévue du chauffage"), (21, 32500, "Vacances / Week-end / Hébergement", "Week-end des parents — hébergement"), (22, 9450, "Vacances / Week-end / Repas et sorties", "Week-end des parents — repas et visite")],
            3: [(8, 28900, "Santé / Optique", "Lunettes — Noah"), (16, 63000, "Vacances / Été / Hébergement", "Acompte du séjour d’été familial"), (24, 48560, "Impôts et assurances / Taxes / Voiture familiale", "Taxe annuelle — voiture familiale"), (26, 22480, "Impôts et assurances / Taxes / Seconde voiture", "Taxe annuelle — seconde voiture")],
            4: [(7, 41960, "Transport / Seconde voiture / Entretien", "Remplacement des freins — seconde voiture"), (13, 16500, "Logement / Charges annuelles", "Redevance annuelle d’assainissement"), (18, 32500, "Études / Alex / Formation professionnelle", "Formation complémentaire — Alex"), (25, 17380, "Vie quotidienne / Vêtements / Parents", "Vêtements de printemps — parents")],
            5: [(10, 10490, "Vie quotidienne / Vêtements / Noah", "Chaussures et vêtements — Noah"), (16, 18900, "Logement / Entretien / Jardin", "Entretien et plantations du jardin"), (28, 13650, "Cadeaux et solidarité / Anniversaires", "Anniversaire de Sophie — cadeau familial")],
            6: [(6, 12400, "Logement / Charges annuelles", "Taxe annuelle déchets et collecte"), (12, 31975, "Transport / Voiture familiale / Entretien", "Révision de la voiture avant les vacances"), (17, 8750, "Études / Lina / Livres et matériel", "Fournitures pour les examens et la rentrée"), (24, 15290, "Cadeaux et solidarité / Anniversaires", "Anniversaire de Noah — cadeau familial")],
            7: [(3, 147000, "Vacances / Été / Hébergement", "Solde de l’hébergement — séjour familial"), (11, 17840, "Vacances / Été / Trajet", "Péages et carburant — trajet aller"), (14, 18670, "Vacances / Été / Repas", "Courses sur le lieu de vacances"), (18, 14650, "Vacances / Été / Repas", "Restaurant pendant les vacances — cinq personnes"), (20, 21900, "Vacances / Été / Activités", "Visites et activités pendant le séjour"), (25, 16420, "Vacances / Été / Trajet", "Péages et carburant — trajet retour")],
            8: [(9, 11750, "Cadeaux et solidarité / Anniversaires", "Anniversaire de Lina — cadeau familial"), (18, 22180, "Vie quotidienne / Vêtements / Alex", "Vêtements et chaussures — Alex"), (27, 74900, "Études / Lina / Informatique", "Ordinateur portable pour les études — Lina")],
            9: [(2, 83500, "Études / Lina / Frais d’inscription", "Inscription annuelle — Lina"), (3, 83500, "Études / Noah / Frais d’inscription", "Inscription annuelle — Noah"), (5, 17680, "Études / Lina / Livres et matériel", "Livres et matériel de rentrée — Lina"), (6, 21245, "Études / Noah / Livres et matériel", "Livres et matériel de rentrée — Noah"), (15, 112450, "Impôts et assurances / Impôts / Habitation", "Impôt annuel lié à l’habitation"), (22, 9570, "Cadeaux et solidarité / Anniversaires", "Anniversaire d’Alex — cadeau familial")],
            10: [(7, 18600, "Logement / Entretien / Chauffage", "Entretien annuel du chauffage"), (12, 21000, "Loisirs / Sport / Enfants adultes", "Inscription sportive annuelle — Lina"), (19, 14900, "Cadeaux et solidarité / Anniversaires", "Anniversaire de Thomas — cadeau familial"), (27, 19850, "Vie quotidienne / Vêtements / Parents", "Manteaux et vêtements d’hiver — parents")],
            11: [(8, 45860, "Transport / Voiture familiale / Entretien", "Pneus hiver — voiture familiale"), (15, 12990, "Vie quotidienne / Vêtements / Lina", "Manteau et chaussures — Lina"), (21, 7350, "Logement / Entretien / Petites réparations", "Petites réparations du domicile")],
            12: [(5, 21500, "Cadeaux et solidarité / Fêtes", "Cadeaux de fin d’année — achats 1"), (14, 27850, "Cadeaux et solidarité / Fêtes", "Cadeaux de fin d’année — achats 2"), (23, 18465, "Alimentation / Repas de fêtes", "Courses du réveillon — repas familial"), (30, 11730, "Alimentation / Repas de fêtes", "Courses du Nouvel An")],
        }
        for day, cents, category, label in events[month]:
            expense(day, cents, category, label)
        if month == 3:
            income(22, 9560, "Santé / Optique", "Remboursement partiel des lunettes — Noah")
        if month == 4:
            income(28, 20000, "Études / Alex / Formation professionnelle", "Participation employeur à la formation — Alex")
        if month == 11:
            income(24, 3990, "Vie quotidienne / Vêtements / Lina", "Remboursement d’un vêtement retourné — Lina")

    items.sort(key=lambda row: (row.date, row.type, row.label))
    return first, last, cap, items



class Api:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.cookies = CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(self.cookies))

    def call(self, method, path, payload=None):
        headers = {"Accept": "application/json"}
        body = None if payload is None else json.dumps(payload).encode()
        if body is not None:
            headers["Content-Type"] = "application/json"
        if method not in ("GET", "HEAD"):
            csrf = next((cookie.value for cookie in self.cookies if cookie.name.lower().endswith("_csrf")), None)
            if csrf:
                headers["X-CSRF-Token"] = csrf
        try:
            with self.opener.open(Request(self.base_url+path, data=body, headers=headers, method=method), timeout=30) as response:
                data = response.read()
                return json.loads(data) if data else None
        except HTTPError as error:
            # Never print the request body: login payload contains a password.
            try:
                detail = json.loads(error.read()).get("detail")
            except (ValueError, AttributeError):
                detail = None
            message = f" {detail}" if isinstance(detail, str) else ""
            raise RuntimeError(f"L’API a refusé {method} {path} (HTTP {error.code}).{message}") from None
        except URLError:
            raise RuntimeError(f"API injoignable à {self.base_url}. Démarrez le backend puis relancez la commande.") from None

    def pages(self, path):
        page = 1
        while True:
            separator = "&" if "?" in path else "?"
            result = self.call("GET", f"{path}{separator}page={page}&page_size=100")
            yield from result["items"]
            if page >= result["pagination"]["total_pages"]:
                return
            page += 1



def main():
    today = date.today()
    previous = today.replace(day=1)-timedelta(days=1)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email")
    parser.add_argument("--end-month", default=previous.strftime("%Y-%m"))
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--apply", action="store_true", help="Créer les données via l’API ; sinon afficher uniquement le bilan prévu")
    parser.add_argument("--no-current-month", action="store_true")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    try:
        from app.cli.household_scenario import build_plan, describe_plan, populate_customer
        plan = build_plan(args.end_month, not args.no_current_month)
        summary = describe_plan(plan)
        if args.apply:
            if not args.email:
                parser.error("--email est obligatoire avec --apply")
            password = getpass("Mot de passe du compte : ")
            summary = populate_customer(Api(args.base_url), args.email.strip(), password, plan)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(summary, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
        print(json.dumps(summary, indent=2, ensure_ascii=False))
    except (ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    except (KeyboardInterrupt, EOFError):
        print("Import interrompu. La commande peut être relancée sans dupliquer les mouvements déjà ajoutés.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

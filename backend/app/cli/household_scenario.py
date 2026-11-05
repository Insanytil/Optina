"""A deterministic multi-wallet customer scenario, imported through the public API."""
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from uuid import NAMESPACE_URL, uuid5

from app.cli.seed_household import Movement, generate, money
from app.modules.recurrence.schedule import occurrence_date


@dataclass(frozen=True)
class DemoWallet:
    key: str
    name: str
    opening_cents: int
    purpose: str


WALLETS = (
    DemoWallet('foyer', 'Compte du foyer', 650000, 'Salaire de Sophie, participations des enfants et charges fixes.'),
    DemoWallet('quotidien', 'Dépenses du quotidien', 280000, 'Salaire de Thomas, courses, santé et transports.'),
    DemoWallet('especes', 'Espèces', 320000, 'Réserve initiale pour marché, boulangerie et petites sorties ; aucun transfert fictif.'),
    DemoWallet('projets', 'Projets et études', 450000, 'Primes, vacances, inscriptions, impôts et grosses réparations.'),
)


@dataclass(frozen=True)
class AssignedMovement:
    wallet: str
    movement: Movement


@dataclass(frozen=True)
class DemoRule:
    key: str
    wallet: str
    path: tuple[str, ...]
    label: str
    type: str
    cents: int
    start: date
    unit: str = 'month'
    interval: int = 1
    end: date | None = None
    status: str = 'active'

    def occurrences(self, through):
        index = 0
        while True:
            day = occurrence_date(self.start, self.unit, self.interval, index)
            if day > through or (self.end and day > self.end):
                return
            yield Movement(day, self.type, self.cents, self.path, self.label, 'Échéance récurrente réellement générée par le backend.')
            index += 1


@dataclass
class CustomerPlan:
    first: date
    last: date
    cap: date
    manual: list[AssignedMovement]
    rules: list[DemoRule]
    scopes: dict[tuple[str, ...], tuple[str, ...] | None]

    @property
    def paths(self):
        leaves = {item.movement.path for item in self.manual} | {rule.path for rule in self.rules}
        return {path[:i] for path in leaves for i in range(1, len(path)+1)}

    def expected_movements(self):
        result = list(self.manual)
        for rule in self.rules:
            if rule.status == 'active':
                result.extend(AssignedMovement(rule.wallet, item) for item in rule.occurrences(max(self.cap, date.today()) if rule.end is None else self.cap))
        return sorted(result, key=lambda item: (item.movement.date, item.wallet, item.movement.label))


def path(value):
    return tuple(value.split(' / '))


def assign(movement):
    root = movement.path[0]
    text = ' / '.join(movement.path)
    if text.startswith('Revenus / Salaires / Thomas'):
        return 'quotidien'
    if text.startswith('Revenus / Primes') or root in ('Études', 'Vacances'):
        return 'projets'
    if root == 'Impôts et assurances':
        return 'foyer' if 'Assurances' in movement.path else 'projets'
    if root == 'Revenus' or root == 'Logement':
        return 'foyer'
    if root == 'Alimentation':
        if movement.path[-1] in ('Boulangerie', 'Marché et produits frais'):
            return 'especes'
        if movement.path[-1] == 'Repas de travail et études' and movement.date.day % 3 == 0:
            return 'especes'
        return 'quotidien'
    if root == 'Transport':
        if movement.path[-1] == 'Assurance':
            return 'foyer'
        if movement.path[-1] == 'Entretien':
            return 'projets'
        return 'quotidien'
    if root == 'Loisirs':
        return 'foyer' if 'Abonnements' in movement.path or movement.path[-1] == 'Parents' else 'quotidien'
    if root == 'Cadeaux et solidarité':
        return 'foyer' if movement.path[-1] == 'Dons' else 'projets' if movement.path[-1] == 'Fêtes' else 'quotidien'
    if root == 'Santé' and movement.date.month % 3 == 0 and movement.path[-1] == 'Pharmacie':
        return 'foyer'
    return 'quotidien'


def build_plan(end_month, include_current=True):
    first, last, cap, original = generate(end_month, include_current)
    ongoing_end = None if include_current else cap
    rules = []
    covered_labels = set()

    def rule(key, wallet, category, label, cents, day, unit='month', interval=1, type='expense'):
        anchor = date(first.year, first.month, day)
        rules.append(DemoRule(key, wallet, path(category), label, type, cents, anchor, unit, interval, ongoing_end))
        covered_labels.add(label)

    # Stable rate regimes, so rerunning the same dataset across New Year does
    # not turn an existing open-ended salary into a different rule.
    for person, base, wallet, day in [('Sophie',272500,'foyer',25),('Thomas',241000,'quotidien',26)]:
        label=f'Salaire net de {person}'
        if first.year<2026:
            old_end=min(date(2025,12,31),ongoing_end) if ongoing_end else date(2025,12,31)
            rules.append(DemoRule(f'salary-{person}-before-2026',wallet,path(f'Revenus / Salaires / {person}'),label,
                'income',base,date(first.year,first.month,day),end=old_end))
        indexed_start=date(first.year,first.month,day) if first.year>=2026 else date(2026,1,day)
        if ongoing_end is None or indexed_start<=ongoing_end:
            rules.append(DemoRule(f'salary-{person}-indexed',wallet,path(f'Revenus / Salaires / {person}'),label,
                'income',base+8000,indexed_start,end=ongoing_end))
        covered_labels.add(label)
    specs = [
        ('credit','foyer','Logement / Crédit immobilier','Mensualité du crédit immobilier',139240,1),
        ('water','foyer','Logement / Eau','Eau — provision mensuelle',8490,3),
        ('internet','foyer','Logement / Télécommunications / Internet','Internet du domicile',6490,4),
        ('mobile','foyer','Logement / Télécommunications / Téléphones','Téléphonie — cinq lignes mobiles',7495,5),
        ('home-insurance','foyer','Impôts et assurances / Assurances / Habitation','Assurance habitation',3460,2),
        ('car-insurance','foyer','Transport / Voiture familiale / Assurance','Assurance de la voiture familiale',6875,2),
        ('car2-insurance','foyer','Transport / Seconde voiture / Assurance','Assurance de la seconde voiture',4820,3),
        ('music','foyer','Loisirs / Abonnements / Musique','Musique — abonnement familial',1799,9),
        ('video','foyer','Loisirs / Abonnements / Vidéo','Streaming vidéo — abonnement familial',1699,11),
        ('cloud','foyer','Loisirs / Abonnements / Stockage','Stockage numérique partagé',499,13),
        ('gym-thomas','foyer','Loisirs / Sport / Parents','Club de sport — Thomas',3490,4),
        ('donation','foyer','Cadeaux et solidarité / Dons','Don mensuel à une association',1500,27),
    ]
    for spec in specs:
        rule(*spec)
    rule('alex-contribution','foyer','Revenus / Participation des enfants / Alex','Participation d’Alex aux frais du ménage',42000,2,type='income')
    rule('gym-alex-28d','quotidien','Loisirs / Sport / Enfants adultes','Club de sport — Alex',2490,4,unit='week',interval=4)
    rule('weekly-basket','especes','Alimentation / Courses / Marché et produits frais','Panier local hebdomadaire',2200,6,unit='week')
    covered_labels.add('Marché — fruits, légumes et produits frais')
    rule('legal-quarter','foyer','Impôts et assurances / Assurances / Protection juridique','Protection juridique — échéance trimestrielle',4500,15,interval=3)
    rule('bicycle-halfyear','quotidien','Transport / Vélos / Assurance','Assurance vélos — échéance semestrielle',6900,12,interval=6)
    rule('oncall-quarter','foyer','Revenus / Primes / Permanence','Prime de permanence — Sophie',9000,20,interval=3,type='income')
    # Annual expenses retain their actual calendar month.
    annual = [
        ('tuition-lina','projets','Études / Lina / Frais d’inscription','Inscription annuelle — Lina',83500,9,2),
        ('tuition-noah','projets','Études / Noah / Frais d’inscription','Inscription annuelle — Noah',83500,9,3),
        ('property-tax','projets','Impôts et assurances / Impôts / Habitation','Impôt annuel lié à l’habitation',112450,9,15),
        ('waste-tax','foyer','Logement / Charges annuelles','Taxe annuelle déchets et collecte',12400,6,6),
        ('sanitation','foyer','Logement / Charges annuelles','Redevance annuelle d’assainissement',16500,4,13),
        ('interest','projets','Revenus / Intérêts','Intérêts du compte projets',12000,12,31),
        ('bonus-year-sophie','projets','Revenus / Primes / Fin d’année','Prime de fin d’année — Sophie',138000,12,17),
        ('bonus-year-thomas','projets','Revenus / Primes / Fin d’année','Prime de fin d’année — Thomas',112500,12,18),
        ('bonus-holiday-sophie','projets','Revenus / Primes / Vacances','Prime de vacances — Sophie',168500,5,21),
        ('bonus-holiday-thomas','projets','Revenus / Primes / Vacances','Prime de vacances — Thomas',142000,6,23),
    ]
    for key,wallet,category,label,cents,month,day in annual:
        year = first.year + (month < first.month)
        rules.append(DemoRule(key,wallet,path(category),label,'income' if key=='interest' or key.startswith('bonus-') else 'expense',cents,date(year,month,day),'year',1,ongoing_end))
        covered_labels.add(label)
    manual = [AssignedMovement(assign(item),item) for item in original if item.label not in covered_labels]
    # Genuine external cash gifts, not withdrawals disguised as household income.
    for year in range(first.year, cap.year+1):
        for month,day,label in [(5,28,'Cadeau reçu des grands-parents — Sophie'),(10,19,'Cadeau reçu des grands-parents — Thomas')]:
            when=date(year,month,day)
            if first<=when<=cap:
                manual.append(AssignedMovement('especes',Movement(when,'income',10000,path('Revenus / Cadeaux reçus'),label)))
    # A suspended and an upcoming service make all relevant UI states visible.
    reference = last + timedelta(days=1)
    future = reference + timedelta(days=10)
    rules.append(DemoRule('paused-magazine','quotidien',path('Loisirs / Abonnements / Presse'),'Magazine numérique — en pause','expense',1290,future,status='paused'))
    rules.append(DemoRule('upcoming-student','projets',path('Études / Lina / Soutien scolaire'),'Soutien scolaire — Lina','expense',6500,reference+timedelta(days=7)))
    # Historical-only plans keep the future examples, without posting outside the selected history.
    scopes = {
        path('Logement'):('foyer',), path('Alimentation'):('quotidien','especes'),
        path('Alimentation / Courses / Supermarché'):('quotidien',),
        path('Alimentation / Courses / Marché et produits frais'):('especes',),
        path('Alimentation / Courses / Boulangerie'):('especes',),
        path('Alimentation / Repas hors domicile / À emporter'):('quotidien',),
        path('Alimentation / Repas hors domicile / Restaurant'):('quotidien',),
        path('Santé'):('foyer','quotidien'), path('Études'):('projets',), path('Vacances'):('projets',),
        path('Vie quotidienne'):('quotidien',), path('Revenus / Salaires / Sophie'):('foyer',),
        path('Revenus / Salaires / Thomas'):('quotidien',),
        path('Revenus / Participation des enfants'):('foyer',),
        path('Revenus / Primes'):('foyer','projets'),path('Revenus / Cadeaux reçus'):('especes',),
        path('Revenus / Intérêts'):('projets',), path('Loisirs / Abonnements'):('foyer','quotidien'),
        path('Loisirs / Abonnements / Presse'):('quotidien',),
        path('Transport / Voiture familiale / Assurance'):('foyer',),
        path('Transport / Seconde voiture / Assurance'):('foyer',),
        path('Transport / Voiture familiale / Carburant'):('quotidien',),
        path('Transport / Seconde voiture / Carburant'):('quotidien',),
        path('Transport / Vélos'):('quotidien',),
        path('Impôts et assurances'):('foyer','projets'),
        path('Impôts et assurances / Assurances'):('foyer',),
        path('Impôts et assurances / Impôts'):('projets',),
        path('Impôts et assurances / Taxes'):('projets',),
        path('Cadeaux et solidarité / Dons'):('foyer',),
    }
    return CustomerPlan(first,last,cap,manual,rules,scopes)


def describe_plan(plan):
    items = plan.expected_movements()
    result = dict(scenario='Ménage fictif : deux parents, trois enfants de 18, 22 et 26 ans',
        complete_year_from=str(plan.first),complete_year_to=str(plan.last),data_to=str(plan.cap),recurring_data_to=str(date.today()),
        wallets=[], category_count=len(plan.paths), restricted_categories=sum(prefix in plan.paths for prefix in plan.scopes),
        recurrence_count=len(plan.rules),manual_transaction_count=len(plan.manual),
        recurring_transaction_count=len(items)-len(plan.manual),frequencies=sorted({f'{r.unit}:{r.interval}' for r in plan.rules}))
    totals = defaultdict(int)
    for wallet in WALLETS:
        rows=[item.movement for item in items if item.wallet==wallet.key]
        annual=[row for row in rows if row.date<=plan.last]
        income=sum(row.cents for row in annual if row.type=='income')
        expenses=sum(row.cents for row in annual if row.type=='expense')
        closing=wallet.opening_cents+sum(row.cents if row.type=='income' else -row.cents for row in rows)
        result['wallets'].append(dict(key=wallet.key,name=wallet.name,purpose=wallet.purpose,opening_balance=money(wallet.opening_cents),
            annual_income=money(income),annual_expenses=money(expenses),annual_net=money(income-expenses),
            expected_balance=money(closing),transactions=len(rows)))
        totals['opening']+=wallet.opening_cents
        totals['income']+=income
        totals['expenses']+=expenses
        totals['closing']+=closing
    result.update(total_opening_balance=money(totals['opening']),annual_income=money(totals['income']),
        annual_expenses=money(totals['expenses']),annual_net=money(totals['income']-totals['expenses']),expected_total_balance=money(totals['closing']))
    return result


def dataset_name(plan):
    return f'optina-demo:household5:v2:{plan.first}:{plan.last}'


def namespace(plan):
    return f'Démo {plan.first:%Y%m}–{plan.last:%Y%m}'


def manual_payloads(plan, wallets, categories):
    counts=Counter()
    for entry in plan.manual:
        row=entry.movement
        key=f'{entry.wallet}:{row.date}:{row.type}:{"/".join(row.path)}:{row.label}'
        counts[key]+=1
        marker=f'{dataset_name(plan)}:movement:{uuid5(NAMESPACE_URL,key+":"+str(counts[key]))}'
        yield marker,dict(wallet_id=wallets[entry.wallet]['id'],category_id=categories[row.path]['id'],type=row.type,
            amount=money(row.cents),date=str(row.date),label=row.label,
            note=f'Ménage fictif de cinq personnes. {row.detail} [{marker}]')


def rule_payload(plan, rule, wallets, categories):
    marker=f'{dataset_name(plan)}:rule:{rule.key}'
    return marker,dict(wallet_id=wallets[rule.wallet]['id'],category_id=categories[rule.path]['id'],label=rule.label,
        type=rule.type,amount=money(rule.cents),note=f'Récurrence du ménage fictif. [{marker}]',
        frequency_unit=rule.unit,interval=rule.interval,start_date=str(rule.start),end_date=str(rule.end) if rule.end else None,
        is_active=rule.status=='active')


def assert_fields(actual, expected, message):
    for field,value in expected.items():
        if field=='is_active':
            continue  # Checked separately, including manually suspended or archived rules.
        if field=='amount':
            if Decimal(actual[field]) != Decimal(value):
                raise RuntimeError(message)
        elif actual.get(field) != value:
            raise RuntimeError(message)


def populate_customer(api, email, password, plan):
    api.call('POST','/auth/login',dict(email=email,password=password))
    user=api.call('GET','/auth/me')
    if user['email'].casefold()!=email.casefold():
        raise RuntimeError('Le compte connecté ne correspond pas au compte demandé.')
    dataset=dataset_name(plan)
    prefix=namespace(plan)
    existing_wallets=list(api.pages('/wallets'))
    wallets={}
    original_rows={}
    # Preflight every existing dedicated wallet before creating anything.
    for spec in WALLETS:
        name=f'{prefix} — {spec.name}'
        matches=[wallet for wallet in existing_wallets if wallet['name']==name]
        if len(matches)>1:
            raise RuntimeError(f'Portefeuille de démonstration ambigu : {name}.')
        if not matches:
            continue
        wallet=matches[0]
        rows=list(api.pages(f"/transactions?wallet_id={wallet['id']}"))
        openings=[row for row in rows if row['kind']=='opening_balance']
        if len(openings)!=1:
            raise RuntimeError(f'Solde d’ouverture inattendu pour {name}.')
        assert_fields(openings[0],dict(type='income',amount=money(spec.opening_cents),date=str(plan.first)),
            'Le solde d’ouverture a été modifié ; import refusé.')
        for row in rows:
            if row['kind']!='opening_balance' and dataset not in (row.get('note') or ''):
                raise RuntimeError('Un portefeuille de démonstration contient des mouvements personnels ou modifiés ; import refusé.')
        wallets[spec.key]=wallet
        original_rows[spec.key]=rows
    created_wallets=0
    for spec in WALLETS:
        if spec.key not in wallets:
            wallets[spec.key]=api.call('POST','/wallets',dict(name=f'{prefix} — {spec.name}',balance=money(spec.opening_cents),opening_date=str(plan.first)))
            original_rows[spec.key]=[]
            created_wallets+=1

    index=defaultdict(list)
    for category in api.call('GET','/categories/tree'):
        index[(category['parent_id'],category['name'].casefold())].append(category)
    categories={}
    created_categories=0
    for category_path in sorted(plan.paths, key=lambda value:(len(value),value)):
        parent=categories[category_path[:-1]]['id'] if len(category_path)>1 else None
        label=f'{prefix} · {category_path[0]}' if parent is None else category_path[-1]
        scope=plan.scopes.get(category_path)
        wallet_ids=None if scope is None else sorted(wallets[key]['id'] for key in scope)
        matches=index[(parent,label.casefold())]
        if len(matches)>1:
            raise RuntimeError(f'Catégorie ambiguë : {" / ".join(category_path)}.')
        if matches:
            category=matches[0]
            current=category.get('wallet_ids')
            if (None if current is None else sorted(current)) != wallet_ids:
                raise RuntimeError('La disponibilité d’une catégorie de démonstration a été modifiée ; import refusé.')
        else:
            category=api.call('POST','/categories',dict(name=label,parent_id=parent,wallet_ids=wallet_ids))
            index[(parent,label.casefold())].append(category)
            created_categories+=1
        categories[category_path]=category
    print(f'{len(wallets)} portefeuilles, {len(categories)} catégories : préparation terminée.',flush=True)

    all_rules=api.call('GET','/recurrences?include_archived=true')
    rules={}
    created_rules=0
    definitions={rule.key:rule for rule in plan.rules}
    expected_rule_payloads={rule.key:rule_payload(plan,rule,wallets,categories) for rule in plan.rules}
    for key,(marker,payload) in expected_rule_payloads.items():
        matches=[rule for rule in all_rules if f'[{marker}]' in (rule.get('note') or '')]
        if len(matches)>1:
            raise RuntimeError('Récurrence de démonstration en doublon ; import refusé.')
        if matches:
            rule=matches[0]
            assert_fields(rule,payload,'Une récurrence de démonstration a été modifiée ; elle ne sera pas écrasée.')
            if rule.get('archived') or rule['is_active'] != payload['is_active']:
                raise RuntimeError('Une récurrence de démonstration a été arrêtée ou suspendue manuellement ; import refusé.')
            rules[key]=rule

    expected_manual=dict(manual_payloads(plan,wallets,categories))
    found_manual={}
    known_rule_ids={rule['id'] for rule in rules.values()}
    for rows in original_rows.values():
        for row in rows:
            if row['kind']=='opening_balance':
                continue
            if row.get('recurrence_id'):
                if row['recurrence_id'] not in known_rule_ids:
                    raise RuntimeError('Une récurrence inattendue utilise un portefeuille de démonstration ; import refusé.')
                continue
            marker=next((marker for marker in expected_manual if f'[{marker}]' in (row.get('note') or '')),None)
            if marker is None or marker in found_manual:
                raise RuntimeError('Mouvement de démonstration inattendu ou en doublon ; import refusé.')
            assert_fields(row,expected_manual[marker],'Un mouvement existant a été modifié ; import refusé.')
            found_manual[marker]=row

    # Create real recurring rules first: API posting creates their historical movements.
    for key,(marker,payload) in expected_rule_payloads.items():
        if key not in rules:
            rules[key]=api.call('POST','/recurrences',payload)
            created_rules+=1
    created_manual=0
    for marker,payload in expected_manual.items():
        if marker not in found_manual:
            api.call('POST','/transactions',payload)
            created_manual+=1
            if created_manual%100==0:
                print(f'{created_manual} transactions ponctuelles ajoutées…',flush=True)

    # Reread current cursors: the daily processor may have run during the import.
    rules_by_id={rule['id']:rule for rule in api.call('GET','/recurrences?include_archived=true')}
    verified=[]
    pending=0
    for spec in WALLETS:
        wallet=api.call('GET',f"/wallets/{wallets[spec.key]['id']}")
        rows=list(api.pages(f"/transactions?wallet_id={wallet['id']}"))
        wanted={}
        for key,stored in rules.items():
            definition=definitions[key]
            if definition.wallet!=spec.key or definition.status!='active':
                continue
            actual=rules_by_id[stored['id']]
            next_day=date.fromisoformat(actual['next_date']) if actual['next_date'] else None
            through=max(plan.cap,date.today()) if definition.end is None else plan.cap
            for occurrence in definition.occurrences(through):
                if next_day is not None and occurrence.date>=next_day:
                    pending+=1
                    continue
                wanted[(stored['id'],str(occurrence.date))]=dict(wallet_id=wallet['id'],category_id=categories[definition.path]['id'],
                    type=definition.type,amount=money(definition.cents),label=definition.label,
                    date=str(occurrence.date),note=expected_rule_payloads[key][1]['note'])
        actual_rules={}
        actual_manual={}
        for row in rows:
            if row['kind']=='opening_balance':
                continue
            if row.get('recurrence_id'):
                key=(row['recurrence_id'],row['date'])
                if key not in wanted or key in actual_rules:
                    raise RuntimeError('Occurrence inattendue ou dupliquée dans le jeu de démonstration.')
                assert_fields(row,wanted[key],'Une transaction récurrente a été modifiée ; vérification refusée.')
                actual_rules[key]=row
            else:
                marker=next((marker for marker,payload in expected_manual.items() if payload['wallet_id']==wallet['id'] and f'[{marker}]' in (row.get('note') or '')),None)
                if marker is None or marker in actual_manual:
                    raise RuntimeError('Transaction ponctuelle inattendue ou dupliquée.')
                assert_fields(row,expected_manual[marker],'Une transaction ponctuelle a été modifiée.')
                actual_manual[marker]=row
        expected_count=sum(payload['wallet_id']==wallet['id'] for payload in expected_manual.values())
        if len(actual_manual)!=expected_count or len(actual_rules)!=len(wanted):
            raise RuntimeError('Des transactions attendues manquent. Une occurrence supprimée ne sera pas recréée automatiquement.')
        reconstructed=sum((Decimal(row['amount']) if row['type']=='income' else -Decimal(row['amount']) for row in rows),Decimal(0))
        if reconstructed!=Decimal(wallet['balance']) or len(rows)!=len(actual_manual)+len(actual_rules)+1:
            raise RuntimeError('Le solde ou le nombre de transactions ne correspond pas à l’historique.')
        verified.append(dict(key=spec.key,id=wallet['id'],name=wallet['name'],balance=wallet['balance'],transactions=len(rows),
            recurring_transactions=len(actual_rules),manual_transactions=len(actual_manual)))
    # Exercise the global report and exact aggregation exposed to the UI.
    from urllib.parse import urlencode
    query=urlencode([('wallet_ids',wallet['id']) for wallet in wallets.values()]+[('date_from',str(plan.first)),('date_to',str(plan.last))])
    overview=api.call('GET',f'/wallets/overview?{query}')
    total=sum((Decimal(wallet['balance']) for wallet in verified),Decimal(0))
    if Decimal(overview['balance'])!=total:
        raise RuntimeError('La vue globale ne correspond pas à la somme des portefeuilles.')
    summary=describe_plan(plan)
    for field in ('income','expenses','net'):
        if Decimal(overview[field])!=Decimal(summary[f'annual_{field}']):
            raise RuntimeError('Les totaux annuels de la vue globale diffèrent du scénario attendu.')
    for wallet in wallets.values():
        api.call('GET',f"/recurrences/forecast?wallet_id={wallet['id']}&months=12")
    return dict(**describe_plan(plan),wallets_created=created_wallets,categories_created=created_categories,
        recurrences_created=created_rules,manual_transactions_created=created_manual,verified_wallets=verified,
        verified_total_balance=str(total),pending_occurrences=pending,
        verified_annual_income=overview['income'],verified_annual_expenses=overview['expenses'],verified_annual_net=overview['net'])

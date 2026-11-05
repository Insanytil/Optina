import contextlib
from datetime import date, timedelta
from decimal import Decimal
from io import StringIO
import unittest
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4
from unittest.mock import patch

from app.cli.seed_household import generate
from app.cli.household_scenario import WALLETS, build_plan, describe_plan, populate_customer
from app.modules.recurrence.schedule import next_date


class FakeApi:
    """In-memory public API contract, including actual rule-driven posting."""
    def __init__(self):
        self.wallets=[]
        self.rows=[]
        self.categories=[]
        self.rules=[]
        self.fail_after=None
        self.cutoff=date.today()-timedelta(days=1)

    def pages(self, url):
        parts=urlsplit(url)
        if parts.path=='/wallets': return iter(self.wallets)
        wallet=parse_qs(parts.query)['wallet_id'][0]
        return iter(row for row in self.rows if row['wallet_id']==wallet)

    def allowed(self, category_id, wallet_id):
        by_id={category['id']:category for category in self.categories}
        while category_id:
            category=by_id[category_id]
            if category.get('wallet_ids') is not None and wallet_id not in category['wallet_ids']:
                return False
            category_id=category['parent_id']
        return True

    def add_transaction(self,payload,kind='standard'):
        if kind=='standard' and not self.allowed(payload['category_id'],payload['wallet_id']):
            raise AssertionError('Scenario assigns a disallowed category')
        row={'id':str(uuid4()),'kind':kind,'recurrence_id':None,**payload}
        self.rows.append(row)
        wallet=next(w for w in self.wallets if w['id']==row['wallet_id'])
        wallet['balance']=str(Decimal(wallet['balance'])+Decimal(row['amount'])*(1 if row['type']=='income' else -1))
        return row

    def call(self,method,url,payload=None):
        parts=urlsplit(url)
        path=parts.path
        query=parse_qs(parts.query)
        if path=='/auth/login': return None
        if path=='/auth/me': return dict(email='demo@example.com')
        if method=='POST' and path=='/wallets':
            wallet=dict(id=str(uuid4()),name=payload['name'],balance='0.00')
            self.wallets.append(wallet)
            self.add_transaction(dict(wallet_id=wallet['id'],category_id=None,type='income',amount=payload['balance'],date=payload['opening_date'],label='Solde initial',note=None),kind='opening_balance')
            return wallet
        if method=='GET' and path=='/categories/tree': return self.categories
        if method=='POST' and path=='/categories':
            category=dict(id=str(uuid4()),**payload)
            self.categories.append(category)
            return category
        if method=='GET' and path=='/recurrences':
            return [rule for rule in self.rules if query.get('include_archived')==['true'] or not rule['archived']]
        if method=='POST' and path=='/recurrences':
            if not self.allowed(payload['category_id'],payload['wallet_id']):
                raise AssertionError('Scenario recurrence uses disallowed category')
            rule=dict(id=str(uuid4()),archived=False,next_date=payload['start_date'],**payload)
            index=0
            start=date.fromisoformat(rule['start_date'])
            end=date.fromisoformat(rule['end_date']) if rule['end_date'] else None
            while rule['is_active'] and rule['next_date'] and date.fromisoformat(rule['next_date'])<=self.cutoff:
                self.add_transaction(dict(wallet_id=rule['wallet_id'],category_id=rule['category_id'],recurrence_id=rule['id'],type=rule['type'],amount=rule['amount'],date=rule['next_date'],label=rule['label'],note=rule['note']))
                index+=1
                day=next_date(start,rule['frequency_unit'],rule['interval'],index,end)
                rule['next_date']=str(day) if day else None
            self.rules.append(rule)
            return rule
        if method=='POST' and path=='/transactions':
            if self.fail_after is not None:
                if self.fail_after==0:
                    self.fail_after=None
                    raise RuntimeError('simulated interruption')
                self.fail_after-=1
            return self.add_transaction(payload)
        if method=='GET' and path=='/wallets/overview':
            ids=set(query['wallet_ids'])
            rows=[row for row in self.rows if row['wallet_id'] in ids and row['kind']=='standard' and query['date_from'][0]<=row['date']<=query['date_to'][0]]
            income=sum((Decimal(row['amount']) for row in rows if row['type']=='income'),Decimal(0))
            expenses=sum((Decimal(row['amount']) for row in rows if row['type']=='expense'),Decimal(0))
            return dict(balance=str(sum((Decimal(w['balance']) for w in self.wallets if w['id'] in ids),Decimal(0))),income=str(income),expenses=str(expenses),net=str(income-expenses))
        if method=='GET' and path.startswith('/wallets/'):
            return next(w for w in self.wallets if w['id']==path.rsplit('/',1)[-1])
        if method=='GET' and path=='/recurrences/forecast': return {}
        raise AssertionError((method,url))


class SeedHouseholdTests(unittest.TestCase):
    def plan(self):
        return build_plan('2026-10',include_current=False)

    def apply(self,api,plan=None):
        with contextlib.redirect_stdout(StringIO()):
            return populate_customer(api,'demo@example.com','test-only',plan or self.plan())

    def test_full_year_is_deterministic_and_positive(self):
        first,last,cap,rows=generate('2026-10',False)
        self.assertEqual((first,last),(date(2025,11,1),date(2026,10,31)))
        self.assertTrue(all(first<=row.date<=cap and row.cents>0 for row in rows))
        self.assertEqual(self.plan(),self.plan())

    def test_all_frequencies_and_distinct_wallets(self):
        plan=self.plan()
        self.assertEqual({r.unit+':'+str(r.interval) for r in plan.rules},{'week:1','week:4','month:1','month:3','month:6','year:1'})
        self.assertEqual({item.wallet for item in plan.manual},{w.key for w in WALLETS})
        self.assertTrue(any(rule.status=='paused' for rule in plan.rules))
        self.assertTrue(any(rule.end is None and rule.start>plan.last for rule in plan.rules))
        summary=describe_plan(plan)
        self.assertEqual(Decimal(summary['total_opening_balance'])+Decimal(summary['annual_net']),
            sum((Decimal(w['opening_balance'])+Decimal(w['annual_net']) for w in summary['wallets']),Decimal(0)))

    def test_manual_lines_do_not_duplicate_recurring_flows(self):
        plan=self.plan()
        labels={rule.label for rule in plan.rules}
        self.assertTrue(all(item.movement.label not in labels for item in plan.manual))
        self.assertTrue(any(item.movement.type=='income' and item.movement.path[0]=='Santé' for item in plan.manual))
        assigned=plan.expected_movements()
        self.assertGreater(len(assigned),600)
        shared={}
        for item in assigned:
            shared.setdefault(item.movement.path,set()).add(item.wallet)
        self.assertTrue(any(len(wallets)>1 for wallets in shared.values()))

    def test_real_recurring_history_scopes_balances_and_idempotent_rerun(self):
        api=FakeApi()
        report=self.apply(api)
        self.assertEqual(len(api.wallets),4)
        self.assertEqual(report['recurrences_created'],len(self.plan().rules))
        self.assertGreater(sum(w['recurring_transactions'] for w in report['verified_wallets']),200)
        self.assertEqual(report['verified_annual_net'],report['annual_net'])
        count=len(api.rows)
        second=self.apply(api)
        self.assertEqual((second['wallets_created'],second['categories_created'],second['recurrences_created'],second['manual_transactions_created']),(0,0,0,0))
        self.assertEqual(len(api.rows),count)

    def test_interrupted_import_can_be_resumed_without_duplicates(self):
        api=FakeApi()
        api.fail_after=12
        with self.assertRaisesRegex(RuntimeError,'interruption'):
            self.apply(api)
        rules=len(api.rules)
        report=self.apply(api)
        self.assertEqual(len(api.rules),rules)
        self.assertEqual(report['recurrences_created'],0)
        count=len(api.rows)
        self.apply(api)
        self.assertEqual(len(api.rows),count)

    def test_modified_manual_data_or_archived_rule_is_not_overwritten(self):
        api=FakeApi()
        self.apply(api)
        row=next(row for row in api.rows if row['kind']=='standard' and not row.get('recurrence_id'))
        original=row['amount']
        row['amount']='999.99'
        with self.assertRaisesRegex(RuntimeError,'mouvement existant'):
            self.apply(api)
        row['amount']=original
        api.rules[0]['archived']=True
        with self.assertRaisesRegex(RuntimeError,'arrêtée'):
            self.apply(api)

    def test_foreign_personal_data_is_not_touched(self):
        api=FakeApi()
        personal=dict(id=str(uuid4()),name='Mon vrai compte',balance='123.45')
        api.wallets.append(personal)
        self.apply(api)
        self.assertEqual(personal['balance'],'123.45')
        self.assertFalse(any(row['wallet_id']==personal['id'] for row in api.rows))

    def test_deleted_generated_occurrence_is_not_recreated(self):
        api=FakeApi()
        self.apply(api)
        row=next(row for row in api.rows if row.get('recurrence_id'))
        api.rows.remove(row)
        wallet=next(w for w in api.wallets if w['id']==row['wallet_id'])
        wallet['balance']=str(Decimal(wallet['balance'])-Decimal(row['amount'])*(1 if row['type']=='income' else -1))
        count=len(api.rows)
        with self.assertRaisesRegex(RuntimeError,'manquent'):
            self.apply(api)
        self.assertEqual(len(api.rows),count)

    def test_rule_definitions_stay_stable_when_rerun_after_new_year(self):
        class Clock(date):
            current=date(2027,1,5)
            @classmethod
            def today(cls): return cls.current
        with patch('app.cli.seed_household.date',Clock), patch('app.cli.household_scenario.date',Clock):
            before=build_plan('2026-12')
            Clock.current=date(2027,2,5)
            after=build_plan('2026-12')
        self.assertEqual(before.rules,after.rules)

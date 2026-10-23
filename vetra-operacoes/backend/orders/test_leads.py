import uuid
from datetime import timedelta
from django.contrib.auth.models import User, Group
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from .models import Lead

@override_settings(CHECKOUT_INGEST_TOKEN='test-lead-token')
class LeadTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('setup_roles', verbosity=0)
        cls.admin=User.objects.create_superuser('lead-admin','admin@example.invalid','test-only')
        cls.operator=User.objects.create_user('lead-operator',is_staff=True)
        cls.operator.groups.add(Group.objects.get(name='Operação'))
        cls.finance=User.objects.create_user('lead-finance',is_staff=True)
        cls.finance.groups.add(Group.objects.get(name='Financeiro'))

    def setUp(self):
        self.client=APIClient()
        self.payload={'request_id':str(uuid.uuid4()),'name':'Cliente Teste','email':'lead@example.invalid','phone':'(11) 99999-1234','quote_id':'123','trip_summary':'Europa · 8 dias'}

    def capture(self):
        return self.client.post('/api/checkout/leads/',self.payload,format='json',HTTP_AUTHORIZATION='Bearer test-lead-token')

    def test_capture_requires_scoped_token_and_does_not_leak_contact(self):
        self.assertEqual(self.client.post('/api/checkout/leads/',self.payload,format='json').status_code,403)
        response=self.capture()
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(response.data,{'received':True})
        self.assertEqual(Lead.objects.get().phone,'11999991234')
        self.assertEqual(self.client.get('/api/leads/').status_code,403)

    def test_retry_does_not_duplicate_and_changed_payload_conflicts(self):
        self.assertEqual(self.capture().status_code,201)
        self.assertEqual(self.capture().status_code,200)
        self.assertEqual(Lead.objects.count(),1)
        self.payload['email']='other@example.invalid'
        self.assertEqual(self.capture().status_code,409)

    def test_invalid_contact_rejected(self):
        for field,value in [('name','   '),('email','invalid'),('phone','123')]:
            original=self.payload[field]
            self.payload[field]=value
            self.assertEqual(self.capture().status_code,400)
            self.payload[field]=original
        self.assertFalse(Lead.objects.exists())

    def test_pagination_fixed_at_fifty_and_permissions(self):
        for i in range(51):
            Lead.objects.create(capture_key=uuid.uuid4(),capture_hash='test',name='Cliente Teste',email=f'lead{i}@example.invalid',phone=f'1199{i:07d}')
        for user in [None,self.finance]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get('/api/leads/').status_code,403)
        self.client.force_authenticate(self.operator)
        first=self.client.get('/api/leads/?page_size=1000')
        self.assertEqual(first.status_code,200)
        self.assertEqual(first.data['count'],51)
        self.assertEqual(len(first.data['results']),50)
        second=self.client.get('/api/leads/?page=2')
        self.assertEqual(len(second.data['results']),1)
        self.assertTrue(first.data['next'])
        self.assertTrue(second.data['previous'])
        self.assertNotEqual(first.data['results'][0]['id'],second.data['results'][0]['id'])
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get('/api/leads/').status_code,200)

    def test_inclusive_date_filter_and_invalid_ranges(self):
        self.capture()
        old=Lead.objects.create(capture_key=uuid.uuid4(),capture_hash='test',name='Contato Antigo',email='old@example.invalid',phone='11999999999')
        Lead.objects.filter(pk=old.pk).update(created_at=timezone.now()-timedelta(days=3))
        self.client.force_authenticate(self.admin)
        today=timezone.localdate().isoformat()
        result=self.client.get('/api/leads/',{'start':today,'end':today})
        self.assertEqual(result.data['count'],1)
        self.assertEqual(result.data['results'][0]['name'],'Cliente Teste')
        self.assertEqual(self.client.get('/api/leads/?start=bad').status_code,400)
        self.assertEqual(self.client.get('/api/leads/?start=2026-10-30&end=2026-10-01').status_code,400)
        self.assertEqual(self.client.post('/api/leads/',{},format='json').status_code,405)

    def test_session_exposes_lead_permission(self):
        self.client.force_authenticate(self.operator)
        self.assertTrue(self.client.get('/api/session/').data['user']['can_view_leads'])
        self.client.force_authenticate(self.finance)
        self.assertFalse(self.client.get('/api/session/').data['user']['can_view_leads'])

    def test_single_name_is_accepted(self):
        self.payload['name']='Ana'
        response=self.capture()
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(Lead.objects.get().name,'Ana')

    def test_ticket_uses_configured_pix_rate_per_traveler_and_freezes(self):
        from decimal import Decimal
        from .models import InstallmentSettings
        rules=InstallmentSettings.objects.create(pix_enabled=True,pix_discount_percent='5.00')
        self.payload.update(min_quote_total='401.60',traveler_count=2)
        response=self.capture()
        self.assertEqual(response.status_code,201,response.data)
        lead=Lead.objects.get()
        self.assertEqual(lead.min_ticket_pix,Decimal('190.76'))
        self.assertEqual(lead.min_quote_total,Decimal('401.60'))
        self.assertEqual(lead.traveler_count,2)
        self.assertEqual(lead.pix_discount_percent,Decimal('5.00'))
        rules.pix_discount_percent=Decimal('20')
        rules.save()
        self.assertEqual(self.capture().status_code,200)
        lead.refresh_from_db()
        self.assertEqual(lead.min_ticket_pix,Decimal('190.76'))
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get('/api/leads/').data['results'][0]['min_ticket_pix'],'190.76')

    def test_ticket_requires_count_and_total_together(self):
        self.payload['min_quote_total']='100.00'
        self.assertEqual(self.capture().status_code,400)
        self.payload['traveler_count']=0
        self.assertEqual(self.capture().status_code,400)
        self.payload['traveler_count']=1
        self.payload['min_quote_total']='-1'
        self.assertEqual(self.capture().status_code,400)

    def test_old_capture_without_pricing_keeps_ticket_unknown(self):
        self.assertEqual(self.capture().status_code,201)
        self.assertIsNone(Lead.objects.get().min_ticket_pix)

    def test_email_or_phone_match_groups_captures_with_latest_name(self):
        self.payload.update(name='Primeiro', min_quote_total='100.00', traveler_count=1)
        self.assertEqual(self.capture().status_code,201)
        self.payload.update(request_id=str(uuid.uuid4()),name='Mais recente',email='LEAD@EXAMPLE.INVALID',phone='+55 (11) 99999-1234',min_quote_total='120.00')
        self.assertEqual(self.capture().status_code,201)
        self.client.force_authenticate(self.admin)
        result=self.client.get('/api/leads/')
        self.assertEqual(result.data['count'],1)
        row=result.data['results'][0]
        self.assertEqual(row['capture_count'],2)
        self.assertEqual(row['name'],'Mais recente')
        self.assertEqual(row['min_ticket_pix'],'100.00')
        self.assertEqual(Lead.objects.count(),2)

    def test_bridge_capture_merges_both_contact_histories(self):
        self.assertEqual(self.capture().status_code,201)
        self.payload.update(request_id=str(uuid.uuid4()),name='Outro',email='other@example.invalid',phone='21988887777')
        self.assertEqual(self.capture().status_code,201)
        self.payload.update(request_id=str(uuid.uuid4()),name='Último',email='lead@example.invalid')
        self.assertEqual(self.capture().status_code,201)
        self.assertEqual(Lead.objects.values('group_key').distinct().count(),1)
        self.client.force_authenticate(self.admin)
        row=self.client.get('/api/leads/').data['results'][0]
        self.assertEqual(row['capture_count'],3)
        self.assertEqual(row['name'],'Último')

    def test_export_is_protected_grouped_filtered_and_formula_safe(self):
        self.payload['name']='=2+2'
        self.assertEqual(self.capture().status_code,201)
        self.payload['request_id']=str(uuid.uuid4())
        self.assertEqual(self.capture().status_code,201)
        self.assertEqual(self.client.get('/api/leads/export/').status_code,403)
        self.client.force_authenticate(self.finance)
        self.assertEqual(self.client.get('/api/leads/export/').status_code,403)
        self.client.force_authenticate(self.admin)
        result=self.client.get('/api/leads/export/')
        self.assertEqual(result.status_code,200)
        text=result.content.decode('utf-8-sig')
        self.assertIn("'=2+2",text)
        self.assertIn(';2;',text)
        self.assertEqual(len(text.splitlines()),2)
        yesterday=(timezone.localdate()-timedelta(days=1)).isoformat()
        filtered=self.client.get('/api/leads/export/',{'end':yesterday})
        self.assertEqual(len(filtered.content.decode('utf-8-sig').splitlines()),1)

    def test_backfill_groups_existing_captures_transitively(self):
        from importlib import import_module
        from django.apps import apps
        for email,phone in [('a@example.invalid','11999990000'),('b@example.invalid','21999990000'),('A@example.invalid','+5521999990000')]:
            Lead.objects.create(capture_key=uuid.uuid4(),capture_hash='test',name='Nome',email=email,phone=phone)
        migration=import_module('orders.migrations.0017_lead_contact_groups')
        migration.group_existing(apps,None)
        self.assertEqual(Lead.objects.values('group_key').distinct().count(),1)

    def record_search(self, visitor, key=None, total='100.00'):
        return self.client.post('/api/checkout/lead-searches/',{'visitor_id':str(visitor),'request_id':str(key or uuid.uuid4()),'quote_id':'123','trip_summary':'Europa','min_quote_total':total,'traveler_count':1},format='json',HTTP_AUTHORIZATION='Bearer test-lead-token')

    def test_cookie_visitor_searches_bind_to_lead_and_retries_do_not_count_twice(self):
        visitor=uuid.uuid4()
        key=uuid.uuid4()
        self.assertEqual(self.record_search(visitor,key).status_code,201)
        self.assertEqual(self.record_search(visitor,key).status_code,200)
        self.payload['visitor_id']=str(visitor)
        self.assertEqual(self.capture().status_code,201)
        self.assertEqual(self.record_search(visitor,total='80.00').status_code,201)
        self.client.force_authenticate(self.admin)
        row=self.client.get('/api/leads/').data['results'][0]
        self.assertEqual(row['search_count'],2)
        self.assertIsNotNone(row['last_search_at'])
        self.assertEqual(row['min_ticket_pix'],'80.00')

    def test_search_ingest_is_private_and_does_not_return_contacts(self):
        self.assertEqual(self.client.post('/api/checkout/lead-searches/',{},format='json').status_code,403)
        visitor=uuid.uuid4()
        result=self.record_search(visitor)
        self.assertEqual(result.data,{'received':True,'known_lead':False})

    def test_delete_hides_group_from_list_and_export_without_touching_orders(self):
        self.capture()
        self.payload['request_id']=str(uuid.uuid4())
        self.capture()
        lead=Lead.objects.first()
        self.client.force_authenticate(self.operator)
        self.assertEqual(self.client.post(f'/api/leads/{lead.pk}/delete/',{},format='json').status_code,403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f'/api/leads/{lead.pk}/delete/',{},format='json').status_code,200)
        self.assertEqual(self.client.get('/api/leads/').data['count'],0)
        self.assertEqual(len(self.client.get('/api/leads/export/').content.decode('utf-8-sig').splitlines()),1)
        self.assertEqual(Lead.objects.filter(deleted_at__isnull=False).count(),2)
        self.client.force_authenticate(None)
        self.payload['request_id']=str(uuid.uuid4())
        self.assertEqual(self.capture().status_code,201)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get('/api/leads/').data['count'],1)

    def test_group_merge_combines_visitor_searches(self):
        first,second=uuid.uuid4(),uuid.uuid4()
        self.record_search(first)
        self.payload['visitor_id']=str(first)
        self.capture()
        self.record_search(second)
        self.payload.update(request_id=str(uuid.uuid4()),visitor_id=str(second),email='other@example.invalid',phone='21988887777')
        self.capture()
        self.payload.update(request_id=str(uuid.uuid4()),email='lead@example.invalid')
        self.capture()
        self.client.force_authenticate(self.admin)
        result=self.client.get('/api/leads/')
        self.assertEqual(result.data['count'],1)
        self.assertEqual(result.data['results'][0]['search_count'],2)

    def test_deleted_cookie_lead_is_restored_on_new_search_with_cheapest_price(self):
        visitor=uuid.uuid4()
        first=self.record_search(visitor,total='150.00')
        self.assertFalse(first.data['known_lead'])
        self.payload.update(visitor_id=str(visitor),name='Nome recente',min_quote_total='150.00',traveler_count=1)
        self.assertEqual(self.capture().status_code,201)
        self.client.force_authenticate(self.admin)
        lead=Lead.objects.first()
        self.assertEqual(self.client.post(f'/api/leads/{lead.pk}/delete/',{},format='json').status_code,200)
        self.assertEqual(self.client.get('/api/leads/').data['count'],0)
        self.client.force_authenticate(None)
        key=uuid.uuid4()
        search=self.record_search(visitor,key,total='80.00')
        self.assertTrue(search.data['known_lead'])
        self.assertEqual(self.record_search(visitor,key,total='80.00').status_code,200)
        self.client.force_authenticate(self.admin)
        result=self.client.get('/api/leads/')
        self.assertEqual(result.data['count'],1)
        row=result.data['results'][0]
        self.assertEqual(row['name'],'Nome recente')
        self.assertEqual(row['email'],self.payload['email'])
        self.assertEqual(row['capture_count'],2)
        self.assertEqual(row['search_count'],2)
        self.assertEqual(row['min_ticket_pix'],'80.00')
        self.assertEqual(Lead.objects.filter(deleted_at__isnull=False).count(),0)
        self.assertEqual(Lead.objects.first().min_quote_total,80)

    def test_unknown_cookie_does_not_claim_a_known_contact(self):
        response=self.record_search(uuid.uuid4())
        self.assertFalse(response.data['known_lead'])
        self.assertFalse(Lead.objects.exists())

    def test_history_contains_only_group_captures_and_keeps_recorded_prices(self):
        visitor=uuid.uuid4()
        self.record_search(visitor,total='150.00')
        self.payload.update(visitor_id=str(visitor),name='Primeiro',min_quote_total='150.00',traveler_count=1)
        self.capture()
        first=Lead.objects.first()
        self.record_search(visitor,total='80.00')
        unrelated=Lead.objects.create(capture_key=uuid.uuid4(),capture_hash='test',name='Outro',email='unrelated@example.invalid',phone='21999990000')
        url=f'/api/leads/{first.pk}/history/'
        self.assertEqual(self.client.get(url).status_code,403)
        self.client.force_authenticate(self.finance)
        self.assertEqual(self.client.get(url).status_code,403)
        self.client.force_authenticate(self.admin)
        result=self.client.get(url)
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(result.data['count'],2)
        self.assertEqual(result.data['results'][0]['min_ticket_pix'],'80.00')
        self.assertTrue(result.data['results'][0]['automatic_capture'])
        self.assertEqual(result.data['results'][1]['min_ticket_pix'],'150.00')
        self.assertFalse(result.data['results'][1]['automatic_capture'])
        self.assertNotIn(unrelated.pk,[r['id'] for r in result.data['results']])
        self.assertEqual(self.client.get('/api/leads/999999/history/').status_code,404)
        self.client.post(f'/api/leads/{first.pk}/delete/',{},format='json')
        self.assertEqual(self.client.get(url).status_code,404)

    def test_history_paginates_fifty_captures(self):
        self.capture()
        lead=Lead.objects.first()
        for i in range(50):
            Lead.objects.create(capture_key=uuid.uuid4(),capture_hash='test',group_key=lead.group_key,name='Nome',email=lead.email,phone=lead.phone)
        self.client.force_authenticate(self.operator)
        url=f'/api/leads/{lead.pk}/history/'
        first=self.client.get(url)
        self.assertEqual(first.data['count'],51)
        self.assertEqual(len(first.data['results']),50)
        self.assertTrue(first.data['next'])
        second=self.client.get(url+'?page=2')
        self.assertEqual(len(second.data['results']),1)

import uuid
from datetime import timedelta
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from .models import Order


@override_settings(CHECKOUT_INGEST_TOKEN='test-scoped-token')
class CheckoutTests(TestCase):
    def setUp(self):
        self.client=APIClient(enforce_csrf_checks=True)
        self.payload={'request_id':str(uuid.uuid4()),'order':{'customer_name':'Cliente Checkout','customer_email':'checkout@example.invalid','destination':'Europa','plan_name':'Vetra Teste','plan_id':1,'departure':str(timezone.localdate()+timedelta(days=15)),'return_date':str(timezone.localdate()+timedelta(days=22)),'currency':'BRL','payment_method':'pix','passengers':[{'full_name':'Passageiro Checkout','cpf':'52998224725','age':22,'unit_price':'150.25'}]}}

    def send(self):
        return self.client.post('/api/checkout/orders/',self.payload,format='json',HTTP_AUTHORIZATION='Bearer test-scoped-token')

    def test_scoped_authentication_and_disabled_configuration(self):
        self.assertEqual(self.client.post('/api/checkout/orders/',self.payload,format='json').status_code,403)
        with override_settings(CHECKOUT_INGEST_TOKEN=''):
            self.assertEqual(self.send().status_code,403)
        self.assertEqual(Order.objects.count(),0)

    def test_real_pending_order_without_payment_or_issuance(self):
        self.payload['order'].update(status='paid',is_demo=True,total='0.01')
        self.payload['order'].update(currency='XXX',vetra_quote_id=99,vetra_quote_plan_id=101)
        response=self.send()
        self.assertEqual(response.status_code,201,response.data)
        order=Order.objects.get()
        self.assertFalse(order.is_demo)
        self.assertEqual(order.source,'checkout')
        self.assertEqual(order.status,'awaiting_payment')
        self.assertEqual(str(order.total),'150.25')
        self.assertIsNone(order.created_by)
        self.assertEqual(order.currency,'XXX')
        self.assertEqual((order.vetra_quote_id,order.vetra_quote_plan_id),(99,101))
        self.assertEqual(order.jobs.count(),0)
        self.assertNotIn('cpf',str(response.data))
        self.assertNotIn('52998224725',order.passengers.get().cpf_encrypted)

    def test_retry_is_idempotent_and_conflicting_body_rejected(self):
        first=self.send()
        second=self.send()
        self.assertEqual(second.status_code,200)
        self.assertEqual(first.data['reference'],second.data['reference'])
        self.assertEqual(Order.objects.count(),1)
        self.payload['order']['customer_name']='Outro Cliente'
        self.assertEqual(self.send().status_code,409)
        self.assertEqual(Order.objects.count(),1)

    def test_invalid_passenger_and_request_id_never_create_order(self):
        self.payload['request_id']='invalid'
        self.assertEqual(self.send().status_code,400)
        self.payload['request_id']=str(uuid.uuid4())
        self.payload['order']['passengers'][0]['cpf']='00000000000'
        self.assertEqual(self.send().status_code,400)
        self.assertEqual(Order.objects.count(),0)

    def exchange_payload(self):
        self.payload['order'].update(currency='BRL',original_currency='USD',original_total='29.23',exchange_rate='5.22',exchange_date=str(timezone.localdate()),exchange_id=2981,exchange_field='cambio_ita',exchange_fetched_at=timezone.now().isoformat(),vetra_quote_id=100,vetra_quote_plan_id=101)
        self.payload['order']['passengers'][0]['unit_price']='152.58'

    def test_conversion_saved_and_retry_keeps_snapshot(self):
        self.exchange_payload()
        response=self.send()
        self.assertEqual(response.status_code,201,response.data)
        order=Order.objects.get()
        self.assertEqual(str(order.total),'152.58')
        self.assertEqual(str(order.original_total),'29.230000')
        self.assertEqual(str(order.exchange_rate),'5.22000000')
        self.payload['order'].update(vetra_quote_id=200,vetra_quote_plan_id=201,exchange_fetched_at=timezone.now().isoformat())
        self.assertEqual(self.send().status_code,200)
        self.assertEqual(Order.objects.count(),1)
        order.refresh_from_db()
        self.assertEqual(order.vetra_quote_id,100)

    def test_inconsistent_incomplete_and_future_conversion_rejected(self):
        self.exchange_payload()
        self.payload['order']['exchange_rate']='0'
        self.assertEqual(self.send().status_code,400)
        self.payload['order']['exchange_rate']='5.22'
        self.payload['order']['passengers'][0]['unit_price']='152.57'
        self.assertEqual(self.send().status_code,400)
        self.payload['order']['passengers'][0]['unit_price']='152.58'
        self.payload['order']['exchange_date']=str(timezone.localdate()+timedelta(days=1))
        self.assertEqual(self.send().status_code,400)
        self.payload['order']['exchange_date']=str(timezone.localdate())
        del self.payload['order']['exchange_id']
        self.assertEqual(self.send().status_code,400)
        self.assertEqual(Order.objects.count(),0)

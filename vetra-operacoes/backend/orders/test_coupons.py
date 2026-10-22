import uuid
from datetime import timedelta
from decimal import Decimal
from django.conf import settings
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from .models import Coupon, CouponEvent, Order


@override_settings(CHECKOUT_INGEST_TOKEN='test-coupon-token')
class CouponTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser('coupon-admin', 'admin@example.invalid', 'test-only-password')
        cls.staff = User.objects.create_user('coupon-staff', is_staff=True)

    def setUp(self):
        self.client = APIClient()
        self.coupon = Coupon.objects.create(code='VIAJE10', percent='10.00', active=True)
        self.payload = {'request_id': str(uuid.uuid4()), 'coupon_code': 'viaje10', 'expected_total': '135.22', 'order': {
            'customer_name': 'Cliente Cupom', 'customer_email': 'cliente@example.invalid', 'payer_email': 'pagador@example.invalid',
            'destination': 'Europa', 'plan_name': 'Plano Cupom', 'departure': str(timezone.localdate()+timedelta(days=15)),
            'return_date': str(timezone.localdate()+timedelta(days=22)), 'currency': 'BRL', 'payment_method': 'card',
            'passengers': [{'full_name':'Passageiro Teste', 'cpf':'52998224725', 'age':22, 'unit_price':'75.12'},
                           {'full_name':'Outro Passageiro', 'cpf':'11144477735', 'age':35, 'unit_price':'75.13'}]}}

    def send(self):
        return self.client.post('/api/checkout/orders/', self.payload, format='json', HTTP_AUTHORIZATION='Bearer test-coupon-token')

    def test_management_is_superuser_only(self):
        for user in (None, self.staff):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get('/api/coupons/').status_code, 403)
            self.assertEqual(self.client.post('/api/coupons/', {'code':'TESTE', 'percent':'10.00'}, format='json').status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get('/api/coupons/').status_code, 200)

    def test_create_edit_deactivate_audited_and_unique(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post('/api/coupons/', {'code':'ferias20', 'percent':'20.00', 'active':True}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['code'], 'FERIAS20')
        coupon = Coupon.objects.get(code='FERIAS20')
        self.assertEqual(coupon.updated_by, self.admin)
        self.assertEqual(self.client.post('/api/coupons/', {'code':'ferias20','percent':'5.00'}, format='json').status_code, 400)
        update = {'code':'FERIAS20','percent':'15.00','active':False,'version':coupon.version}
        self.assertEqual(self.client.put(f'/api/coupons/{coupon.id}/', update, format='json').status_code, 200)
        self.assertEqual(self.client.put(f'/api/coupons/{coupon.id}/', update, format='json').status_code, 409)
        coupon.refresh_from_db()
        self.assertFalse(coupon.active)
        self.assertEqual(coupon.events.count(), 2)
        for value in ('0', '-1', '100.01', '1.555'):
            self.assertEqual(self.client.post('/api/coupons/', {'code':'INVALIDO', 'percent':value}, format='json').status_code, 400)

    def test_preview_requires_scoped_token_and_uses_saved_percentage(self):
        data = {'code':'viaje10','subtotal':'150.25','currency':'BRL','percent':'99'}
        self.assertEqual(self.client.post('/api/checkout/coupons/validate/', data, format='json').status_code, 403)
        response = self.client.post('/api/checkout/coupons/validate/', data, format='json', HTTP_AUTHORIZATION='Bearer test-coupon-token')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['discount'], '15.03')
        self.assertEqual(response.data['total'], '135.22')

    def test_checkout_saves_real_discount_and_exact_passenger_sum(self):
        self.payload['order'].update(total='0.01',coupon_percent='99',coupon_discount='999')
        response = self.send()
        self.assertEqual(response.status_code, 201, response.data)
        order = Order.objects.get()
        self.assertEqual(order.subtotal, Decimal('150.25'))
        self.assertEqual(order.total, Decimal('135.22'))
        self.assertEqual(order.coupon_discount, Decimal('15.03'))
        self.assertEqual(order.coupon_percent, Decimal('10.00'))
        self.assertEqual(order.coupon_code, 'VIAJE10')
        self.assertEqual(sum(p.unit_price for p in order.passengers.all()), order.total)
        self.assertEqual(order.events.filter(action='coupon_applied').count(), 1)
        self.assertFalse(order.jobs.exists())
        self.assertEqual(response.data['total'], '135.22')

    def test_inactive_unknown_or_changed_coupon_never_silently_changes_total(self):
        self.payload['coupon_code'] = 'UNKNOWN'
        self.assertEqual(self.send().status_code, 409)
        self.payload['coupon_code'] = 'VIAJE10'
        self.coupon.active = False
        self.coupon.save()
        self.assertEqual(self.send().status_code, 409)
        self.coupon.active = True
        self.coupon.percent = Decimal('20')
        self.coupon.save()
        self.assertEqual(self.send().status_code, 409)
        self.assertFalse(Order.objects.exists())

    def test_retry_keeps_discount_snapshot_after_coupon_changes(self):
        first = self.send()
        self.assertEqual(first.status_code, 201)
        self.coupon.active = False
        self.coupon.percent = Decimal('30')
        self.coupon.save()
        second = self.send()
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data['reference'], first.data['reference'])
        self.assertEqual(second.data['total'], '135.22')
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(Order.objects.get().coupon_percent, Decimal('10'))

    def test_discount_keeps_original_exchange_snapshot(self):
        self.payload['order'].update(original_currency='USD',original_total='29.23',exchange_rate='5.22',exchange_date=str(timezone.localdate()),exchange_id=2981,exchange_field='cambio_ita',exchange_fetched_at=timezone.now().isoformat())
        self.payload['order']['passengers'][0]['unit_price'] = '76.29'
        self.payload['order']['passengers'][1]['unit_price'] = '76.29'
        self.payload['expected_total'] = '137.32'
        response = self.send()
        self.assertEqual(response.status_code, 201, response.data)
        order = Order.objects.get()
        self.assertEqual(order.subtotal, Decimal('152.58'))
        self.assertEqual(order.total, Decimal('137.32'))
        self.assertEqual(order.original_total, Decimal('29.23'))

    def test_management_requires_csrf(self):
        client = APIClient(enforce_csrf_checks=True)
        token = client.get('/api/session/').data['csrfToken']
        response = client.post('/api/login/', {'username':'coupon-admin','password':'test-only-password'}, format='json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(client.post('/api/coupons/', {'code':'TESTE','percent':'10'}, format='json').status_code, 403)

    def test_full_discount_is_zero_without_confirming_payment(self):
        self.coupon.percent = Decimal('100')
        self.coupon.save()
        self.payload['expected_total'] = '0.00'
        result = self.send()
        self.assertEqual(result.status_code, 201, result.data)
        order = Order.objects.get()
        self.assertEqual(order.total, Decimal('0'))
        self.assertEqual(order.status, 'awaiting_payment')
        self.assertFalse(order.jobs.exists())

    def test_coupon_requires_reviewed_total_and_admin_routes_are_valid(self):
        self.payload.pop('expected_total')
        self.assertEqual(self.send().status_code, 400)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(f'/api/coupons/{self.coupon.id}/').status_code, 200)
        self.assertEqual(self.client.put('/api/coupons/', {}, format='json').status_code, 405)
        self.assertEqual(self.client.post(f'/api/coupons/{self.coupon.id}/', {}, format='json').status_code, 405)

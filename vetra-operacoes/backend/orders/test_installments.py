from django.contrib.auth.models import User, Group
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient
from .models import InstallmentSettings, InstallmentSettingsEvent


class InstallmentSettingsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('setup_roles', verbosity=0)
        cls.admin = User.objects.create_superuser('rates-admin', 'admin@example.invalid', 'test-only-password')
        cls.manager = User.objects.create_user('rates-manager', is_staff=True)
        cls.manager.groups.add(Group.objects.get(name='Gestão'))

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.url = '/api/settings/installments/'
        self.payload = {'version': 0, 'max_installments': 3, 'options': [
            {'installments': 1, 'enabled': True, 'interest_percent': '0.00'},
            {'installments': 2, 'enabled': True, 'interest_percent': '0.00'},
            {'installments': 3, 'enabled': True, 'interest_percent': '2.50'},
        ]}

    def test_only_superusers_can_read_or_write_even_with_management_role(self):
        for user in (None, self.manager):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.url).status_code, 403)
            self.assertEqual(self.client.put(self.url, self.payload, format='json').status_code, 403)
        self.assertEqual(InstallmentSettings.objects.count(), 0)

    def test_defaults_do_not_enable_credit_terms_without_configuration(self):
        result = self.client.get(self.url)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data['version'], 0)
        self.assertEqual(result.data['max_installments'], 12)
        self.assertEqual([o['installments'] for o in result.data['options'] if o['enabled']], [1])
        self.assertEqual(InstallmentSettings.objects.count(), 0)

    def test_settings_persist_with_actor_and_audit(self):
        response = self.client.put(self.url, self.payload, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        saved = InstallmentSettings.objects.get(pk=1)
        self.assertEqual(saved.updated_by, self.admin)
        self.assertEqual(saved.version, 1)
        self.assertEqual(saved.options[2]['interest_percent'], '2.50')
        self.assertEqual(self.client.get(self.url).data['options'], saved.options)
        event = InstallmentSettingsEvent.objects.get()
        self.assertEqual(event.actor, self.admin)
        self.assertEqual(event.snapshot['options'], saved.options)

    def test_conflicting_update_does_not_overwrite_another_admin(self):
        self.assertEqual(self.client.put(self.url, self.payload, format='json').status_code, 200)
        self.payload['options'][2]['interest_percent'] = '7.00'
        self.assertEqual(self.client.put(self.url, self.payload, format='json').status_code, 409)
        self.assertEqual(InstallmentSettings.objects.get().options[2]['interest_percent'], '2.50')
        self.assertEqual(InstallmentSettingsEvent.objects.count(), 1)
        self.payload['version'] = 1
        self.assertEqual(self.client.put(self.url, self.payload, format='json').status_code, 200)
        self.assertEqual(InstallmentSettings.objects.get().version, 2)

    def test_invalid_rates_duplicate_counts_and_disabled_all_rejected(self):
        for value in ('-0.01', '100.01', '2.555', 'NaN'):
            self.payload['options'][2]['interest_percent'] = value
            self.assertEqual(self.client.put(self.url, self.payload, format='json').status_code, 400)
        self.payload['options'][2]['interest_percent'] = '2.50'
        self.payload['options'][2]['installments'] = 2
        self.assertEqual(self.client.put(self.url, self.payload, format='json').status_code, 400)
        self.payload['options'][2]['installments'] = 3
        for option in self.payload['options']:
            option['enabled'] = False
        self.assertEqual(self.client.put(self.url, self.payload, format='json').status_code, 400)
        self.assertFalse(InstallmentSettings.objects.exists())

    def test_settings_mutation_requires_csrf(self):
        self.client = APIClient(enforce_csrf_checks=True)
        token = self.client.get('/api/session/').data['csrfToken']
        login = self.client.post('/api/login/', {'username': 'rates-admin', 'password': 'test-only-password'}, format='json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(login.status_code, 200)
        self.assertEqual(self.client.put(self.url, self.payload, format='json').status_code, 403)
        self.assertEqual(self.client.put(self.url, self.payload, format='json', HTTP_X_CSRFTOKEN=login.data['csrfToken']).status_code, 200)

    def test_pix_discount_persists_with_card_rules_and_audit(self):
        self.payload.update(pix_enabled=True, pix_discount_percent='5.25')
        result = self.client.put(self.url, self.payload, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertTrue(result.data['pix_enabled'])
        self.assertEqual(result.data['pix_discount_percent'], '5.25')
        saved = InstallmentSettings.objects.get()
        self.assertEqual(saved.options[2]['interest_percent'], '2.50')
        self.assertEqual(InstallmentSettingsEvent.objects.get().snapshot['pix_discount_percent'], '5.25')
        self.assertEqual(self.client.get(self.url).data['pix_discount_percent'], '5.25')

    def test_invalid_pix_discount_does_not_save(self):
        for rate in ('-0.01', '100.01', '1.555', 'NaN'):
            self.payload.update(pix_enabled=True, pix_discount_percent=rate)
            self.assertEqual(self.client.put(self.url, self.payload, format='json').status_code, 400)
        self.assertFalse(InstallmentSettings.objects.exists())

    def test_older_client_preserves_existing_pix_discount(self):
        self.payload.update(pix_enabled=True, pix_discount_percent='5.00')
        self.assertEqual(self.client.put(self.url, self.payload, format='json').status_code, 200)
        self.payload.pop('pix_enabled')
        self.payload.pop('pix_discount_percent')
        self.payload['version'] = 1
        self.assertEqual(self.client.put(self.url, self.payload, format='json').status_code, 200)
        saved = InstallmentSettings.objects.get()
        self.assertTrue(saved.pix_enabled)
        self.assertEqual(str(saved.pix_discount_percent), '5.00')


from decimal import Decimal
from django.test import override_settings
from .installments import installment_options
from .test_coupons import CouponTests
from .models import Order


@override_settings(CHECKOUT_INGEST_TOKEN='test-coupon-token')
class CheckoutInstallmentTests(CouponTests):
    def setUp(self):
        super().setUp()
        self.rules = InstallmentSettings.objects.create(options=[
            {'installments':1,'enabled':True,'interest_percent':'0.00'},
            {'installments':2,'enabled':False,'interest_percent':'0.00'},
            {'installments':3,'enabled':True,'interest_percent':'2.50'}])

    def test_preview_authorization_and_enabled_calculations(self):
        url='/api/checkout/installments/'
        data={'subtotal':'135.22','currency':'BRL'}
        self.assertEqual(self.client.post(url,data,format='json').status_code,403)
        result=self.client.post(url,data,format='json',HTTP_AUTHORIZATION='Bearer test-coupon-token')
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual([o['installments'] for o in result.data['options']],[1,3])
        option=result.data['options'][1]
        self.assertEqual(option['total'],'138.60')
        self.assertEqual(option['installment_amount'],'46.20')

    def test_interest_after_coupon_persists_and_retry_freezes_terms(self):
        self.payload.update(installments=3,expected_payment_total='138.60')
        first=self.send()
        self.assertEqual(first.status_code,201,first.data)
        order=Order.objects.get()
        self.assertEqual(order.installment_count,3)
        self.assertEqual(order.installment_interest_amount,Decimal('3.38'))
        self.assertEqual(order.total,Decimal('138.60'))
        self.assertEqual(sum(p.unit_price for p in order.passengers.all()),order.total)
        self.rules.options[2]['interest_percent']='20.00'
        self.rules.save()
        replay=self.send()
        self.assertEqual(replay.status_code,200,replay.data)
        self.assertEqual(replay.data['total'],'138.60')
        self.assertFalse(order.jobs.exists())

    def test_disabled_or_changed_terms_rejected(self):
        self.payload.update(installments=2,expected_payment_total='135.22')
        self.assertEqual(self.send().status_code,409)
        self.payload.update(installments=3,expected_payment_total='135.22')
        self.assertEqual(self.send().status_code,409)
        self.assertFalse(Order.objects.exists())

    def test_pix_cannot_be_instalments(self):
        self.payload['order']['payment_method']='pix'
        self.payload.update(installments=3,expected_payment_total='138.60')
        self.assertEqual(self.send().status_code,400)

    def test_cash_default_is_always_available(self):
        self.rules.options[0]['enabled']=False
        self.rules.save()
        self.assertEqual(installment_options(Decimal('100'),self.rules)[0]['installments'],1)

    def test_pix_discount_is_applied_after_coupon_and_saved(self):
        self.rules.pix_enabled=True
        self.rules.pix_discount_percent=Decimal('5.00')
        self.rules.save()
        self.payload['order']['payment_method']='pix'
        self.payload['expected_payment_total']='128.46'
        result=self.send()
        self.assertEqual(result.status_code,201,result.data)
        order=Order.objects.get()
        self.assertEqual(order.pix_discount_amount,Decimal('6.76'))
        self.assertEqual(order.pix_discount_percent,Decimal('5.00'))
        self.assertEqual(order.total,Decimal('128.46'))
        self.assertEqual(sum(p.unit_price for p in order.passengers.all()),order.total)
        self.assertFalse(order.jobs.exists())
        self.rules.pix_discount_percent=Decimal('20')
        self.rules.save()
        self.assertEqual(self.send().data['total'],'128.46')

    def test_pix_changed_discount_requires_new_total(self):
        self.rules.pix_enabled=True
        self.rules.pix_discount_percent=Decimal('5.00')
        self.rules.save()
        self.payload['order']['payment_method']='pix'
        self.payload['expected_payment_total']='135.22'
        self.assertEqual(self.send().status_code,409)
        self.assertFalse(Order.objects.exists())

    def test_pix_disabled_and_full_discount(self):
        from .installments import pix_values
        self.rules.pix_enabled=False
        self.rules.pix_discount_percent=Decimal('5')
        self.assertEqual(pix_values(Decimal('401.60'),self.rules)['total'],'401.60')
        self.rules.pix_enabled=True
        self.assertEqual(pix_values(Decimal('401.60'),self.rules)['total'],'381.52')
        self.rules.pix_discount_percent=Decimal('100')
        self.assertEqual(pix_values(Decimal('401.60'),self.rules)['total'],'0.00')

from datetime import timedelta
from decimal import Decimal
from django.conf import settings
from django.contrib.auth.models import User, Group
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from .models import Order, OrderEvent, ProcessingJob

class OperationsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("setup_roles", verbosity=0)
        cls.manager = User.objects.create_user("manager", password="test-only-password", is_staff=True)
        cls.manager.groups.add(Group.objects.get(name="Gestão"))
        cls.finance = User.objects.create_user("finance", is_staff=True)
        cls.finance.groups.add(Group.objects.get(name="Financeiro"))
        cls.external = User.objects.create_user("external", is_staff=False)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.manager)
        self.payload = {"customer_name": "Cliente de Teste", "customer_email": "teste@example.invalid", "destination": "Europa", "plan_name": "Plano de teste", "departure": str(timezone.localdate()+timedelta(days=15)), "return_date": str(timezone.localdate()+timedelta(days=22)), "currency": "BRL", "payment_method": "pix", "passengers": [{"full_name": "Passageiro de Teste", "cpf": "529.982.247-25", "age": 22, "unit_price": "150.25"}]}

    def create_order(self, scope="real"):
        response = self.client.post(f"/api/orders/?scope={scope}", self.payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return Order.objects.get(pk=response.data["id"])

    def test_authentication_and_staff_permissions(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/orders/").status_code, 403)
        self.client.force_authenticate(self.external)
        self.assertEqual(self.client.get("/api/summary/").status_code, 403)
        self.client.force_authenticate(self.finance)
        self.assertEqual(self.client.get("/api/orders/").status_code, 200)
        self.assertEqual(self.client.post("/api/orders/", self.payload, format="json").status_code, 403)

    def test_total_is_calculated_and_financial_state_cannot_be_submitted(self):
        self.payload.update(total="0.01", status="paid", is_demo=True)
        self.payload["passengers"].append({"full_name": "Outro Passageiro", "cpf": "111.444.777-35", "age": 35, "unit_price": "80.10"})
        order = self.create_order()
        self.assertEqual(order.total, Decimal("230.35"))
        self.assertEqual(order.status, "draft")
        self.assertFalse(order.is_demo)
        self.assertEqual(order.events.count(), 1)
        self.assertEqual(self.client.patch(f"/api/orders/{order.id}/", {"status":"issued"}, format="json").status_code, 405)

    def test_cpf_is_validated_encrypted_and_masked(self):
        order = self.create_order()
        passenger = order.passengers.get()
        self.assertNotIn("52998224725", passenger.cpf_encrypted)
        detail = self.client.get(f"/api/orders/{order.id}/").data
        self.assertEqual(detail["passengers"][0]["cpf_masked"], "***.***.***-25")
        self.assertNotIn("cpf_encrypted", str(detail))
        self.payload["passengers"][0]["cpf"] = "111.111.111-11"
        self.assertEqual(self.client.post("/api/orders/", self.payload, format="json").status_code, 400)
        self.assertEqual(Order.objects.count(), 1)

    def test_duplicate_passengers_rejected(self):
        self.payload["passengers"] *= 2
        self.assertEqual(self.client.post("/api/orders/", self.payload, format="json").status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

    def test_period_validation_and_same_day(self):
        self.payload["return_date"] = self.payload["departure"]
        self.create_order()
        self.payload["return_date"] = str(timezone.localdate()+timedelta(days=400))
        self.assertEqual(self.client.post("/api/orders/", self.payload, format="json").status_code, 400)
        self.payload["departure"] = str(timezone.localdate()-timedelta(days=1))
        self.assertEqual(self.client.post("/api/orders/", self.payload, format="json").status_code, 400)

    @override_settings(DEBUG=True)
    def test_demo_orders_are_isolated_from_real_orders(self):
        real = self.create_order()
        demo = self.create_order("demo")
        self.assertEqual(self.client.get("/api/orders/").data["count"], 1)
        self.assertEqual(self.client.get("/api/orders/?scope=demo").data["count"], 1)
        self.assertEqual(self.client.get(f"/api/orders/{demo.id}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/orders/{real.id}/?scope=demo").status_code, 404)
        self.assertEqual(self.client.get("/api/summary/").data["total"], 1)

    @override_settings(DEBUG=False)
    def test_demo_unavailable_in_production(self):
        self.assertEqual(self.client.get("/api/orders/?scope=demo").status_code, 400)

    def test_cancel_records_actor_and_does_not_allow_paid_orders(self):
        order = self.create_order()
        response = self.client.post(f"/api/orders/{order.id}/cancel/", {"reason": "Cliente desistiu antes do pagamento."}, format="json")
        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, "cancelled")
        self.assertEqual(order.events.filter(action="cancelled").get().actor, self.manager)
        order.status = "paid"
        order.save()
        self.assertEqual(self.client.post(f"/api/orders/{order.id}/cancel/", {"reason":"Não pode cancelar por este fluxo."}, format="json").status_code, 409)

    def test_totals_are_separated_by_currency_and_pending_is_not_revenue(self):
        first = self.create_order()
        first.status = "paid"
        first.save()
        self.payload["currency"] = "USD"
        second = self.create_order()
        second.status = "issued"
        second.save()
        self.create_order()
        summary = self.client.get("/api/summary/").data
        self.assertEqual({r["currency"]:r["total"] for r in summary["revenue"]}, {"BRL":"150.25", "USD":"150.25"})
        self.assertEqual(summary["pending"], 1)
        self.assertFalse(summary["processing_enabled"])

    def test_export_respects_scope_filters_permissions_and_formula_safety(self):
        self.payload["customer_name"] = "=HYPERLINK(test)"
        order = self.create_order()
        exported = self.client.get("/api/orders/export/?search="+order.reference)
        self.assertEqual(exported.status_code, 200)
        content = exported.content.decode("utf-8")
        self.assertIn("'=HYPERLINK(test)", content)
        self.assertNotIn("52998224725", content)
        self.assertIn("BRL", content)
        self.client.force_authenticate(self.external)
        self.assertEqual(self.client.get("/api/orders/export/").status_code, 403)

    def test_filters_reject_invalid_dates_and_status(self):
        self.assertEqual(self.client.get("/api/orders/?start=not-a-date").status_code, 400)
        self.assertEqual(self.client.get("/api/orders/?status=invalid").status_code, 400)
        self.assertEqual(self.client.get("/api/orders/?start=2026-12-01&end=2026-01-01").status_code, 400)

    def test_processing_idempotency_key_is_unique(self):
        order = self.create_order()
        ProcessingJob.objects.create(order=order, idempotency_key="test-key")
        with self.assertRaises(IntegrityError), transaction.atomic():
            ProcessingJob.objects.create(order=order, idempotency_key="test-key")

    def test_processing_filter_is_applied_before_pagination_and_export(self):
        self.create_order()
        paid = self.create_order()
        paid.status = Order.Status.PAID
        paid.save()
        response = self.client.get("/api/orders/?processing=1")
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], str(paid.id))
        self.assertEqual(self.client.get("/api/summary/?processing=1").data["total"], 1)
        self.assertEqual(len(self.client.get("/api/orders/export/?processing=1").content.decode("utf-8").splitlines()), 2)

    def test_staff_without_order_permission_cannot_open_session(self):
        staff = User.objects.create_user("without-permission", is_staff=True)
        self.client.force_authenticate(staff)
        self.assertIsNone(self.client.get("/api/session/").data["user"])
        self.assertEqual(self.client.get("/api/orders/").status_code, 403)

    def test_login_and_mutations_require_csrf(self):
        client = APIClient(enforce_csrf_checks=True)
        credentials = {"username":"manager", "password":"test-only-password"}
        self.assertEqual(client.post("/api/login/", credentials, format="json").status_code, 403)
        token = client.get("/api/session/").data["csrfToken"]
        login_response = client.post("/api/login/", credentials, format="json", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(client.post("/api/orders/", self.payload, format="json").status_code, 403)
        token = login_response.data["csrfToken"]
        self.assertEqual(client.post("/api/orders/", self.payload, format="json", HTTP_X_CSRFTOKEN=token).status_code, 201)

    def test_cancel_requires_permission_reason_and_keeps_financial_values(self):
        order = self.create_order()
        url = f"/api/orders/{order.id}/cancel/"
        self.client.force_authenticate(self.finance)
        self.assertEqual(self.client.post(url, {"reason": "Solicitado pelo cliente."}, format="json").status_code, 403)
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(url, {"reason": ""}, format="json").status_code, 400)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.DRAFT)
        result = self.client.post(url, {"reason": "Solicitado pelo cliente."}, format="json")
        self.assertEqual(result.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.total, Decimal("150.25"))
        self.assertEqual(order.status, Order.Status.CANCELLED)
        self.assertEqual(self.client.post(url, {"reason": "Solicitado novamente."}, format="json").status_code, 409)
        self.assertEqual(order.events.filter(action="cancelled").count(), 1)

    def test_process_is_internal_audited_and_idempotent(self):
        order = self.create_order()
        order.status = Order.Status.AWAITING_PAYMENT
        order.save()
        url = f"/api/orders/{order.id}/process/"
        result = self.client.post(url, {}, format="json")
        self.assertEqual(result.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.PROCESSING)
        self.assertEqual(order.total, Decimal("150.25"))
        self.assertEqual(order.payment_method, "pix")
        self.assertEqual(result.data["status_label"], "Em processamento")
        self.assertEqual(order.events.get(action="processing_started").actor, self.manager)
        self.assertFalse(ProcessingJob.objects.filter(order=order).exists())
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 200)
        self.assertEqual(order.events.filter(action="processing_started").count(), 1)
        summary = self.client.get("/api/summary/").data
        self.assertEqual(summary["pending"], 1)
        self.assertEqual(summary["confirmed"], 0)
        self.assertEqual(summary["revenue"], [])
        self.assertEqual(self.client.get("/api/orders/?status=processing").data["count"], 1)
        self.assertEqual(self.client.get("/api/orders/?processing=1").data["count"], 0)
        cancelled = self.client.post(f"/api/orders/{order.id}/cancel/", {"reason":"Cliente desistiu durante a análise."}, format="json")
        self.assertEqual(cancelled.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.CANCELLED)

    def test_process_requires_specific_permission(self):
        order = self.create_order()
        self.client.force_authenticate(self.finance)
        self.assertFalse(self.client.get("/api/session/").data["user"]["can_process"])
        self.assertEqual(self.client.post(f"/api/orders/{order.id}/process/", {}, format="json").status_code, 403)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.DRAFT)
        self.assertEqual(order.events.count(), 1)

    def test_process_rejects_financial_or_closed_states(self):
        order = self.create_order()
        for state in (Order.Status.CANCELLED, Order.Status.PAID, Order.Status.ISSUING, Order.Status.ISSUED, Order.Status.FAILED):
            order.status = state
            order.save()
            self.assertEqual(self.client.post(f"/api/orders/{order.id}/process/", {}, format="json").status_code, 409)
            order.refresh_from_db()
            self.assertEqual(order.status, state)
        self.assertEqual(order.events.count(), 1)

    @override_settings(DEBUG=True)
    def test_process_respects_real_demo_scope(self):
        demo = self.create_order("demo")
        self.assertEqual(self.client.post(f"/api/orders/{demo.id}/process/", {}, format="json").status_code, 404)
        self.assertEqual(self.client.post(f"/api/orders/{demo.id}/process/?scope=demo", {}, format="json").status_code, 200)

    def test_soft_delete_preserves_record_and_hides_default_lists(self):
        order = self.create_order()
        order.status = Order.Status.PAID
        order.save()
        admin = User.objects.create_superuser('delete-admin', 'admin@example.invalid', 'test-only-password')
        self.client.force_authenticate(admin)
        url = f"/api/orders/{order.id}/exclude/"
        response = self.client.post(url, {'reason': 'Pedido duplicado na operação.'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.DELETED)
        self.assertEqual(order.status_before_deletion, Order.Status.PAID)
        self.assertEqual(order.total, Decimal('150.25'))
        self.assertEqual(order.passengers.count(), 1)
        self.assertEqual(order.events.get(action='deleted').actor, admin)
        self.assertEqual(self.client.get('/api/orders/').data['count'], 0)
        self.assertEqual(self.client.get('/api/orders/?search='+order.reference).data['count'], 0)
        self.assertEqual(self.client.get('/api/orders/?status=deleted').data['count'], 1)
        self.assertEqual(self.client.get('/api/summary/').data['total'], 0)
        self.assertEqual(self.client.get('/api/summary/?status=deleted').data['total'], 1)
        self.assertEqual(len(self.client.get('/api/orders/export/').content.decode('utf-8').splitlines()), 1)
        self.assertEqual(len(self.client.get('/api/orders/export/?status=deleted').content.decode('utf-8').splitlines()), 2)
        self.assertEqual(self.client.get(f'/api/orders/{order.id}/').data['status_label'], 'Excluído')
        self.assertEqual(self.client.post(url, {'reason': 'Pedido duplicado na operação.'}, format='json').status_code, 200)
        self.assertEqual(order.events.filter(action='deleted').count(), 1)
        self.assertEqual(self.client.post(f'/api/orders/{order.id}/process/', {}, format='json').status_code, 404)
        self.assertEqual(self.client.post(f'/api/orders/{order.id}/cancel/', {'reason':'Não pode cancelar um excluído.'}, format='json').status_code, 404)
        self.assertEqual(Order.objects.count(), 1)

    def test_soft_delete_requires_delete_permission_and_reason(self):
        order = self.create_order()
        url = f'/api/orders/{order.id}/exclude/'
        self.assertFalse(self.client.get('/api/session/').data['user']['can_delete'])
        self.assertEqual(self.client.post(url, {'reason':'Teste de exclusão.'}, format='json').status_code, 403)
        admin = User.objects.create_superuser('exclude-admin', 'admin@example.invalid', 'test-only-password')
        self.client.force_authenticate(admin)
        self.assertTrue(self.client.get('/api/session/').data['user']['can_delete'])
        for reason in ('', 'abc', 'x'*151, None):
            self.assertEqual(self.client.post(url, {'reason':reason}, format='json').status_code, 400)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.DRAFT)
        self.assertEqual(order.events.count(), 1)
        self.assertEqual(self.client.delete(f'/api/orders/{order.id}/').status_code, 405)

    @override_settings(DEBUG=True)
    def test_soft_delete_respects_demo_scope(self):
        demo = self.create_order('demo')
        admin = User.objects.create_superuser('scope-admin', 'admin@example.invalid', 'test-only-password')
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.post(f'/api/orders/{demo.id}/exclude/', {'reason':'Demo de exclusão.'}, format='json').status_code, 404)
        self.assertEqual(self.client.post(f'/api/orders/{demo.id}/exclude/?scope=demo', {'reason':'Demo de exclusão.'}, format='json').status_code, 200)
        self.assertEqual(self.client.get('/api/orders/?status=deleted').data['count'], 0)
        self.assertEqual(self.client.get('/api/orders/?scope=demo&status=deleted').data['count'], 1)

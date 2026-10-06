import json
import secrets
from datetime import timedelta
from decimal import Decimal
from django.conf import settings
from django.contrib.auth.models import User, Group
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from orders.models import Order, Passenger, OrderEvent

class Command(BaseCommand):
    help = "Prepara uma demonstração local, com usuário restrito e dados fictícios."
    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG or any(host not in ("127.0.0.1", "localhost", "testserver") for host in settings.ALLOWED_HOSTS):
            raise CommandError("Demonstração permitida apenas no ambiente local.")
        call_command("setup_roles")
        username = "demo.operacoes"
        access_path = settings.PROJECT_DIR / ".runtime" / "preview-access.json"
        if User.objects.filter(username=username).exists():
            self.stdout.write("Demonstração já preparada. Nenhuma senha foi alterada.")
            return
        password = secrets.token_urlsafe(24)
        user = User.objects.create_user(username=username, password=password, first_name="Equipe", last_name="Vetra", is_staff=True)
        user.groups.add(Group.objects.get(name="Gestão"))
        statuses = [Order.Status.ISSUED, Order.Status.PAID, Order.Status.AWAITING_PAYMENT, Order.Status.FAILED, Order.Status.DRAFT, Order.Status.ISSUED, Order.Status.ISSUING, Order.Status.CANCELLED]
        destinations = ["Europa", "América do Norte", "América do Sul"]
        for index, state in enumerate(statuses):
            value = Decimal("180.00") + Decimal(index * 35)
            order = Order.objects.create(customer_name=f"Cliente Exemplo {index+1:02}", customer_email=f"cliente{index+1}@example.invalid", destination=destinations[index%3], plan_name=["VETRA 40 MIL EUROPA", "VETRA 60 MIL", "VETRA 80 MIL"][index%3], departure=timezone.localdate()+timedelta(days=15+index), return_date=timezone.localdate()+timedelta(days=22+index), currency="BRL", total=value, payment_method="pix" if index%2 else "card", status=state, is_demo=True, created_by=user)
            passenger = Passenger(order=order, full_name=f"Passageiro Exemplo {index+1:02}", age=22+index, unit_price=value)
            passenger.set_cpf("52998224725")
            passenger.save()
            created_at = timezone.now()-timedelta(days=index%6)
            Order.objects.filter(pk=order.pk).update(created_at=created_at)
            OrderEvent.objects.create(order=order, actor=user, action="demo", description="Registro fictício para demonstração. Nenhuma cobrança ou emissão foi realizada.")
        access_path.parent.mkdir(exist_ok=True)
        access_path.write_text(json.dumps({"username": username, "password": password}), encoding="utf-8")
        self.stdout.write(self.style.SUCCESS("Demonstração preparada. Acesso salvo somente em .runtime/preview-access.json."))

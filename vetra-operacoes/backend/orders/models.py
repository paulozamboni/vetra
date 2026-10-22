import uuid
from cryptography.fernet import Fernet
from django.conf import settings
from django.db import models
from django.db.models import Q, F

class Order(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Rascunho"
        AWAITING_PAYMENT = "awaiting_payment", "Aguardando pagamento"
        PROCESSING = "processing", "Em processamento"
        PAID = "paid", "Pagamento confirmado"
        ISSUING = "issuing", "Em emissão"
        ISSUED = "issued", "Apólice emitida"
        FAILED = "failed", "Falha na emissão"
        CANCELLED = "cancelled", "Cancelado"
        DELETED = "deleted", "Excluído"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=20, unique=True, editable=False)
    customer_name = models.CharField(max_length=150)
    customer_email = models.EmailField()
    customer_phone = models.CharField(max_length=25, blank=True, default="")
    payer_email = models.EmailField(blank=True, default="")
    destination = models.CharField(max_length=100)
    plan_name = models.CharField(max_length=150)
    plan_id = models.PositiveIntegerField(null=True, blank=True)
    vetra_quote_id = models.PositiveIntegerField(null=True, blank=True)
    vetra_quote_plan_id = models.PositiveIntegerField(null=True, blank=True)
    departure = models.DateField()
    return_date = models.DateField()
    currency = models.CharField(max_length=3, choices=[("BRL", "BRL"), ("USD", "USD"), ("EUR", "EUR"), ("XXX", "Moeda a confirmar")])
    total = models.DecimalField(max_digits=12, decimal_places=2)
    original_total = models.DecimalField(max_digits=16, decimal_places=6, null=True, blank=True)
    original_currency = models.CharField(max_length=3, blank=True)
    exchange_rate = models.DecimalField(max_digits=16, decimal_places=8, null=True, blank=True)
    exchange_date = models.DateField(null=True, blank=True)
    exchange_id = models.PositiveIntegerField(null=True, blank=True)
    exchange_field = models.CharField(max_length=30, blank=True)
    exchange_fetched_at = models.DateTimeField(null=True, blank=True)
    payment_method = models.CharField(max_length=10, choices=[("pix", "Pix"), ("card", "Cartão")])
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.DRAFT, db_index=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    coupon_code = models.CharField(max_length=32, blank=True, default="")
    coupon_percent = models.DecimalField(max_digits=5, decimal_places=2, default="0.00")
    coupon_discount = models.DecimalField(max_digits=12, decimal_places=2, default="0.00")
    pix_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default="0.00")
    pix_discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default="0.00")
    installment_count = models.PositiveSmallIntegerField(default=1)
    installment_interest_percent = models.DecimalField(max_digits=5, decimal_places=2, default="0.00")
    installment_interest_amount = models.DecimalField(max_digits=12, decimal_places=2, default="0.00")
    status_before_deletion = models.CharField(max_length=24, blank=True, default="")
    source = models.CharField(max_length=20, default="manual")
    is_demo = models.BooleanField(default=False, db_index=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    checkout_key = models.UUIDField(null=True, unique=True, editable=False)
    checkout_hash = models.CharField(max_length=64, blank=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        permissions = [("export_orders", "Exportar relatórios de pedidos"), ("cancel_order", "Cancelar pedidos sem pagamento"), ("process_order", "Gerenciar processamento interno de pedidos")]
        constraints = [models.CheckConstraint(condition=Q(total__gte=0), name="order_nonnegative_total"), models.CheckConstraint(condition=Q(return_date__gte=F("departure")), name="order_valid_period")]

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = "VT-" + self.id.hex[:12].upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.reference

class Passenger(models.Model):
    order = models.ForeignKey(Order, related_name="passengers", on_delete=models.CASCADE)
    full_name = models.CharField(max_length=150)
    age = models.PositiveSmallIntegerField()
    cpf_encrypted = models.TextField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(age__lte=120), name="passenger_valid_age"), models.CheckConstraint(condition=Q(unit_price__gte=0), name="passenger_nonnegative_price")]

    def set_cpf(self, value):
        self.cpf_encrypted = Fernet(settings.CPF_ENCRYPTION_KEY.encode()).encrypt(value.encode()).decode()

    @property
    def cpf_masked(self):
        cpf = Fernet(settings.CPF_ENCRYPTION_KEY.encode()).decrypt(self.cpf_encrypted.encode()).decode()
        return "***.***.***-" + cpf[-2:]

class OrderEvent(models.Model):
    order = models.ForeignKey(Order, related_name="events", on_delete=models.CASCADE)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=40)
    description = models.CharField(max_length=250)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

class ProcessingJob(models.Model):
    order = models.ForeignKey(Order, related_name="jobs", on_delete=models.PROTECT)
    idempotency_key = models.CharField(max_length=100, unique=True)
    status = models.CharField(max_length=16, default="blocked")
    attempts = models.PositiveIntegerField(default=0)
    provider_reference = models.CharField(max_length=100, blank=True)
    last_error = models.CharField(max_length=250, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class InstallmentSettings(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    max_installments = models.PositiveSmallIntegerField(default=12)
    pix_enabled = models.BooleanField(default=False)
    pix_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default="0.00")
    options = models.JSONField(default=list)
    version = models.PositiveIntegerField(default=0)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(id=1), name="installment_settings_singleton")]


class InstallmentSettingsEvent(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    snapshot = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)


class Coupon(models.Model):
    code = models.CharField(max_length=32, unique=True)
    description = models.CharField(max_length=150, blank=True)
    percent = models.DecimalField(max_digits=5, decimal_places=2)
    active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code']
        constraints = [models.CheckConstraint(condition=Q(percent__gt=0, percent__lte=100), name='coupon_valid_percent')]


class CouponEvent(models.Model):
    coupon = models.ForeignKey(Coupon, on_delete=models.PROTECT, related_name='events')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    snapshot = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

import hmac
from decimal import Decimal, ROUND_HALF_UP
from django.conf import settings
from django.db import transaction
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.permissions import BasePermission, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import InstallmentSettings, InstallmentSettingsEvent


class SuperuserOnly(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u.is_authenticated and u.is_active and u.is_staff and u.is_superuser)


class InstallmentOption(serializers.Serializer):
    installments = serializers.IntegerField(min_value=1, max_value=24)
    enabled = serializers.BooleanField()
    interest_percent = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal('0'), max_value=Decimal('100'))


class InstallmentInput(serializers.Serializer):
    version = serializers.IntegerField(min_value=0)
    max_installments = serializers.IntegerField(min_value=1, max_value=24)
    options = InstallmentOption(many=True, min_length=1, max_length=24)
    pix_enabled = serializers.BooleanField(required=False)
    pix_discount_percent = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("100"), required=False)

    def validate(self, attrs):
        counts = [o['installments'] for o in attrs['options']]
        if sorted(counts) != list(range(1, attrs['max_installments'] + 1)):
            raise serializers.ValidationError('Informe uma única configuração para cada opção, de 1 até o máximo de parcelas.')
        if not attrs.get('pix_enabled', False) and not any(o['enabled'] for o in attrs['options']):
            raise serializers.ValidationError('Mantenha pelo menos uma opção de cartão ou desconto Pix ativa.')
        return attrs


def settings_data(obj):
    return {'version': obj.version, 'max_installments': obj.max_installments, 'pix_enabled': obj.pix_enabled, 'pix_discount_percent': str(obj.pix_discount_percent),
            'options': obj.options or [{'installments': n, 'enabled': n == 1, 'interest_percent': '0.00'} for n in range(1, obj.max_installments + 1)],
            'updated_at': obj.updated_at if obj.pk and obj.version else None,
            'updated_by': obj.updated_by.username if obj.updated_by_id else None}


@method_decorator(never_cache, name='dispatch')
class InstallmentSettingsView(APIView):
    permission_classes = [SuperuserOnly]

    def get(self, request):
        obj = InstallmentSettings.objects.select_related('updated_by').filter(pk=1).first() or InstallmentSettings()
        return Response(settings_data(obj))

    def put(self, request):
        serializer = InstallmentInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            InstallmentSettings.objects.get_or_create(pk=1)
            obj = InstallmentSettings.objects.select_for_update().get(pk=1)
            if obj.version != data['version']:
                return Response({'detail': 'A configuração foi alterada por outro administrador. Recarregue antes de salvar.'}, status=409)
            obj.max_installments = data['max_installments']
            obj.pix_enabled = data.get('pix_enabled', obj.pix_enabled)
            obj.pix_discount_percent = data.get('pix_discount_percent', obj.pix_discount_percent)
            obj.options = [{'installments': o['installments'], 'enabled': o['enabled'], 'interest_percent': str(o['interest_percent'])} for o in sorted(data['options'], key=lambda o: o['installments'])]
            obj.version += 1
            obj.updated_by = request.user
            obj.save()
            InstallmentSettingsEvent.objects.create(actor=request.user, snapshot={'version': obj.version, 'max_installments': obj.max_installments, 'options': obj.options, 'pix_enabled': obj.pix_enabled, 'pix_discount_percent': str(obj.pix_discount_percent)})
        return Response(settings_data(obj))


def installment_options(principal, settings_obj=None):
    obj = settings_obj or InstallmentSettings.objects.filter(pk=1).first() or InstallmentSettings()
    rows = list(obj.options or [])
    # A single payment is always available and is the checkout default.
    first = next((r for r in rows if r['installments'] == 1 and r['enabled']), {'installments':1, 'enabled':True, 'interest_percent':'0.00'})
    rows = [first] + [r for r in rows if r['installments'] > 1 and r['installments'] <= obj.max_installments and r['enabled']]
    result = []
    for row in sorted(rows, key=lambda r:r['installments']):
        percent = Decimal(row['interest_percent'])
        interest = (principal * percent / Decimal('100')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        total = principal + interest
        if total > Decimal('9999999999.99'):
            continue
        part = (total / row['installments']).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        result.append({'installments': row['installments'], 'interest_percent': str(percent), 'interest_amount': str(interest), 'total': str(total), 'installment_amount': str(part), 'principal': str(principal)})
    return result


def pix_values(principal, settings_obj=None):
    obj = settings_obj or InstallmentSettings.objects.filter(pk=1).first() or InstallmentSettings()
    percent = obj.pix_discount_percent if obj.pix_enabled else Decimal('0.00')
    discount = (principal * percent / Decimal('100')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return {'principal': str(principal), 'percent': str(percent), 'discount': str(discount), 'total': str(principal - discount)}


class InstallmentPreviewInput(serializers.Serializer):
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'))
    currency = serializers.ChoiceField(choices=['BRL'])


@method_decorator(never_cache, name='dispatch')
class CheckoutInstallmentsView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        token = settings.CHECKOUT_INGEST_TOKEN
        if not token or not hmac.compare_digest(request.headers.get('Authorization',''), 'Bearer '+token):
            return Response({'error':'Acesso não autorizado.'}, status=403)
        serializer = InstallmentPreviewInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = InstallmentSettings.objects.filter(pk=1).first() or InstallmentSettings()
        principal = serializer.validated_data['subtotal']
        return Response({'options': installment_options(principal, obj), 'pix': pix_values(principal, obj), 'currency':'BRL'})

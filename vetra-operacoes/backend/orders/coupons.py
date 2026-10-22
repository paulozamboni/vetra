import re
import hmac
from decimal import Decimal, ROUND_HALF_UP
from django.conf import settings
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from .installments import SuperuserOnly
from .models import Coupon, CouponEvent


def normalize_code(value):
    code = str(value or '').strip().upper()
    if not re.fullmatch(r'[A-Z0-9_-]{3,32}', code):
        raise serializers.ValidationError({'coupon': 'Informe um cupom válido, com 3 a 32 letras, números, hífen ou sublinhado.'})
    return code


def discount_values(subtotal, percent):
    discount = (subtotal * percent / Decimal('100')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return discount, subtotal - discount


class CouponSerializer(serializers.ModelSerializer):
    code = serializers.CharField(min_length=3, max_length=32)
    percent = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal('0.01'), max_value=Decimal('100'))
    class Meta:
        model = Coupon
        fields = ['id', 'code', 'description', 'percent', 'active', 'version', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {'version': {'required': False}}

    def validate_code(self, value):
        code = normalize_code(value)
        existing = Coupon.objects.filter(code=code)
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError('Já existe um cupom com este código.')
        return code


@method_decorator(never_cache, name='dispatch')
class CouponAdminView(APIView):
    permission_classes = [SuperuserOnly]

    def get(self, request, pk=None):
        if pk is not None:
            return Response(CouponSerializer(get_object_or_404(Coupon, pk=pk)).data)
        return Response({'results': CouponSerializer(Coupon.objects.all(), many=True).data})

    def post(self, request, pk=None):
        if pk is not None:
            return Response(status=405)
        serializer = CouponSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                coupon = serializer.save(updated_by=request.user, version=1)
                CouponEvent.objects.create(coupon=coupon, actor=request.user, snapshot=dict(CouponSerializer(coupon).data))
        except IntegrityError:
            raise serializers.ValidationError({'code': 'Já existe um cupom com este código.'})
        return Response(CouponSerializer(coupon).data, status=201)

    def put(self, request, pk=None):
        if pk is None:
            return Response(status=405)
        try:
            with transaction.atomic():
                coupon = get_object_or_404(Coupon.objects.select_for_update(), pk=pk)
                if request.data.get('version') != coupon.version:
                    return Response({'detail': 'Este cupom foi alterado. Recarregue antes de salvar.'}, status=409)
                serializer = CouponSerializer(coupon, data=request.data)
                serializer.is_valid(raise_exception=True)
                coupon = serializer.save(updated_by=request.user, version=coupon.version + 1)
                CouponEvent.objects.create(coupon=coupon, actor=request.user, snapshot=dict(CouponSerializer(coupon).data))
        except IntegrityError:
            raise serializers.ValidationError({'code': 'Já existe um cupom com este código.'})
        return Response(CouponSerializer(coupon).data)


class CouponPreviewInput(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    currency = serializers.ChoiceField(choices=['BRL'])


@method_decorator(never_cache, name='dispatch')
class CheckoutCouponView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        token = settings.CHECKOUT_INGEST_TOKEN
        if not token or not hmac.compare_digest(request.headers.get('Authorization', ''), 'Bearer ' + token):
            return Response({'error': 'Acesso não autorizado.'}, status=403)
        serializer = CouponPreviewInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = normalize_code(serializer.validated_data['code'])
        coupon = Coupon.objects.filter(code=code, active=True).first()
        if not coupon:
            return Response({'error': 'Cupom inválido ou inativo.'}, status=409)
        subtotal = serializer.validated_data['subtotal']
        discount, total = discount_values(subtotal, coupon.percent)
        return Response({'code': coupon.code, 'percent': str(coupon.percent), 'subtotal': str(subtotal), 'discount': str(discount), 'total': str(total), 'currency': 'BRL'})

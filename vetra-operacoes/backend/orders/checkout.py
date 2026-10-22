import hashlib
import hmac
import json
import uuid
from decimal import Decimal
from django.conf import settings
from django.db import IntegrityError, transaction
from rest_framework.permissions import AllowAny
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Order, OrderEvent, Coupon, InstallmentSettings
from .coupons import normalize_code, discount_values
from .installments import installment_options, pix_values
from .serializers import OrderCreateSerializer


class CouponSelection(serializers.Serializer):
    installments = serializers.IntegerField(min_value=1, max_value=24, required=False, default=1)
    expected_payment_total = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False)
    coupon_code = serializers.CharField(max_length=32, required=False, allow_blank=True)
    expected_total = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'), required=False)


def order_receipt(order):
    return {'reference': order.reference, 'status': order.status, 'total': str(order.total), 'currency': order.currency,
            'pix_discount_percent': str(order.pix_discount_percent), 'pix_discount_amount': str(order.pix_discount_amount),
            'subtotal': str(order.subtotal) if order.subtotal is not None else str(order.total), 'coupon_code': order.coupon_code,
            'coupon_percent': str(order.coupon_percent), 'coupon_discount': str(order.coupon_discount), 'installment_count': order.installment_count,
            'installment_interest_percent': str(order.installment_interest_percent), 'installment_interest_amount': str(order.installment_interest_amount)}


class CheckoutIngestView(APIView):
    # Only the B2C server can create through this endpoint. No staff credentials
    # or browser cookies are accepted, and the response contains no passenger data.
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        expected = settings.CHECKOUT_INGEST_TOKEN
        supplied = request.headers.get("Authorization", "")
        if not expected or not hmac.compare_digest(supplied, "Bearer " + expected):
            return Response({"error": "Acesso não autorizado."}, status=403)
        if len(request.body) > 15000:
            return Response({"error": "Dados inválidos."}, status=413)
        try:
            key = uuid.UUID(str(request.data.get("request_id")))
        except (ValueError, TypeError):
            return Response({"error": "Identificador inválido."}, status=400)
        coupon_selection = CouponSelection(data=request.data)
        coupon_selection.is_valid(raise_exception=True)
        raw_code = coupon_selection.validated_data.get('coupon_code', '')
        code = normalize_code(raw_code) if raw_code else ''
        if code and 'expected_total' not in coupon_selection.validated_data:
            return Response({'error': 'Confira o valor com desconto antes de enviar.'}, status=400)
        serializer = OrderCreateSerializer(data=request.data.get("order"))
        serializer.is_valid(raise_exception=True)
        # A retry may produce a new upstream quotation ID and observation time.
        # Keep the financial snapshot and personal data in the fingerprint.
        fingerprint = {k: v for k, v in serializer.validated_data.items() if k not in ("vetra_quote_id", "vetra_quote_plan_id", "exchange_fetched_at")}
        if code:
            fingerprint['coupon_code'] = code
        count = coupon_selection.validated_data['installments']
        if count != 1:
            fingerprint['installments'] = count
        digest = hashlib.sha256(json.dumps(fingerprint, sort_keys=True, default=str).encode()).hexdigest()

        def existing_response(order):
            if order.checkout_hash != digest:
                return Response({"error": "Este identificador já foi utilizado com outros dados."}, status=409)
            return Response(order_receipt(order), status=200)

        existing = Order.objects.filter(checkout_key=key).first()
        if existing:
            return existing_response(existing)
        try:
            with transaction.atomic():
                subtotal = sum(p['unit_price'] for p in serializer.validated_data['passengers'])
                coupon_percent, coupon_discount = Decimal('0.00'), Decimal('0.00')
                total = subtotal
                if code:
                    if serializer.validated_data['currency'] != 'BRL':
                        return Response({'error': 'O cupom só pode ser aplicado a valores em BRL.'}, status=409)
                    coupon = Coupon.objects.select_for_update().filter(code=code, active=True).first()
                    if not coupon:
                        return Response({'error': 'Cupom inválido ou inativo. Remova ou confira o cupom.'}, status=409)
                    coupon_percent = coupon.percent
                    coupon_discount, total = discount_values(subtotal, coupon_percent)
                    if total != coupon_selection.validated_data['expected_total']:
                        return Response({'error': 'O desconto do cupom mudou. Aplique o cupom novamente e confira o total.'}, status=409)
                    base, remainder = divmod(int(total * 100), len(serializer.validated_data['passengers']))
                    for i, passenger in enumerate(serializer.validated_data['passengers']):
                        passenger['unit_price'] = Decimal(base + (1 if i < remainder else 0)) / 100
                principal = total
                interest_percent, interest_amount = Decimal('0.00'), Decimal('0.00')
                pix_percent, pix_discount = Decimal('0.00'), Decimal('0.00')
                if serializer.validated_data['payment_method'] == 'card':
                    settings_obj = InstallmentSettings.objects.select_for_update().filter(pk=1).first() or InstallmentSettings()
                    option = next((o for o in installment_options(principal, settings_obj) if o['installments'] == count), None)
                    if not option:
                        return Response({'error':'O parcelamento escolhido não está mais disponível. Selecione novamente.'}, status=409)
                    interest_percent, interest_amount = Decimal(option['interest_percent']), Decimal(option['interest_amount'])
                    total = Decimal(option['total'])
                    if (count > 1 or interest_amount > 0) and 'expected_payment_total' not in coupon_selection.validated_data:
                        return Response({'error':'Confira o total do parcelamento antes de enviar.'}, status=409)
                elif count != 1:
                    return Response({'error':'O Pix não permite parcelamento.'}, status=400)
                else:
                    settings_obj = InstallmentSettings.objects.select_for_update().filter(pk=1).first() or InstallmentSettings()
                    pix = pix_values(principal, settings_obj)
                    pix_percent, pix_discount = Decimal(pix['percent']), Decimal(pix['discount'])
                    total = Decimal(pix['total'])
                    if pix_discount > 0 and 'expected_payment_total' not in coupon_selection.validated_data:
                        return Response({'error':'Confira o desconto Pix antes de enviar.'}, status=409)
                if 'expected_payment_total' in coupon_selection.validated_data and total != coupon_selection.validated_data['expected_payment_total']:
                    return Response({'error':'As condições de pagamento mudaram. Recarregue as opções e confira o total.'}, status=409)
                cents, remainder = divmod(int(total * 100), len(serializer.validated_data['passengers']))
                for i, passenger in enumerate(serializer.validated_data['passengers']):
                    passenger['unit_price'] = Decimal(cents + (1 if i < remainder else 0)) / 100
                order = serializer.save(created_by=None, checkout_key=key, checkout_hash=digest, source="checkout", is_demo=False,
                                        status=Order.Status.AWAITING_PAYMENT, subtotal=subtotal, coupon_code=code,
                                        coupon_percent=coupon_percent, coupon_discount=coupon_discount, installment_count=count,
                                        installment_interest_percent=interest_percent, installment_interest_amount=interest_amount,
                                        pix_discount_percent=pix_percent, pix_discount_amount=pix_discount)
                if serializer.validated_data['payment_method'] == 'card':
                    OrderEvent.objects.create(order=order, action='installments_selected', description=f'Pagamento previsto em {count}x. Juros totais: {interest_percent}% ({interest_amount} BRL). Total: {total} BRL. Sem cobrança nesta etapa.')
                if pix_discount > 0:
                    OrderEvent.objects.create(order=order, action='pix_discount_applied', description=f'Desconto Pix: {pix_percent}% ({pix_discount} BRL), aplicado após o cupom quando houver. Total: {total} BRL.')
                if code:
                    OrderEvent.objects.create(order=order, action='coupon_applied', description=f'Cupom {code}: {coupon_percent}% de desconto ({coupon_discount} BRL). Valor antes do desconto: {subtotal} BRL.')
                OrderEvent.objects.create(order=order, action="checkout_submitted", description="Pedido recebido do cotador B2C. Aguardando pagamento; cobrança e emissão não iniciadas.")
        except IntegrityError:
            existing = Order.objects.filter(checkout_key=key).first()
            if existing:
                return existing_response(existing)
            raise
        return Response(order_receipt(order), status=201)

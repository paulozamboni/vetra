import hashlib
import hmac
import json
import uuid
from django.conf import settings
from django.db import IntegrityError, transaction
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Order, OrderEvent
from .serializers import OrderCreateSerializer


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
        serializer = OrderCreateSerializer(data=request.data.get("order"))
        serializer.is_valid(raise_exception=True)
        # A retry may produce a new upstream quotation ID and observation time.
        # Keep the financial snapshot and personal data in the fingerprint.
        fingerprint = {k: v for k, v in serializer.validated_data.items() if k not in ("vetra_quote_id", "vetra_quote_plan_id", "exchange_fetched_at")}
        digest = hashlib.sha256(json.dumps(fingerprint, sort_keys=True, default=str).encode()).hexdigest()

        def existing_response(order):
            if order.checkout_hash != digest:
                return Response({"error": "Este identificador já foi utilizado com outros dados."}, status=409)
            return Response({"reference": order.reference, "status": order.status, "total": str(order.total), "currency": order.currency}, status=200)

        existing = Order.objects.filter(checkout_key=key).first()
        if existing:
            return existing_response(existing)
        try:
            with transaction.atomic():
                order = serializer.save(created_by=None, checkout_key=key, checkout_hash=digest, source="checkout", is_demo=False, status=Order.Status.AWAITING_PAYMENT)
                OrderEvent.objects.create(order=order, action="checkout_submitted", description="Pedido recebido do cotador B2C. Aguardando pagamento; cobrança e emissão não iniciadas.")
        except IntegrityError:
            existing = Order.objects.filter(checkout_key=key).first()
            if existing:
                return existing_response(existing)
            raise
        return Response({"reference": order.reference, "status": order.status, "total": str(order.total), "currency": order.currency}, status=201)

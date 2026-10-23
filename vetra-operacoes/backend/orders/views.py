import csv
import io
from datetime import date, timedelta
from decimal import Decimal
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.http import HttpResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from .models import Order, OrderEvent
from .serializers import OrderSerializer, OrderCreateSerializer, OrderDetailSerializer

def session_data(request):
    user = request.user
    return {"user": {"username": user.username, "name": user.get_full_name() or user.username, "can_create": user.has_perm("orders.add_order"), "can_export": user.has_perm("orders.export_orders"), "can_cancel": user.has_perm("orders.cancel_order"), "can_process": user.has_perm("orders.process_order"), "can_delete": user.has_perm("orders.delete_order"), "can_view_leads": user.has_perm("orders.view_lead"), "can_delete_leads": user.has_perm("orders.delete_lead"), "is_superuser": user.is_superuser} if user.is_authenticated and user.is_staff and user.has_perm("orders.view_order") else None, "csrfToken": get_token(request), "demoAvailable": settings.DEBUG, "processingEnabled": False}

@method_decorator(never_cache, name="dispatch")
class SessionView(APIView):
    permission_classes = [AllowAny]
    def get(self, request):
        return Response(session_data(request))

class LoginThrottle(AnonRateThrottle):
    scope = "login"

@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [LoginThrottle]
    def post(self, request):
        user = authenticate(request, username=request.data.get("username", ""), password=request.data.get("password", ""))
        if user is None or not user.is_staff or not user.has_perm("orders.view_order"):
            return Response({"detail": "Usuário ou senha inválidos, ou acesso não autorizado."}, status=400)
        login(request, user)
        return Response(session_data(request))

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request):
        logout(request)
        return Response({"detail": "Sessão encerrada."})

def filtered_orders(request, include_deleted=False):
    queryset = Order.objects.select_related("created_by").prefetch_related("passengers", "events__actor")
    scope = request.query_params.get("scope", "real")
    if scope not in ("real", "demo"):
        raise serializers.ValidationError({"scope": "Use real ou demo."})
    if scope == "demo" and not settings.DEBUG:
        raise serializers.ValidationError({"scope": "Demonstração indisponível em produção."})
    queryset = queryset.filter(is_demo=scope == "demo")
    if request.query_params.get("status") != Order.Status.DELETED and not include_deleted:
        queryset = queryset.exclude(status=Order.Status.DELETED)
    if request.query_params.get("processing") == "1":
        queryset = queryset.filter(status__in=[Order.Status.PAID, Order.Status.ISSUING, Order.Status.ISSUED, Order.Status.FAILED])
    search = request.query_params.get("search", "").strip()[:150]
    if search:
        queryset = queryset.filter(Q(reference__icontains=search) | Q(customer_name__icontains=search) | Q(customer_email__icontains=search) | Q(customer_phone__icontains=search) | Q(payer_email__icontains=search) | Q(destination__icontains=search) | Q(plan_name__icontains=search))
    selected_status = request.query_params.get("status")
    if selected_status:
        if selected_status not in Order.Status.values:
            raise serializers.ValidationError({"status": "Situação inválida."})
        queryset = queryset.filter(status=selected_status)
    for param, lookup in (("start", "created_at__date__gte"), ("end", "created_at__date__lte")):
        value = request.query_params.get(param)
        if value:
            try:
                parsed = date.fromisoformat(value)
            except ValueError:
                raise serializers.ValidationError({param: "Data inválida."})
            queryset = queryset.filter(**{lookup: parsed})
    if request.query_params.get("start", "") > request.query_params.get("end", "9999-12-31"):
        raise serializers.ValidationError({"end": "O fim do período deve ser após o início."})
    return queryset

@method_decorator(never_cache, name="dispatch")
class OrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    def get_queryset(self):
        return filtered_orders(self.request, include_deleted=self.action in ("retrieve", "soft_delete"))
    def get_serializer_class(self):
        return OrderCreateSerializer if self.action == "create" else OrderDetailSerializer if self.action in ("retrieve", "cancel", "process", "soft_delete") else OrderSerializer
    def create(self, request, *args, **kwargs):
        scope = request.query_params.get("scope", "real")
        filtered_orders(request)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save(created_by=request.user, is_demo=scope == "demo")
        return Response(OrderDetailSerializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def process(self, request, pk=None):
        # Internal workflow only: no payment confirmation, provider calls or issuance jobs.
        target = self.get_object()
        with transaction.atomic():
            order = self.get_queryset().select_for_update().get(pk=target.pk)
            if order.status == Order.Status.PROCESSING:
                return Response(OrderDetailSerializer(order).data)
            if order.status not in (Order.Status.DRAFT, Order.Status.AWAITING_PAYMENT):
                return Response({"detail": "Somente pedidos sem pagamento podem iniciar o processamento interno."}, status=409)
            order.status = Order.Status.PROCESSING
            order.save(update_fields=["status", "updated_at"])
            OrderEvent.objects.create(order=order, actor=request.user, action="processing_started", description="Processamento interno iniciado pela equipe. Sem cobrança, confirmação de pagamento ou emissão de apólice.")
        return Response(OrderDetailSerializer(order).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        reason = str(request.data.get("reason", "")).strip()
        if not 5 <= len(reason) <= 250:
            raise serializers.ValidationError({"reason": "Informe o motivo do cancelamento (5 a 250 caracteres)."})
        with transaction.atomic():
            order = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
            if order.status not in (Order.Status.DRAFT, Order.Status.AWAITING_PAYMENT, Order.Status.PROCESSING):
                return Response({"detail": "Este pedido não pode ser cancelado por este fluxo. Pagamentos e apólices precisam de conciliação."}, status=409)
            order.status = Order.Status.CANCELLED
            order.save(update_fields=["status", "updated_at"])
            OrderEvent.objects.create(order=order, actor=request.user, action="cancelled", description=reason)
        return Response(OrderDetailSerializer(order).data)

    @action(detail=True, methods=["post"], url_path="exclude")
    def soft_delete(self, request, pk=None):
        reason = request.data.get("reason", "")
        if not isinstance(reason, str) or not 5 <= len(reason.strip()) <= 150:
            raise serializers.ValidationError({"reason": "Informe o motivo da exclusão (5 a 150 caracteres)."})
        target = self.get_object()
        with transaction.atomic():
            order = self.get_queryset().select_for_update().get(pk=target.pk)
            if order.status == Order.Status.DELETED:
                return Response(OrderDetailSerializer(order).data)
            previous_label = order.get_status_display()
            order.status_before_deletion = order.status
            order.status = Order.Status.DELETED
            order.save(update_fields=["status", "status_before_deletion", "updated_at"])
            OrderEvent.objects.create(order=order, actor=request.user, action="deleted", description=f"Pedido excluído da lista ({previous_label}). Motivo: {reason.strip()}")
        return Response(OrderDetailSerializer(order).data)

    @action(detail=False, methods=["get"])
    def export(self, request):
        # Spreadsheet formula injection is blocked for all user-controlled text.
        def safe(value):
            text = str(value)
            return "'" + text if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else text
        output = io.StringIO()
        output.write("\ufeff")
        writer = csv.writer(output, delimiter=";")
        writer.writerow(["Pedido", "Cliente", "Telefone", "Destino", "Plano", "Embarque", "Desembarque", "Passageiros", "Moeda", "Valor", "Subtotal", "Cupom", "Desconto cupom", "Situação", "Forma de pagamento", "E-mail do pagador", "Criado em", "Demonstração", "Moeda original", "Valor original", "Câmbio USD/BRL", "Data do câmbio", "Fonte do câmbio", "ID do câmbio"])
        for order in self.get_queryset().iterator(chunk_size=200):
            writer.writerow([safe(order.reference), safe(order.customer_name), safe(order.customer_phone), safe(order.destination), safe(order.plan_name), order.departure, order.return_date, order.passengers.count(), order.currency, str(order.total).replace(".", ","), str(order.subtotal if order.subtotal is not None else order.total).replace(".", ","), safe(order.coupon_code), str(order.coupon_discount).replace(".", ","), order.get_status_display(), order.get_payment_method_display(), safe(order.payer_email), timezone.localtime(order.created_at).isoformat(), "Sim" if order.is_demo else "Não", order.original_currency, str(order.original_total).replace(".", ",") if order.original_total is not None else "", str(order.exchange_rate).replace(".", ",") if order.exchange_rate is not None else "", order.exchange_date or "", order.exchange_field, order.exchange_id or ""])
        response = HttpResponse(output.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="vetra-pedidos.csv"'
        return response

@method_decorator(never_cache, name="dispatch")
class SummaryView(APIView):
    def get(self, request):
        orders = filtered_orders(request)
        confirmed = orders.filter(status__in=[Order.Status.PAID, Order.Status.ISSUING, Order.Status.ISSUED, Order.Status.FAILED])
        revenue = list(confirmed.order_by().values("currency").annotate(total=Sum("total")))
        for item in revenue:
            item["total"] = str(item["total"])
        today = timezone.localdate()
        counts = {row["day"].isoformat(): row["count"] for row in orders.filter(created_at__date__gte=today-timedelta(days=6)).order_by().annotate(day=TruncDate("created_at")).values("day").annotate(count=Count("id"))}
        return Response({"total": orders.count(), "pending": orders.filter(status__in=[Order.Status.DRAFT, Order.Status.AWAITING_PAYMENT, Order.Status.PROCESSING]).count(), "issued": orders.filter(status=Order.Status.ISSUED).count(), "failed": orders.filter(status=Order.Status.FAILED).count(), "confirmed": confirmed.count(), "revenue": revenue, "statuses": list(orders.order_by().values("status").annotate(count=Count("id"))), "daily": [{"date": (today-timedelta(days=i)).isoformat(), "count": counts.get((today-timedelta(days=i)).isoformat(), 0)} for i in range(6, -1, -1)], "processing_enabled": False})

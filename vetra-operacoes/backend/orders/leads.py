import csv
import io
import uuid
import hashlib
import hmac
import json
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from django.conf import settings
from django.db import transaction
from django.db.models import Q, Count, Max, Min, OuterRef, Subquery, IntegerField, Value, DecimalField, Exists
from django.db.models.functions import Coalesce, Least
from django.http import HttpResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Lead, LeadGroupingState, LeadVisitor, LeadSearch
from .lead_contacts import email_key, phone_key
from .installments import pix_values
from .serializers import OrderCreateSerializer


class LeadInput(serializers.Serializer):
    request_id = serializers.UUIDField()
    visitor_id = serializers.UUIDField(required=False)
    name = serializers.CharField(max_length=150, min_length=1)
    email = serializers.EmailField(max_length=254)
    phone = serializers.CharField(max_length=25, min_length=10)
    quote_id = serializers.CharField(max_length=80, required=False, allow_blank=True)
    trip_summary = serializers.CharField(max_length=500, required=False, allow_blank=True)

    min_quote_total = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'), required=False)
    traveler_count = serializers.IntegerField(min_value=1, max_value=10, required=False)

    def validate(self, attrs):
        if ('min_quote_total' in attrs) != ('traveler_count' in attrs):
            raise serializers.ValidationError('Informe o valor da cotação e a quantidade de viajantes juntos.')
        return attrs

    def validate_phone(self, value):
        return OrderCreateSerializer().validate_customer_phone(value)


@method_decorator(never_cache, name='dispatch')
class CaptureLeadView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        token = settings.CHECKOUT_INGEST_TOKEN
        if not token or not hmac.compare_digest(request.headers.get('Authorization', ''), 'Bearer '+token):
            return Response({'error':'Acesso não autorizado.'}, status=403)
        if len(request.body) > 5000:
            return Response({'error':'Dados inválidos.'}, status=413)
        serializer = LeadInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        key = data.pop('request_id')
        visitor_id = data.pop('visitor_id', None)
        data.setdefault('quote_id', '')
        data.setdefault('trip_summary', '')
        digest = hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()
        if 'min_quote_total' in data:
            pix = pix_values(data['min_quote_total'])
            data['pix_discount_percent'] = Decimal(pix['percent'])
            data['min_ticket_pix'] = (Decimal(pix['total']) / data['traveler_count']).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        with transaction.atomic():
            LeadGroupingState.objects.get_or_create(pk=1)
            LeadGroupingState.objects.select_for_update().get(pk=1)
            lead = Lead.objects.filter(capture_key=key).first()
            created = lead is None
            if created:
                groups = set(Lead.objects.filter(Q(email_key=email_key(data['email'])) | Q(phone_key=phone_key(data['phone']))).values_list('group_key', flat=True))
                group = min(groups, key=str) if groups else uuid.uuid4()
                if len(groups) > 1:
                    Lead.objects.filter(group_key__in=groups).update(group_key=group)
                    LeadVisitor.objects.filter(group_key__in=groups).update(group_key=group)
                Lead.objects.filter(group_key=group).update(deleted_at=None)
                lead = Lead.objects.create(capture_key=key, capture_hash=digest, group_key=group, **data)
            if lead.capture_hash == digest and visitor_id:
                visitor, _ = LeadVisitor.objects.get_or_create(id=visitor_id)
                if visitor.group_key is None or visitor.group_key == lead.group_key:
                    visitor.group_key = lead.group_key
                    visitor.save(update_fields=['group_key'])
        if lead.capture_hash != digest:
            return Response({'error':'Este envio já foi utilizado com outros dados.'}, status=409)
        return Response({'received':True}, status=201 if created else 200)


class LeadAccess(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u.is_authenticated and u.is_active and u.is_staff and u.has_perm('orders.view_lead'))


class LeadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lead
        fields = ['id', 'name', 'email', 'phone', 'quote_id', 'trip_summary', 'min_quote_total', 'traveler_count', 'min_ticket_pix', 'pix_discount_percent', 'created_at']


class LeadPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = None


def grouped_leads(request):
    latest = Lead.objects.filter(group_key=OuterRef('group_key')).order_by('-created_at', '-id')
    searches = LeadSearch.objects.filter(visitor__group_key=OuterRef('group_key')).order_by().values('visitor__group_key').annotate(n=Count('id'), ticket=Min('min_ticket_pix'), last=Max('created_at'))
    hidden = Lead.objects.filter(deleted_at__isnull=False).values('group_key')
    qs = Lead.objects.exclude(group_key__in=hidden).order_by().values('group_key').annotate(
        capture_count=Count('id'), last_captured_at=Max('created_at'),
        best_ticket_pix=Least(Coalesce(Min('min_ticket_pix'), Subquery(searches.values('ticket')[:1])), Coalesce(Subquery(searches.values('ticket')[:1]), Min('min_ticket_pix'))),
        search_count=Coalesce(Subquery(searches.values('n')[:1]), Value(0), output_field=IntegerField()),
        last_search_at=Subquery(searches.values('last')[:1]), latest_id=Subquery(latest.values('id')[:1]),
    ).order_by('-last_captured_at', '-latest_id')
    dates = {}
    for param, lookup in [('start','last_captured_at__date__gte'), ('end','last_captured_at__date__lte')]:
        value = request.query_params.get(param)
        if value:
            try:
                dates[param] = date.fromisoformat(value)
            except ValueError:
                raise serializers.ValidationError({param:'Data inválida.'})
            qs = qs.filter(**{lookup:dates[param]})
    if dates.get('start', date.min) > dates.get('end', date.max):
        raise serializers.ValidationError({'end':'O fim deve ser igual ou posterior ao início.'})
    return qs


def group_rows(groups):
    groups = list(groups)
    leads = Lead.objects.in_bulk(g['latest_id'] for g in groups)
    result = []
    for g in groups:
        row = dict(LeadSerializer(leads[g['latest_id']]).data)
        row['capture_count'] = g['capture_count']
        row['search_count'] = g['search_count']
        row['last_search_at'] = g['last_search_at'].isoformat() if g['last_search_at'] else None
        row['min_ticket_pix'] = str(g['best_ticket_pix'].quantize(Decimal('0.01'))) if g['best_ticket_pix'] is not None else None
        result.append(row)
    return result


@method_decorator(never_cache, name='dispatch')
class LeadListView(APIView):
    permission_classes = [LeadAccess]

    def get(self, request):
        pager = LeadPagination()
        groups = pager.paginate_queryset(grouped_leads(request), request, view=self)
        return pager.get_paginated_response(group_rows(groups))


def safe_csv(value):
    value = '' if value is None else str(value)
    if value.lstrip().startswith(('=', '+', '-', '@')) or value.startswith(('\t', '\r', '\n')):
        return "'" + value
    return value


@method_decorator(never_cache, name='dispatch')
class LeadExportView(APIView):
    permission_classes = [LeadAccess]

    def get(self, request):
        output = io.StringIO()
        output.write('\ufeff')
        writer = csv.writer(output, delimiter=';')
        writer.writerow(['Nome', 'E-mail', 'Telefone', 'Capturas', 'Pesquisas', 'Última captura', 'Menor ticket Pix por viajante (BRL)', 'Última viagem consultada', 'Última cotação'])
        qs = grouped_leads(request)
        batch = []
        def write_batch(groups):
            for row in group_rows(groups):
                stamp = timezone.localtime(timezone.datetime.fromisoformat(row['created_at'].replace('Z', '+00:00'))).strftime('%d/%m/%Y %H:%M')
                ticket = row['min_ticket_pix'].replace('.', ',') if row['min_ticket_pix'] is not None else ''
                writer.writerow([safe_csv(v) for v in [row['name'], row['email'], row['phone'], row['capture_count'], row['search_count'], stamp, ticket, row['trip_summary'], row['quote_id']]])
        for group in qs.iterator(chunk_size=500):
            batch.append(group)
            if len(batch) == 500:
                write_batch(batch)
                batch = []
        if batch:
            write_batch(batch)
        response = HttpResponse(output.getvalue(), content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="vetra-leads.csv"'
        return response


class DeleteLeadAccess(LeadAccess):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.has_perm('orders.delete_lead')


@method_decorator(never_cache, name='dispatch')
class LeadDeleteView(APIView):
    permission_classes = [DeleteLeadAccess]

    def post(self, request, pk):
        with transaction.atomic():
            LeadGroupingState.objects.get_or_create(pk=1)
            LeadGroupingState.objects.select_for_update().get(pk=1)
            lead = Lead.objects.filter(pk=pk).first()
            if not lead:
                return Response({'detail':'Lead não encontrado.'}, status=404)
            Lead.objects.filter(group_key=lead.group_key, deleted_at__isnull=True).update(deleted_at=timezone.now())
        return Response({'deleted':True})


class SearchInput(LeadInput):
    name = None
    email = None
    phone = None
    visitor_id = serializers.UUIDField()


@method_decorator(never_cache, name='dispatch')
class LeadSearchView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        token = settings.CHECKOUT_INGEST_TOKEN
        if not token or not hmac.compare_digest(request.headers.get('Authorization', ''), 'Bearer '+token):
            return Response({'error':'Acesso não autorizado.'}, status=403)
        if len(request.body) > 5000:
            return Response({'error':'Dados inválidos.'}, status=413)
        serializer = SearchInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        ticket, percent = None, None
        if 'min_quote_total' in data:
            pix = pix_values(data['min_quote_total'])
            percent = Decimal(pix['percent'])
            ticket = (Decimal(pix['total']) / data['traveler_count']).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        with transaction.atomic():
            LeadGroupingState.objects.get_or_create(pk=1)
            LeadGroupingState.objects.select_for_update().get(pk=1)
            visitor, _ = LeadVisitor.objects.get_or_create(id=data['visitor_id'])
            contact = Lead.objects.filter(group_key=visitor.group_key).order_by('-created_at','-id').first() if visitor.group_key else None
            search, created = LeadSearch.objects.get_or_create(request_key=data['request_id'], defaults={'visitor':visitor, 'quote_id':data.get('quote_id',''), 'trip_summary':data.get('trip_summary',''), 'min_ticket_pix':ticket})
            if search.visitor_id != visitor.id:
                return Response({'error':'Envio já registrado.'}, status=409)
            if created and contact:
                snapshot = {'name':contact.name, 'email':contact.email, 'phone':contact.phone,
                            'quote_id':data.get('quote_id',''), 'trip_summary':data.get('trip_summary','')}
                if 'min_quote_total' in data:
                    snapshot.update(min_quote_total=data['min_quote_total'], traveler_count=data['traveler_count'])
                digest = hashlib.sha256(json.dumps(snapshot, sort_keys=True, default=str).encode()).hexdigest()
                Lead.objects.filter(group_key=contact.group_key).update(deleted_at=None)
                Lead.objects.create(capture_key=search.request_key, capture_hash=digest, group_key=contact.group_key,
                                    min_ticket_pix=ticket, pix_discount_percent=percent, **snapshot)
        return Response({'received':True, 'known_lead':contact is not None}, status=201 if created else 200)


class LeadHistorySerializer(LeadSerializer):
    automatic_capture = serializers.BooleanField(read_only=True)

    class Meta(LeadSerializer.Meta):
        fields = LeadSerializer.Meta.fields + ['automatic_capture']


@method_decorator(never_cache, name='dispatch')
class LeadHistoryView(APIView):
    permission_classes = [LeadAccess]

    def get(self, request, pk):
        lead = Lead.objects.filter(pk=pk).first()
        if not lead or Lead.objects.filter(group_key=lead.group_key, deleted_at__isnull=False).exists():
            return Response({'detail':'Lead não encontrado.'}, status=404)
        rows = Lead.objects.filter(group_key=lead.group_key).annotate(
            automatic_capture=Exists(LeadSearch.objects.filter(request_key=OuterRef('capture_key')))
        ).order_by('-created_at', '-id')
        pager = LeadPagination()
        page = pager.paginate_queryset(rows, request, view=self)
        return pager.get_paginated_response(LeadHistorySerializer(page, many=True).data)

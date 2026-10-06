import re
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from .models import Order, Passenger, OrderEvent

def validate_cpf(value):
    if not re.fullmatch(r"[\d.\-\s]+", value):
        raise serializers.ValidationError("Informe um CPF válido.")
    digits = re.sub(r"\D", "", value)
    if len(digits) != 11 or len(set(digits)) == 1:
        raise serializers.ValidationError("Informe um CPF válido.")
    for length in (9, 10):
        remainder = sum(int(digits[i]) * (length + 1 - i) for i in range(length)) * 10 % 11
        if int(digits[length]) != (0 if remainder == 10 else remainder):
            raise serializers.ValidationError("Informe um CPF válido.")
    return digits

class PassengerInput(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    cpf = serializers.CharField(validators=[validate_cpf], write_only=True)
    age = serializers.IntegerField(min_value=0, max_value=120)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.00"))

    def validate_full_name(self, value):
        if len(value.split()) < 2:
            raise serializers.ValidationError("Informe o nome completo.")
        return value

class OrderCreateSerializer(serializers.ModelSerializer):
    passengers = PassengerInput(many=True, min_length=1, max_length=10)

    class Meta:
        model = Order
        fields = ["customer_name", "customer_email", "destination", "plan_name", "plan_id", "vetra_quote_id", "vetra_quote_plan_id", "departure", "return_date", "currency", "original_total", "original_currency", "exchange_rate", "exchange_date", "exchange_id", "exchange_field", "exchange_fetched_at", "payment_method", "passengers"]

    def validate(self, attrs):
        if attrs["departure"] < timezone.localdate():
            raise serializers.ValidationError({"departure": "O embarque deve ser a partir de hoje."})
        interval = attrs["return_date"] - attrs["departure"]
        if interval < timedelta(0) or interval > timedelta(days=365):
            raise serializers.ValidationError({"return_date": "Informe um período de 1 a 366 dias, incluindo embarque e desembarque."})
        cpfs = [validate_cpf(p["cpf"]) for p in attrs["passengers"]]
        if len(set(cpfs)) != len(cpfs):
            raise serializers.ValidationError({"passengers": "Há passageiros com o mesmo CPF neste pedido."})
        if sum(p["unit_price"] for p in attrs["passengers"]) > Decimal("9999999999.99"):
            raise serializers.ValidationError({"passengers": "O valor total excede o limite permitido."})
        fx_fields = ["original_total", "original_currency", "exchange_rate", "exchange_date", "exchange_id", "exchange_field", "exchange_fetched_at"]
        if any(attrs.get(k) is not None and attrs.get(k) != "" for k in fx_fields):
            if any(attrs.get(k) is None or attrs.get(k) == "" for k in fx_fields):
                raise serializers.ValidationError({"exchange_rate": "Informe o registro completo do câmbio usado no pedido."})
            if attrs["currency"] != "BRL" or attrs["original_currency"] != "USD" or attrs["exchange_field"] != "cambio_ita" or attrs["exchange_rate"] <= 0 or attrs["original_total"] < 0:
                raise serializers.ValidationError({"exchange_rate": "Conversão inválida. Use USD para BRL com cambio_ita positivo."})
            if attrs["exchange_date"] > timezone.localdate():
                raise serializers.ValidationError({"exchange_date": "Não use um câmbio de data futura."})
            converted = (attrs["original_total"] * attrs["exchange_rate"]).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if sum(p["unit_price"] for p in attrs["passengers"]) != converted:
                raise serializers.ValidationError({"exchange_rate": "O total em reais não corresponde ao valor em dólar e ao câmbio informado."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        passengers = validated_data.pop("passengers")
        order = Order.objects.create(**validated_data, total=sum(p["unit_price"] for p in passengers))
        for data in passengers:
            cpf = validate_cpf(data.pop("cpf"))
            passenger = Passenger(order=order, **data)
            passenger.set_cpf(cpf)
            passenger.save()
        OrderEvent.objects.create(order=order, actor=order.created_by, action="created", description="Pedido cadastrado. Pagamento e emissão ainda não iniciados.")
        return order

class PassengerSerializer(serializers.ModelSerializer):
    cpf_masked = serializers.CharField(read_only=True)
    class Meta:
        model = Passenger
        fields = ["id", "full_name", "age", "cpf_masked", "unit_price"]

class EventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    def get_actor_name(self, obj):
        return obj.actor.get_full_name() or obj.actor.username if obj.actor else "Sistema"
    class Meta:
        model = OrderEvent
        fields = ["id", "action", "description", "actor_name", "created_at"]

class OrderSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    passenger_count = serializers.SerializerMethodField()
    def get_passenger_count(self, obj):
        return obj.passengers.count()
    class Meta:
        model = Order
        fields = ["id", "reference", "customer_name", "customer_email", "destination", "plan_name", "plan_id", "departure", "return_date", "currency", "total", "original_total", "original_currency", "exchange_rate", "exchange_date", "exchange_id", "exchange_field", "exchange_fetched_at", "payment_method", "status", "status_label", "passenger_count", "source", "is_demo", "created_at", "updated_at"]

class OrderDetailSerializer(OrderSerializer):
    passengers = PassengerSerializer(many=True, read_only=True)
    events = EventSerializer(many=True, read_only=True)
    class Meta(OrderSerializer.Meta):
        fields = OrderSerializer.Meta.fields + ["passengers", "events"]

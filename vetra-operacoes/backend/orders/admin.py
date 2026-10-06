from django.contrib import admin
from .models import Order, Passenger, OrderEvent, ProcessingJob

class ReadOnlyInline(admin.TabularInline):
    extra = 0
    can_delete = False
    def has_add_permission(self, request, obj=None):
        return False
    def has_change_permission(self, request, obj=None):
        return False

class PassengerInline(ReadOnlyInline):
    model = Passenger
    fields = ["full_name", "age", "unit_price"]
    readonly_fields = fields

class EventInline(ReadOnlyInline):
    model = OrderEvent
    fields = ["action", "description", "actor", "created_at"]
    readonly_fields = fields

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["reference", "customer_name", "destination", "status", "currency", "total", "is_demo", "created_at"]
    list_filter = ["is_demo", "status", "currency", "destination"]
    search_fields = ["reference", "customer_name", "customer_email"]
    readonly_fields = [field.name for field in Order._meta.fields]
    inlines = [PassengerInline, EventInline]
    def has_add_permission(self, request):
        return False
    def has_delete_permission(self, request, obj=None):
        return False
    def has_change_permission(self, request, obj=None):
        return False

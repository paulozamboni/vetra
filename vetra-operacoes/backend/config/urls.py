from django.contrib import admin
from django.urls import include, path
from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.cache import never_cache
from rest_framework.routers import DefaultRouter
from orders.views import SessionView, LoginView, LogoutView, OrderViewSet, SummaryView
from orders.checkout import CheckoutIngestView
from orders.installments import InstallmentSettingsView, CheckoutInstallmentsView
from orders.coupons import CouponAdminView, CheckoutCouponView
from django.http import JsonResponse
from django.db import connection
from django.core.cache import cache

router = DefaultRouter()
router.register("orders", OrderViewSet, basename="orders")

def healthz(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        cache.get('vetra-healthcheck')
    except Exception:
        return JsonResponse({'status': 'unavailable'}, status=503)
    return JsonResponse({'status': 'ok'})

@never_cache
def dashboard(request):
    index = settings.FRONTEND_DIST / "index.html"
    if not index.exists():
        return HttpResponse("Execute o build do frontend para abrir o dashboard.", status=503)
    return HttpResponse(index.read_text(encoding="utf-8"))

urlpatterns = [path("admin/", admin.site.urls), path("api/session/", SessionView.as_view()), path("api/login/", LoginView.as_view()), path("api/logout/", LogoutView.as_view()), path("api/summary/", SummaryView.as_view()), path("api/", include(router.urls)), path("", dashboard)]
admin.site.site_header = "Vetra · Administração"
urlpatterns.insert(0, path("api/checkout/orders/", CheckoutIngestView.as_view()))
urlpatterns.insert(0, path('api/settings/installments/', InstallmentSettingsView.as_view()))
urlpatterns.insert(0, path('api/coupons/', CouponAdminView.as_view()))
urlpatterns.insert(0, path('api/coupons/<int:pk>/', CouponAdminView.as_view()))
urlpatterns.insert(0, path('api/checkout/coupons/validate/', CheckoutCouponView.as_view()))
urlpatterns.insert(0, path('api/checkout/installments/', CheckoutInstallmentsView.as_view()))
urlpatterns.insert(0, path('healthz/', healthz))
admin.site.site_title = "Vetra"
admin.site.index_title = "Equipe e permissões"

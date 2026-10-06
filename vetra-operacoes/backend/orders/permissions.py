from rest_framework.permissions import BasePermission

class OrderAccess(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated or not user.is_active or not user.is_staff:
            return False
        if not user.has_perm("orders.view_order"):
            return False
        action = getattr(view, "action", "")
        permission = {"create": "orders.add_order", "cancel": "orders.cancel_order", "export": "orders.export_orders"}.get(action)
        return not permission or user.has_perm(permission)

from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission

class Command(BaseCommand):
    help = "Cria os perfis da equipe sem criar usuários ou alterar senhas."
    def handle(self, *args, **options):
        roles = {"Operação": ["view_order", "add_order", "cancel_order", "process_order"], "Financeiro": ["view_order", "export_orders"], "Gestão": ["view_order", "add_order", "cancel_order", "process_order", "export_orders"]}
        for name, permissions in roles.items():
            group, _ = Group.objects.get_or_create(name=name)
            group.permissions.set(Permission.objects.filter(content_type__app_label="orders", codename__in=permissions))
        self.stdout.write(self.style.SUCCESS("Perfis Operação, Financeiro e Gestão configurados."))

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('orders', '0008_installment_settings')]
    operations = [
        migrations.AddField(model_name='installmentsettings', name='pix_enabled', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='installmentsettings', name='pix_discount_percent', field=models.DecimalField(decimal_places=2, default='0.00', max_digits=5)),
    ]

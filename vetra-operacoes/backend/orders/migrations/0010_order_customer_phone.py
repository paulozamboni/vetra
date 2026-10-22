from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('orders', '0009_pix_discount_settings')]
    operations = [migrations.AddField(model_name='order', name='customer_phone', field=models.CharField(blank=True, default='', max_length=25))]

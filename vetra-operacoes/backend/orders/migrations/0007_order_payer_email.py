from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('orders', '0006_internal_order_processing')]

    operations = [
        migrations.AddField(
            model_name='order',
            name='payer_email',
            field=models.EmailField(blank=True, default='', max_length=254),
        ),
    ]

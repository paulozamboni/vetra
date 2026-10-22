from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('orders', '0010_order_customer_phone')]
    operations = [
        migrations.AddField(model_name='order', name='status_before_deletion', field=models.CharField(blank=True, default='', max_length=24)),
        migrations.AlterField(model_name='order', name='status', field=models.CharField(choices=[('draft','Rascunho'),('awaiting_payment','Aguardando pagamento'),('processing','Em processamento'),('paid','Pagamento confirmado'),('issuing','Em emissão'),('issued','Apólice emitida'),('failed','Falha na emissão'),('cancelled','Cancelado'),('deleted','Excluído')], db_index=True, default='draft', max_length=24)),
    ]

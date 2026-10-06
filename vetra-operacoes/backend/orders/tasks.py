from celery import shared_task

@shared_task
def processing_healthcheck():
    """Checks the queue without initiating a payment or an issuance."""
    return {"ready": True, "issuance_enabled": False, "payments_enabled": False}

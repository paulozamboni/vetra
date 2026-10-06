from unittest.mock import patch
from django.test import TestCase, override_settings


@override_settings(SECURE_SSL_REDIRECT=True,
                   SECURE_PROXY_SSL_HEADER=('HTTP_X_FORWARDED_PROTO', 'https'))
class DeploymentTests(TestCase):
    def test_healthcheck_is_available_without_tls_or_login(self):
        response = self.client.get('/healthz/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})

    def test_healthcheck_failure_does_not_expose_diagnostics(self):
        with patch('config.urls.cache.get', side_effect=RuntimeError('private details')):
            response = self.client.get('/healthz/')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {'status': 'unavailable'})

    def test_internal_proxy_headers_keep_checkout_authentication_required(self):
        response = self.client.post('/api/checkout/orders/', '{}',
                                    content_type='application/json',
                                    HTTP_X_FORWARDED_PROTO='https')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.get('/api/session/').status_code, 301)

"""Generate fresh production secrets without reading development credentials."""
import base64
import os
from pathlib import Path
import secrets

target = Path(__file__).with_name('.env')
template = Path(__file__).with_name('.env.example').read_text(encoding='utf-8')
values = {
    'POSTGRES_PASSWORD': secrets.token_hex(32),
    'DJANGO_SECRET_KEY': secrets.token_hex(64),
    'CPF_ENCRYPTION_KEY': base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
    'CHECKOUT_INGEST_TOKEN': secrets.token_hex(48),
}
for key, value in values.items():
    template = template.replace(f'{key}=\n', f'{key}={value}\n')
# Exclusive creation protects existing CPF keys and database passwords.
with target.open('x', encoding='utf-8', newline='\n') as handle:
    handle.write(template)
if os.name != 'nt':
    target.chmod(0o600)
print('Arquivo .env criado. Preencha os domínios, e-mail TLS e credenciais Vetra antes de subir os serviços.')

from pathlib import Path
import secrets
from cryptography.fernet import Fernet

project = Path(__file__).resolve().parent.parent
path = project / ".env"
if not path.exists():
    path.write_text("DEBUG=1\nDJANGO_SECRET_KEY="+secrets.token_urlsafe(64)+"\nCPF_ENCRYPTION_KEY="+Fernet.generate_key().decode()+"\nPOSTGRES_PASSWORD="+secrets.token_urlsafe(30)+"\nALLOWED_HOSTS=127.0.0.1,localhost\nCSRF_TRUSTED_ORIGINS=http://127.0.0.1:8080,http://localhost:8080\n", encoding="utf-8")
    print("Ambiente local configurado com chaves novas. Nenhum segredo foi exibido.")
else:
    print("O ambiente existente foi preservado.")

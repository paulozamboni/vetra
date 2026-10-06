import os
from pathlib import Path
import dj_database_url
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured
from cryptography.fernet import Fernet

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BASE_DIR.parent
load_dotenv(PROJECT_DIR / ".env")
DEBUG = os.environ.get("DEBUG", "0") == "1"
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
CPF_ENCRYPTION_KEY = os.environ.get("CPF_ENCRYPTION_KEY", "")
if not SECRET_KEY or not CPF_ENCRYPTION_KEY:
    raise ImproperlyConfigured("Configure DJANGO_SECRET_KEY e CPF_ENCRYPTION_KEY no ambiente.")
try:
    Fernet(CPF_ENCRYPTION_KEY.encode())
except (ValueError, TypeError) as exc:
    raise ImproperlyConfigured("CPF_ENCRYPTION_KEY deve ser uma chave Fernet válida.") from exc
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "127.0.0.1,localhost").split(",")
INSTALLED_APPS = ["django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes", "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles", "rest_framework", "orders"]
MIDDLEWARE = ["django.middleware.security.SecurityMiddleware", "whitenoise.middleware.WhiteNoiseMiddleware", "django.contrib.sessions.middleware.SessionMiddleware", "django.middleware.common.CommonMiddleware", "django.middleware.csrf.CsrfViewMiddleware", "django.contrib.auth.middleware.AuthenticationMiddleware", "django.contrib.messages.middleware.MessageMiddleware", "django.middleware.clickjacking.XFrameOptionsMiddleware"]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{"BACKEND": "django.template.backends.django.DjangoTemplates", "DIRS": [], "APP_DIRS": True, "OPTIONS": {"context_processors": ["django.template.context_processors.request", "django.contrib.auth.context_processors.auth", "django.contrib.messages.context_processors.messages"]}}]
WSGI_APPLICATION = "config.wsgi.application"
database_url = os.environ.get("DATABASE_URL")
if not DEBUG and not database_url:
    raise ImproperlyConfigured("Produção exige DATABASE_URL PostgreSQL.")
DATABASES = {"default": dj_database_url.parse(database_url, conn_max_age=60) if database_url else {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}
if not DEBUG and DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":
    raise ImproperlyConfigured("Use PostgreSQL em produção.")
AUTH_PASSWORD_VALIDATORS = [{"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"}, {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"}, {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"}, {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"}]
LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
FRONTEND_DIST = PROJECT_DIR / "frontend" / "dist"
STATICFILES_DIRS = [("dashboard", FRONTEND_DIST)] if FRONTEND_DIST.exists() else []
STORAGES = {"default": {"BACKEND": "django.core.files.storage.FileSystemStorage"}, "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"}}
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
CSRF_TRUSTED_ORIGINS = os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",") if os.environ.get("CSRF_TRUSTED_ORIGINS") else []
SESSION_COOKIE_AGE = 8 * 60 * 60
SECURE_SSL_REDIRECT = not DEBUG
if os.environ.get('TRUST_PROXY_HEADERS') == '1':
    # Enable only behind the private Docker network; never expose Gunicorn.
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_REDIRECT_EXEMPT = [r'^healthz/$']
SECURE_HSTS_SECONDS = 31536000 if not DEBUG else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG
REST_FRAMEWORK = {"DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"], "DEFAULT_PERMISSION_CLASSES": ["orders.permissions.OrderAccess"], "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination", "PAGE_SIZE": 12, "DEFAULT_THROTTLE_RATES": {"login": "10/min"}}
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
if not DEBUG and not os.environ.get("REDIS_URL"):
    raise ImproperlyConfigured("Produção exige REDIS_URL para filas e limitação de login.")
CACHES = {"default": {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": REDIS_URL}} if not DEBUG else {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_TASK_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_RESULT_SERIALIZER = "json"
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 120
CHECKOUT_INGEST_TOKEN = os.environ.get("CHECKOUT_INGEST_TOKEN", "")

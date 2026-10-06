FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN npm install -g pnpm@11.19.0 && pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm run build

FROM python:3.12-slim
WORKDIR /app/backend
COPY backend/requirements.lock.txt ./
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY backend/ ./
COPY --from=frontend /build/dist /app/frontend/dist
RUN DEBUG=1 DJANGO_SECRET_KEY=build-only-key-not-for-runtime CPF_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= python manage.py collectstatic --noinput
RUN useradd --create-home vetra && chown -R vetra:vetra /app
USER vetra
EXPOSE 8080
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8080", "--workers", "2", "--access-logfile", "-"]

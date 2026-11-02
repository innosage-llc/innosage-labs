FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./
RUN npx expo export --platform web --output-dir dist

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk ca-certificates && rm -rf /var/lib/apt/lists/*
COPY server/requirements.txt /app/requirements.txt
COPY server/requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir -r /app/requirements.lock
COPY server/ /app/server/
COPY contracts/ /app/contracts/
COPY tests/ /app/tests/
COPY --from=web /web/dist /app/web
EXPOSE 8433
CMD ["python", "-m", "server.serve"]

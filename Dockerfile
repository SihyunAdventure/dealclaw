# hotinbeauty 크롤러 — AWS Fargate Scheduled Task용 이미지.
# Playwright 공식 이미지(Chromium + 의존성 포함) 기반, Node 22.
# 빌드: docker buildx build --platform linux/amd64 -t hotinbeauty-crawler .

FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NODE_ENV=production

# src/crawl/chrome.ts 는 현재 시스템 Chrome 바이너리를 spawn한다
# (`/usr/bin/google-chrome` on linux). Playwright 베이스 이미지에는
# Chromium만 있고 Chrome 안정판이 없으므로 apt로 설치.
# 대안: chrome.ts를 playwright.chromium.launch() 쓰도록 리팩터링 (SIH-558 후속)
RUN apt-get update && \
    apt-get install -y --no-install-recommends wget gnupg ca-certificates xvfb && \
    wget -qO- https://dl-ssl.google.com/linux/linux_signing_key.pub | \
      gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
      > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends google-chrome-stable && \
    rm -rf /var/lib/apt/lists/*

# 의존성만 먼저 복사 → 캐시 효율
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# 소스 복사 (크롤링에 필요한 것만)
COPY tsconfig.json ./
COPY lib ./lib
COPY src ./src
COPY scripts ./scripts

# tsx는 devDependency지만 런타임 필요 — 명시적 추가
RUN npm install tsx --no-save --no-audit --no-fund

RUN chmod +x /app/scripts/aws-cron-entrypoint.sh

ENTRYPOINT ["/app/scripts/aws-cron-entrypoint.sh"]

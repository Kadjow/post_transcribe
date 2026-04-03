FROM python:3.11-slim

WORKDIR /app

# instalar tesseract
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libtesseract-dev \
    && rm -rf /var/lib/apt/lists/*

# copiar dependencias
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# copiar app
COPY . .

# porta do render
ENV PORT=10000

# start correto do fastapi
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port $PORT"]

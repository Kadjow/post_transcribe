# pdf transcribe

MVP para upload de PDF, extracao de imagens por pagina, miniaturas, revisao e transcricao.

## Stack
- Monorepo: `pnpm workspaces` + `turborepo`
- Frontend: React + Vite + TypeScript
- Backend: FastAPI + PyMuPDF + Pillow + Tesseract
- Shared contracts: `packages/contracts`

## Project layout
```text
apps/
  web/            # React app
  api/            # FastAPI app
packages/
  contracts/      # shared TS API contracts
```

## Prerequisites
- Node.js 20+
- pnpm 10+
- Python 3.11+
- Tesseract instalado localmente

## Windows Tesseract setup
1. Install:
```powershell
choco install tesseract -y
```
2. Confirm:
```powershell
tesseract --version
tesseract --list-langs
```
3. If `por` is missing:
```cmd
curl -L "https://github.com/tesseract-ocr/tessdata_best/raw/main/por.traineddata" -o "C:\Program Files\Tesseract-OCR\tessdata\por.traineddata"
```

If `tesseract` is not available in PATH, set `TESSERACT_CMD` in `.env`:
```dotenv
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
```

## Setup
1. Install JS dependencies:
```powershell
pnpm.cmd install
```
2. Create Python venv and install API dependencies:
```powershell
cd apps\api
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..\..
```
3. Copy env file:
```powershell
copy .env.example .env
```

## Run in development
Terminal A (API):
```powershell
cd apps\api
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Terminal B (Web):
```powershell
pnpm.cmd --filter ./apps/web dev
```

Important:
- Open the app at `http://localhost:5173` (Vite dev server).
- Do not open `apps/web/index.html` directly or via Live Server (`127.0.0.1:5500`), because the browser will request raw `/src/*.tsx` files and trigger 404/HMR reload errors.

## Local validation checklist
1. Open `http://localhost:5173`.
2. Upload a PDF containing embedded images.
3. Confirm review page shows real image previews.
4. Confirm results page shows real previews.
5. Teste as acoes de transcricao:
   - `Iniciar transcricao de todas`
   - `Nao iniciar transcricao`
   - `Iniciar transcricao das selecionadas`
6. Se a dependencia de transcricao estiver ausente, confirme se o status da imagem fica em `ERROR` com mensagem amigavel.

## Endpoints
- `POST /v1/pdfs/analyze`
- `POST /v1/pdfs/transcriptions`
- `GET /v1/pdfs/{documentId}/results`
- `GET /health`

## Temporary storage
- `apps/api/storage/uploads/`
- `apps/api/storage/extracted/`
- `apps/api/storage/thumbnails/`
- `apps/api/storage/results/`

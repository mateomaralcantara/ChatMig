# ChatSed — Monorepo (v1)

ChatSed es un sistema de coaching en relaciones y seducción **ético** con:
- **API** en FastAPI (Python) con analítica/predicción enchufable.
- **Web** (React + Vite + TypeScript) con chat UI, A/B y dashboard.
- **ML** (scikit-learn) para modelo de probabilidad de respuesta (stub).
- **Worker** para tareas asíncronas y recordatorios.
- **Moderation** y **Policies** con reglas éticas y de consentimiento.
- **PostgreSQL** para persistencia.
- **Docker Compose** para levantamiento rápido.

> Nota: Este repo es un **starter production-grade**. Puedes ampliarlo con tus modelos y conexiones reales (HuggingFace, OpenAI, Vertex, etc.) usando los **plugins** del módulo `analytics`.

## Quickstart (Docker)
Requisitos: Docker + Docker Compose.

```bash
cp .env.example .env
docker compose up --build
```

- API: http://localhost:8000/docs
- Web: http://localhost:5173

## Quickstart (Local dev)
Requisitos: Python 3.11+, Node 18+

```bash
# API
cd services/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Web
cd ../../web
npm install
npm run dev
```

## Estructura
```
chatsed/
├─ services/
│  ├─ api/               # FastAPI + plugins analíticos
│  ├─ ml/                # Entrenamiento y features (stub)
│  ├─ worker/            # Tareas asíncronas (RQ/Redis)
│  ├─ moderation/        # Reglas y filtros
│  └─ web/               # React + Vite + TS
├─ k8s/                  # Manifiestos Kubernetes (mínimos)
├─ scripts/              # Utilidades
├─ tests/                # Pytests
├─ docker-compose.yml
├─ .env.example
└─ LICENSE
```

## Filosofía y seguridad
- Consentimiento primero, cero manipulación. Límites claros.
- Sin contenido sexual explícito. PG-13.
- Si hay señales de riesgo/abuso → priorizar seguridad.

## Plugins analíticos
`services/api/app/analytics/` contiene:
- `interface.py`: contrato de plugin.
- `registry.py`: registro y selección.
- `plugins/sklearn.py`, `plugins/statsmodels.py`, `plugins/prophet.py` (stubs).
Integra tus modelos ahí. El API consume `predict_outcome` y `describe_text`.

## Rutas clave (API)
- `POST /chat/plan` → plan express + script + banderas.
- `POST /chat/evaluate` → evaluación de mensaje.
- `POST /ab/generate` → A/B de textos.
- `POST /progress/log` → guardar progreso diario.
- `GET  /healthz`

## Licencia
MIT — libre de uso comercial.

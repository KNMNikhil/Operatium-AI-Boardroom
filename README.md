# Operatium

![Operatium Overview](https://img.shields.io/badge/Status-Active-brightgreen.svg)
![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)
![React](https://img.shields.io/badge/React-18-blue.svg)
![Ollama](https://img.shields.io/badge/Ollama-Local_Inference-orange.svg)

Operatium is an **AI-driven Executive Board Simulator**. It leverages multiple autonomous AI agents—acting as CEO, CTO, Product Manager, etc.—to debate, analyze, and validate startup ideas or business strategies in real-time.

Operatium runs 100% locally via **Ollama**, ensuring your data remains private and your inference costs remain zero. It uses an advanced Retrieval-Augmented Generation (RAG) system hooked up to **Supabase (pgvector)** to ensure each executive speaks from role-specific frameworks and historical company memory.

---

## 🏗️ Architecture

- **LLM Engine:** Local inference using **Ollama** (`qwen3.5`).
- **Orchestration:** **LangGraph** orchestrates the multi-agent analysis, debate, and decision flow.
- **Backend:** **FastAPI** provides REST endpoints and WebSocket streaming.
- **Database / Vector Store:** **Supabase (PostgreSQL + pgvector)** stores meeting history, generated reports, and embedded RAG knowledge bases.
- **Frontend:** A rich **React** UI (Vite) providing real-time token-streaming chat interfaces.

---

## ✨ Features

- **Multi-Agent Debates:** Watch the CTO argue with the Product Manager while the CEO synthesizes the final strategic report.
- **Local Privacy:** Fully local inference. No data is sent to OpenAI or Anthropic. (Optional external API fallbacks available).
- **Persistent Memory:** Executives remember past decisions and incorporate them into future responses.
- **Live Streaming:** Real-time token streaming to the frontend via WebSockets.
- **Dynamic RAG:** Ingest PDFs or raw text to train executives on specific frameworks (e.g., Y Combinator essays for the CEO).

---

## 🚀 Quick Start & Installation

### Prerequisites

You will need the following installed on your machine:
1. [Node.js (v18+)](https://nodejs.org/)
2. [Python 3.10+](https://www.python.org/)
3. [Ollama](https://ollama.com/)
4. A [Supabase](https://supabase.com/) account (or a local Supabase CLI setup).

### 1. Set up Ollama (Local LLM)
Operatium is pre-configured to use **Qwen 3.5**.
```bash
# Start your Ollama server
ollama serve

# In a new terminal, pull the model
ollama pull qwen3.5
```

### 2. Set up the Database (Supabase)
Operatium relies on Supabase for data persistence and `pgvector` for RAG.
1. Create a new Supabase project.
2. In the Supabase SQL editor, execute the schema located in `backend/schema.sql`.
3. Gather your `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the Supabase Project Settings.

### 3. Set up the Backend
```bash
cd backend

# Create and activate a virtual environment
python -m venv venv

# Windows:
.\venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
pip install langchain-ollama

# Environment Variables
cp .env.example .env
```
Edit your `.env` file in the `backend/` directory:
```env
SUPABASE_URL="your-supabase-url"
SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Optional: If you want to use OpenRouter as a fallback
OPENROUTER_API_KEY="" 
```

**Run the Backend:**
```bash
# Start the FastAPI server on port 8000
fastapi run app/main.py
```

### 4. Set up the Frontend
```bash
cd frontend

# Install dependencies
npm install

# Environment Variables
cp .env.example .env
```
Ensure your `.env` file points to the backend (usually `VITE_API_URL=http://localhost:8000`).

**Run the Frontend:**
```bash
npm run dev
```

Visit `http://localhost:5173` to start your first boardroom meeting!

---

## 🧠 Knowledge Management (RAG)
You can inject custom knowledge into the executives' brains using the provided API or scripts.
For example, to ingest Y Combinator essays for the CEO:
```bash
python backend/scripts/ingest_rag_data.py
```
*Note: RAG embeddings currently default to Google's embedding model. Ensure your `GOOGLE_API_KEY` is set in the backend `.env` if you are using the default embedding script, or swap the `GeminiEmbeddings` class in `vector_store.py` to use a local embedding model.*

---

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

## 📝 License
This project is open-sourced under the MIT License.

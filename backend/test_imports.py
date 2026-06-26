"""
test_imports.py -- Verify all Operatium stack components are correctly installed and configured.

Tests:
  1. Supabase connectivity (all tables including knowledge_base)
  2. Ollama Qwen3.5 LLM (primary)
  3. OpenRouter gpt-oss-120b:free (fallback)
  4. Google text-embedding-004 (RAG embeddings)
  5. LangGraph import
  6. LLM with_fallbacks chain
"""

import os, sys
from dotenv import load_dotenv
load_dotenv()

# Force UTF-8 on Windows
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")


def test_supabase():
    print("\n-- Supabase ----------------------------------")
    from supabase import create_client
    client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_ANON_KEY"))
    tables = ["startups", "meetings", "meeting_messages", "reports", "decisions", "knowledge_base"]
    for t in tables:
        try:
            client.table(t).select("*").limit(1).execute()
            print(f"  OK: {t}")
        except Exception as e:
            print(f"  MISSING: {t}: {e}")


def test_ollama_llm():
    print("\n-- Ollama Qwen 3.5 ---------------------------")
    try:
        from langchain_ollama import ChatOllama
        llm = ChatOllama(model="qwen3.5")
        result = llm.invoke("Say 'ok' in one word.")
        print(f"  OK: {result.content[:60]}")
    except Exception as e:
        print(f"  FAIL: {e}")


def test_openrouter():
    print("\n-- OpenRouter gpt-oss-120b:free --------------")
    if not os.getenv("OPENROUTER_API_KEY"):
        print("  SKIP: OPENROUTER_API_KEY not set")
        return
    try:
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(
            model="openai/gpt-oss-120b:free",
            openai_api_base="https://openrouter.ai/api/v1",
            openai_api_key=os.getenv("OPENROUTER_API_KEY"),
        )
        result = llm.invoke("Say 'ok' in one word.")
        print(f"  OK: {result.content[:60]}")
    except Exception as e:
        print(f"  FAIL: {e}")


def test_embeddings():
    print("\n-- Google gemini-embedding-001 ---------------")
    try:
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        model = os.getenv("EMBEDDING_MODEL", "models/gemini-embedding-001")
        emb = GoogleGenerativeAIEmbeddings(
            model=model,
            google_api_key=os.getenv("GOOGLE_API_KEY"),
        )
        vec = emb.embed_query("Hello from Operatium")
        print(f"  OK: Embedding dim = {len(vec)}")
    except Exception as e:
        print(f"  FAIL: {e}")


def test_fallback_chain():
    print("\n-- LLM with_fallbacks chain ------------------")
    try:
        from langchain_ollama import ChatOllama
        from langchain_openai import ChatOpenAI
        primary = ChatOllama(model="qwen3.5")
        if os.getenv("OPENROUTER_API_KEY"):
            fallback = ChatOpenAI(
                model="openai/gpt-oss-120b:free",
                openai_api_base="https://openrouter.ai/api/v1",
                openai_api_key=os.getenv("OPENROUTER_API_KEY"),
            )
            chain = primary.with_fallbacks([fallback])
        else:
            print("  SKIP: OPENROUTER_API_KEY not set")
            chain = primary
        result = chain.invoke("Say 'ok' in one word.")
        print(f"  OK: {result.content[:60]}")
    except Exception as e:
        print(f"  FAIL: {e}")


def test_langgraph():
    print("\n-- LangGraph ---------------------------------")
    try:
        from langgraph.graph import StateGraph, END
        print("  OK: LangGraph imported successfully")
    except Exception as e:
        print(f"  FAIL: {e}")


if __name__ == "__main__":
    test_supabase()
    test_ollama_llm()
    test_openrouter()
    test_embeddings()
    test_fallback_chain()
    test_langgraph()
    print("\n-- Done --------------------------------------\n")

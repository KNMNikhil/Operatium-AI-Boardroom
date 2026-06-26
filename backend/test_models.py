import asyncio
import os
from dotenv import load_dotenv
load_dotenv()

async def test_models():
    from langchain_ollama import ChatOllama
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import HumanMessage

    print("Testing Ollama (qwen3.5)...")
    try:
        primary = ChatOllama(
            model="qwen3.5",
            temperature=0.6
        )
        resp = await primary.ainvoke([HumanMessage(content="Hello, say 'Ollama is working'")])
        print(f"Ollama response: {resp.content}")
    except Exception as e:
        print(f"Ollama failed: {e}")

    print("Testing OpenRouter...")
    try:
        fallback = ChatOpenAI(
            model="openai/gpt-oss-120b:free",
            openai_api_base="https://openrouter.ai/api/v1",
            openai_api_key=os.environ.get("OPENROUTER_API_KEY"),
            max_retries=5
        )
        resp = await fallback.ainvoke([HumanMessage(content="Hello, say 'OpenRouter is working'")])
        print(f"OpenRouter response: {resp.content}")
    except Exception as e:
        print(f"OpenRouter failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_models())

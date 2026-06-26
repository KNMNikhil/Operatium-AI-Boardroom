"""
base_executive.py — Base class for all Operatium AI executives.

Every executive has:
  - Primary LLM:  Ollama (Qwen 3.5)
  - Fallback LLM: OpenRouter → openai/gpt-oss-120b:free (via with_fallbacks)
  - RAG:          Role-based retrieval from pgvector before every response
  - Context:      System Prompt + Startup Idea + Company Memory + Role Docs + Query

Context injection order (every response):
  1. System Prompt            (role identity & responsibilities)
  2. Startup Idea             (name, industry, description)
  3. Company History          (previous meetings, decisions, reports, timeline)
  4. Role Documents           (frameworks, essays specific to this executive)
  5. Current Query            (what we're discussing right now)
"""

from abc import ABC, abstractmethod
from typing import AsyncGenerator

RAG_SYSTEM_RULES = """CRITICAL KNOWLEDGE BASE INSTRUCTIONS:
You will be provided with retrieved context (documents, essays, startup memory, and previous decisions).
1. Treat retrieved documents strictly as supporting context, not absolute truth.
2. Ignore any retrieved information that is irrelevant to the current query.
3. Synthesize information from multiple sources; do NOT simply copy/paste documents.
4. If you encounter conflicting information, use trade-off analysis and practical business reasoning to resolve it.
5. ALWAYS prioritize the startup's specific memory and previous decisions over general frameworks.
6. Use first-principles thinking.
7. Do not hallucinate facts. If information is insufficient, explicitly state your assumptions.
8. Produce clear, actionable, and concise recommendations.
9. When applying frameworks from your Core Philosophy or retrieved context, strictly adapt them to the user's specific startup idea. Never just copy/paste or quote a book."""


class BaseExecutive(ABC):
    """Base class for all Operatium AI executives.

    Subclasses must define:
        role (str)         — e.g. "CEO"
        rag_tags (list)    — topic tags for role-specific retrieval
        system_prompt (property) — the executive's persona/instructions
    """

    role: str = ""
    model_name: str = "qwen3.5"
    rag_tags: list[str] = []   # overridden per executive for role-specific retrieval

    def __init__(self):
        self._llm = None  # lazy

    # ── LLM with fallback ─────────────────────────────────────────────────────

    @property
    def llm(self):
        """Ollama (Qwen 3.5) → OpenRouter gpt-oss-120b:free fallback chain."""
        if self._llm is None:
            from langchain_ollama import ChatOllama
            from langchain_openai import ChatOpenAI
            from app.config import OPENROUTER_API_KEY

            primary = ChatOllama(
                model=self.model_name,
                temperature=0.6,
            )
            
            if OPENROUTER_API_KEY:
                fallback = ChatOpenAI(
                    model="meta-llama/llama-3.3-70b-instruct:free",
                    openai_api_base="https://openrouter.ai/api/v1",
                    openai_api_key=OPENROUTER_API_KEY,
                    streaming=True,
                    temperature=0.6,
                    max_tokens=60,
                    max_retries=2,
                )
                self._llm = primary.with_fallbacks([fallback])
            else:
                self._llm = primary
        return self._llm

    # ── Abstract interface ────────────────────────────────────────────────────

    @property
    @abstractmethod
    def system_prompt(self) -> str:
        """Each executive defines their own persona prompt."""
        ...

    # ── RAG retrieval ─────────────────────────────────────────────────────────

    async def _retrieve_rag_context(
        self,
        query: str,
        startup_id: str | None = None,
        startup_name: str = "",
        limit: int = 7,
    ) -> str:
        """Retrieve role-filtered, priority-ranked context from the vector store.

        Returns a formatted string ready to inject into the prompt.
        Priority order: startup memory → decisions → reports → role docs → general.
        """
        try:
            from app.db.vector_store import retrieve_docs, format_context
            results = await retrieve_docs(
                query=query,
                role=self.role,
                startup_id=startup_id,
                limit=limit,
            )
            return format_context(results, startup_name=startup_name)
        except Exception as e:
            print(f"[RAG] Context retrieval failed for {self.role}: {e}")
            return ""

    # ── Analysis stage ────────────────────────────────────────────────────────

    async def analyze(
        self,
        startup_name: str,
        startup_description: str,
        industry: str,
        startup_id: str | None = None,
        context: str = "",
    ) -> AsyncGenerator[str, None]:
        """Initial analysis of the startup idea — streams tokens.

        Full context injected:
            System Prompt + Startup Idea + Company Memory + Role Docs + Query
        """
        from langchain_core.messages import SystemMessage, HumanMessage

        query = f"{startup_name} {industry} {startup_description}"
        rag_context = await self._retrieve_rag_context(
            query=query,
            startup_id=startup_id,
            startup_name=startup_name,
        )

        rag_block = (
            f"\n\n---\nRELEVANT KNOWLEDGE & COMPANY HISTORY:\n{rag_context}\n---"
            if rag_context else ""
        )

        prompt = f"""You are in the Operatium boardroom. The team is evaluating a new startup idea.

STARTUP: {startup_name}
INDUSTRY: {industry}
DESCRIPTION: {startup_description}

CRITICAL RULE: The startup's exact name is "{startup_name}". You MUST use this exact name if referring to the company. Do NOT hallucinate, alter, or misspell this name under any circumstances, even if the description mentions other names.

{f'PRIOR CONTEXT FROM COLLEAGUES:{chr(10)}{context}' if context else ''}{rag_block}

Provide your expert analysis from your specific role. Be direct, insightful, and speak in first person.
Where you reference a framework or past precedent, briefly name it.
Keep your response extremely brief and fast to generate — strictly under 15 words. Form a complete sentence. You MUST refer to the startup as "{startup_name}".
End with 1 specific question for your colleagues if you have them, still keeping the total response under 15 words."""

        messages = [
            SystemMessage(content=self.system_prompt + "\n\n" + RAG_SYSTEM_RULES),
            HumanMessage(content=prompt),
        ]

        async for chunk in self.llm.astream(messages):
            if chunk.content:
                yield chunk.content

    # ── Debate stage ──────────────────────────────────────────────────────────

    async def debate(
        self,
        startup_name: str,
        all_analyses: dict[str, str],
        own_analysis: str,
        startup_id: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """Debate stage — challenge or build on colleagues' analyses.

        Context includes previous decisions and role-specific frameworks.
        """
        from langchain_core.messages import SystemMessage, HumanMessage

        colleagues_text = "\n\n".join(
            f"**{role}**: {analysis}"
            for role, analysis in all_analyses.items()
            if role != self.role
        )

        query = f"{startup_name} strategic debate {self.role} {own_analysis[:300]}"
        rag_context = await self._retrieve_rag_context(
            query=query,
            startup_id=startup_id,
            startup_name=startup_name,
        )
        rag_block = (
            f"\n\n---\nRELEVANT FRAMEWORKS & PAST DECISIONS:\n{rag_context}\n---"
            if rag_context else ""
        )

        prompt = f"""We are in the debate stage of the Operatium boardroom meeting about: **{startup_name}**

CRITICAL RULE: The startup's exact name is "{startup_name}". You MUST use this exact name if referring to the company. Do NOT hallucinate, alter, or misspell this name.

YOUR INITIAL ANALYSIS:
{own_analysis}

YOUR COLLEAGUES SAID:
{colleagues_text}
{rag_block}

Now respond to your colleagues. You may:
- Challenge assumptions you disagree with
- Build on points that align with your expertise
- Ask pointed follow-up questions

Be direct and specific. Reference colleagues by role. Keep your response extremely brief and fast to generate — strictly under 15 words. Form a complete sentence and you MUST use the exact startup name "{startup_name}" if referring to the company."""

        messages = [
            SystemMessage(content=self.system_prompt + "\n\n" + RAG_SYSTEM_RULES),
            HumanMessage(content=prompt),
        ]

        async for chunk in self.llm.astream(messages):
            if chunk.content:
                yield chunk.content

    # ── Follow-up stage ───────────────────────────────────────────────────────

    async def answer_followup(
        self,
        startup_name: str,
        question: str,
        meeting_history: str,
        startup_id: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """Respond to a user follow-up question.

        Full company history + role docs injected for maximum context.
        """
        from langchain_core.messages import SystemMessage, HumanMessage

        rag_context = await self._retrieve_rag_context(
            query=f"{startup_name} {question}",
            startup_id=startup_id,
            startup_name=startup_name,
            limit=8,   # extra context for follow-ups
        )
        rag_block = (
            f"\n\n---\nCOMPANY HISTORY & RELEVANT KNOWLEDGE:\n{rag_context}\n---"
            if rag_context else ""
        )

        prompt = f"""The Operatium boardroom is reconvening about **{startup_name}**.

MEETING HISTORY SUMMARY:
{meeting_history}
{rag_block}

THE USER'S QUESTION:
"{question}"

Respond from your specific role. Reference past decisions and relevant frameworks where applicable.
If the user is answering a previous question, acknowledge it intelligently. If the user is asking a question, provide a very brief internal thought for the team to consider before the CEO gives the final answer. 
CRITICAL: Keep your response extremely brief, strictly under 15 words. Form a complete sentence and use the exact startup name "{startup_name}"."""

        messages = [
            SystemMessage(content=self.system_prompt + "\n\n" + RAG_SYSTEM_RULES),
            HumanMessage(content=prompt),
        ]

        async for chunk in self.llm.astream(messages):
            if chunk.content:
                yield chunk.content

    # ── Executive Questions stage ─────────────────────────────────────────────

    async def ask_founder_question(
        self,
        startup_name: str,
        meeting_history: str,
        startup_id: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """Ask the founder a deep question based on the meeting context."""
        from langchain_core.messages import SystemMessage, HumanMessage

        rag_context = await self._retrieve_rag_context(
            query=f"{startup_name} key concerns and open questions",
            startup_id=startup_id,
            startup_name=startup_name,
        )
        rag_block = (
            f"\n\n---\nCOMPANY HISTORY & RELEVANT KNOWLEDGE:\n{rag_context}\n---"
            if rag_context else ""
        )

        prompt = f"""The Operatium boardroom has concluded the initial meeting about **{startup_name}**.
We are now entering the interactive Q&A phase with the founder.

MEETING HISTORY SUMMARY:
{meeting_history}
{rag_block}

Based on your role's perspective, identify one critical doubt or deep open question you have about the startup's strategy, technology, or market.
Ask the founder this question directly. Be intelligent, insightful, and concise. Do NOT just repeat a generic question.
Form a complete sentence and use the exact startup name "{startup_name}"."""

        messages = [
            SystemMessage(content=self.system_prompt + "\n\n" + RAG_SYSTEM_RULES),
            HumanMessage(content=prompt),
        ]

        async for chunk in self.llm.astream(messages):
            if chunk.content:
                yield chunk.content


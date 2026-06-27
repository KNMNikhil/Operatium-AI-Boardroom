"""
graph.py — LangGraph-orchestrated Operatium boardroom meeting.

Architecture:
    StateGraph nodes: analysis → debate → decision → report → persist
    Streaming: astream_events() → WebSocket → Frontend (token-by-token)
    RAG: Each executive pulls context via vector_store before generating.
    Fallback: Ollama (Qwen 3.5) → OpenRouter gpt-oss-120b:free (via with_fallbacks)
"""

import asyncio
import re
from typing import Optional, AsyncGenerator

from langgraph.graph import StateGraph, END
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from app.orchestrator.state import (
    MeetingState, StreamCallback,
    STAGE_ANALYSIS, STAGE_DEBATE, STAGE_DECISION, STAGE_REPORT, STAGE_COMPLETE,
)
from app.agents import get_executives
from app.db.supabase_client import get_supabase
from app.config import OPENROUTER_API_KEY


# ─── Decision LLM (with fallback) ────────────────────────────────────────────

def _build_decision_llm():
    """Build the decision-stage LLM with OpenRouter fallback."""
    primary = ChatOllama(
        model="qwen2.5:1.5b",
        temperature=0.7,
    )
    
    if OPENROUTER_API_KEY:
        fallback = ChatOpenAI(
            model="openai/gpt-oss-120b:free",
            openai_api_base="https://openrouter.ai/api/v1",
            openai_api_key=OPENROUTER_API_KEY,
            streaming=True,
            temperature=0.7,
            max_retries=5,
        )
        return primary.with_fallbacks([fallback])
    
    return primary


# ─── Graph Node Factories ─────────────────────────────────────────────────────

def make_analysis_node(on_stream: StreamCallback, supabase):
    """Returns the LangGraph analysis node function."""

    async def analysis_node(state: MeetingState) -> dict:
        executives = get_executives(state["executives"])
        analyses: dict[str, str] = state.get("analyses", {})
        msg_sequence = 0
        existing_messages = state.get("existing_messages", [])
        already_analyzed = {msg["executive_role"]: msg["content"] for msg in existing_messages if msg["stage"] == STAGE_ANALYSIS}
        analyses.update(already_analyzed)

        await on_stream(STAGE_ANALYSIS, "", "__stage_change__")
        try:
            supabase.table("meetings").update({"status": "analyzing"}).eq("id", state["meeting_id"]).execute()
        except Exception:
            pass

        for role, executive in executives.items():
            if role in already_analyzed:
                msg_sequence += 1
                continue

            await on_stream(STAGE_ANALYSIS, role, "__speaking__")
            full_text = ""

            async for token in executive.analyze(
                startup_name=state["startup_name"],
                startup_description=state["startup_description"],
                industry=state["industry"],
                startup_id=state["startup_id"],
                meeting_type=state.get("meeting_type", "full_board"),
            ):
                full_text += token
                await on_stream(STAGE_ANALYSIS, role, token)

            analyses[role] = full_text
            await on_stream(STAGE_ANALYSIS, role, "__done__")

            msg_sequence += 1
            try:
                supabase.table("meeting_messages").insert({
                    "meeting_id": state["meeting_id"],
                    "executive_role": role,
                    "content": full_text,
                    "message_type": "analysis",
                    "stage": STAGE_ANALYSIS,
                    "sequence_order": msg_sequence,
                }).execute()
            except Exception as e:
                print(f"[DB] Failed to save analysis message: {e}")

            await asyncio.sleep(0.3)

        return {"analyses": analyses, "current_stage": STAGE_DECISION}

    return analysis_node


def make_debate_node(on_stream: StreamCallback, supabase):
    """Returns the LangGraph debate node function."""

    async def debate_node(state: MeetingState) -> dict:
        executives = get_executives(state["executives"])
        important_roles = {"CEO", "CTO", "Product Manager", "Investor & Risk Advisor"}
        debate_execs = {role: exec for role, exec in executives.items() if role in important_roles}
        analyses = state["analyses"]
        debate_responses: dict[str, str] = state.get("debate_responses", {})
        msg_sequence = 1000
        existing_messages = state.get("existing_messages", [])
        already_debated = {msg["executive_role"]: msg["content"] for msg in existing_messages if msg["stage"] == STAGE_DEBATE}
        debate_responses.update(already_debated)

        await on_stream(STAGE_DEBATE, "", "__stage_change__")

        for role, executive in debate_execs.items():
            if role in already_debated:
                msg_sequence += 1
                continue

            await on_stream(STAGE_DEBATE, role, "__speaking__")
            full_text = ""

            async for token in executive.debate(
                startup_name=state["startup_name"],
                all_analyses=analyses,
                own_analysis=analyses.get(role, ""),
                startup_id=state["startup_id"],
                meeting_type=state.get("meeting_type", "full_board"),
            ):
                full_text += token
                await on_stream(STAGE_DEBATE, role, token)

            debate_responses[role] = full_text
            await on_stream(STAGE_DEBATE, role, "__done__")

            msg_sequence += 1
            try:
                supabase.table("meeting_messages").insert({
                    "meeting_id": state["meeting_id"],
                    "executive_role": role,
                    "content": full_text,
                    "message_type": "debate",
                    "stage": STAGE_DEBATE,
                    "sequence_order": msg_sequence,
                }).execute()
            except Exception as e:
                print(f"[DB] Failed to save debate message: {e}")

            await asyncio.sleep(0.3)

        # ─── CEO Closing Statement ──────────────
        ceo_closing = "That's all folks, thanks for your help and information. The floor is open for any questions."
        await on_stream(STAGE_DEBATE, "CEO", "__speaking__")
        for word in ceo_closing.split():
            await on_stream(STAGE_DEBATE, "CEO", word + " ")
            await asyncio.sleep(0.05)
        await on_stream(STAGE_DEBATE, "CEO", "__done__")
        
        msg_sequence += 1
        try:
            supabase.table("meeting_messages").insert({
                "meeting_id": state["meeting_id"],
                "executive_role": "CEO",
                "content": ceo_closing,
                "message_type": "debate",
                "stage": STAGE_DEBATE,
                "sequence_order": msg_sequence,
            }).execute()
        except Exception as e:
            print(f"[DB] Failed to save CEO closing: {e}")

        # Wait for CEO streaming to finish then signal meeting complete
        await on_stream(STAGE_COMPLETE, "", "__meeting_complete__")
        return {"debate_responses": debate_responses, "current_stage": STAGE_COMPLETE}

    return debate_node


def make_decision_node(on_stream: StreamCallback, supabase):
    """Returns the LangGraph decision node function (CEO synthesises final verdict)."""

    async def decision_node(state: MeetingState) -> dict:
        executives = get_executives(state["executives"])
        ceo_executive = executives.get("CEO")
        analyses = state["analyses"]
        debate_responses = state["debate_responses"]

        # No stage change stream to frontend for decision, it runs silently

        all_content = "\n\n".join(
            [f"**{role} Analysis**: {text}" for role, text in analyses.items()] +
            [f"**{role} Debate**: {text}" for role, text in debate_responses.items()]
        )

        decision_prompt = f"""The executive board has finished discussing the startup concept.
It is time to make a final strategic verdict and generate a structured report.

Startup Name: {state['startup_name']}
Industry: {state['industry']}
Concept: {state.get('concept', state.get('startup_description', ''))}

You must format your final output exactly as follows.
CRITICAL: You are writing this for a non-technical audience. Use simple, everyday English. If you must use a complex business or technical term, you MUST format it as: [[Term|Simple 1-2 line explanation]]. 

**CLOSING STATEMENT**:
[1-2 sentence statement thanking the executive team for their analysis and officially concluding the meeting]

**VALIDATION SCORE**: [0-100]

**ELEVATOR PITCH** (1 sentence simple explanation of the idea):
[Your 1 sentence pitch]

**DASHBOARD METRICS**:
- Market Potential: [0-10]
- Technical Feasibility: [0-10]
- Revenue Potential: [0-10]
- Execution Difficulty: [0-10]
- Investor Readiness: [0-10]

**STRENGTHS**:
- [Strength 1]
- [Strength 2]
- [Strength 3]

**CRITICAL RISKS TO WATCH**:
- [Risk 1]
- [Risk 2]
- [Risk 3]

**RECOMMENDATIONS**:
- [Recommendation 1]
- [Recommendation 2]
- [Recommendation 3]

**KEY DECISIONS** (exactly 5 numbered decisions the team agrees on):
1. [Decision 1]
2. [Decision 2]
3. [Decision 3]
4. [Decision 4]
5. [Decision 5]

**IMMEDIATE NEXT STEPS** (first 30 days):
1. ...
2. ...
3. ...

**ASSUMPTION REGISTRY**:
- [Assumption 1 the team made]
- [Assumption 2]
- [Assumption 3]

**KILL CRITERIA** (Set rules on when to kill the idea if things fail):
- IF [Failure Condition 1] -> KILL IT
- IF [Failure Condition 2] -> KILL IT

**CUSTOMER INTERVIEW PLAYBOOK**:
[Provide a short interview script and what to look for when interviewing customers]

**COMPETITIVE THREAT ASSESSMENT**:
[Based on the Growth & Marketing analysis, list the top competitors, their execution speed, and the threat level]

**BURN RATE CALCULATION**:
[Based on Finance & Operations, estimate the initial burn rate, runway, and financial requirements]
"""
        llm = _build_decision_llm()
        decision_text = ""

        async for chunk in llm.astream([
            SystemMessage(content=ceo_executive.system_prompt if ceo_executive else "You are the CEO."),
            HumanMessage(content=decision_prompt),
        ]):
            if chunk.content:
                decision_text += chunk.content

        # No __speaking__ or __done__ streams to frontend for decision node, it runs silently

        try:
            supabase.table("meeting_messages").insert({
                "meeting_id": state["meeting_id"],
                "executive_role": "CEO",
                "content": decision_text,
                "message_type": "decision",
                "stage": STAGE_DECISION,
                "sequence_order": 2000,
            }).execute()
        except Exception as e:
            print(f"[DB] Failed to save decision message: {e}")

        # ── Parse structured output ────────────────────────────────────────────
        validation_score = 0
        dashboard = {
            "Market Potential": 0,
            "Technical Feasibility": 0,
            "Revenue Potential": 0,
            "Execution Difficulty": 0,
            "Investor Readiness": 0,
        }

        for line in decision_text.split("\n"):
            line_upper = line.upper()
            if "VALIDATION SCORE" in line_upper:
                nums = re.findall(r'\d+', line)
                if nums:
                    validation_score = min(int(nums[0]), 100)
            for key in dashboard:
                if key.upper() in line_upper:
                    # Find all numbers appearing after the key in the line
                    idx = line_upper.find(key.upper())
                    nums = re.findall(r'\d+', line[idx:])
                    if nums:
                        dashboard[key] = min(int(nums[0]), 10)

        def extract_list(header: str) -> list[str]:
            items = []
            in_section = False
            for line in decision_text.split("\n"):
                line = line.strip()
                upper_line = line.upper()
                
                is_header_line = False
                if any(h in upper_line for h in ["DASHBOARD", "STRENGTHS", "CRITICAL RISKS", "RECOMMENDATIONS", "KEY DECISIONS", "IMMEDIATE NEXT STEPS", "ELEVATOR PITCH", "Q&A HISTORY", "ASSUMPTION REGISTRY", "KILL CRITERIA", "CUSTOMER INTERVIEW PLAYBOOK", "COMPETITIVE THREAT ASSESSMENT", "BURN RATE CALCULATION"]):
                    if line.startswith("**") or line.startswith("##") or (":" in line and len(line) < 200):
                        is_header_line = True

                if header.upper() in upper_line and is_header_line:
                    in_section = True
                    continue
                
                if in_section:
                    if is_header_line and header.upper() not in upper_line:
                        break
                    
                    if re.match(r'^[-*]\s+', line) or re.match(r'^\d+[\.)]\s+', line):
                        cleaned = re.sub(r'^[-*\d.)]+\s*', '', line)
                        if cleaned:
                            items.append(cleaned)
            return items

        elevator_pitch = ""
        in_pitch = False
        for line in decision_text.split("\n"):
            line = line.strip()
            if "ELEVATOR PITCH" in line.upper() and "**" in line:
                in_pitch = True
                continue
            if in_pitch:
                if line.startswith("**"):
                    break
                if line:
                    elevator_pitch += line + " "
        elevator_pitch = elevator_pitch.strip()

        strengths = extract_list("STRENGTHS")
        risks = extract_list("CRITICAL RISKS")
        recommendations = extract_list("RECOMMENDATIONS")
        decisions = extract_list("KEY DECISIONS")
        assumptions = extract_list("ASSUMPTION REGISTRY")
        kill_criteria = extract_list("KILL CRITERIA")

        def extract_section_text(header: str) -> str:
            content = ""
            in_section = False
            for line in decision_text.split("\n"):
                line_stripped = line.strip()
                upper_line = line_stripped.upper()
                
                is_header_line = False
                if any(h in upper_line for h in ["DASHBOARD", "STRENGTHS", "CRITICAL RISKS", "RECOMMENDATIONS", "KEY DECISIONS", "IMMEDIATE NEXT STEPS", "ELEVATOR PITCH", "Q&A HISTORY", "ASSUMPTION REGISTRY", "KILL CRITERIA", "CUSTOMER INTERVIEW PLAYBOOK", "COMPETITIVE THREAT ASSESSMENT", "BURN RATE CALCULATION"]):
                    if line_stripped.startswith("**") or line_stripped.startswith("##") or (":" in line_stripped and len(line_stripped) < 200):
                        is_header_line = True

                if header.upper() in upper_line and is_header_line:
                    in_section = True
                    continue
                
                if in_section:
                    if is_header_line and header.upper() not in upper_line:
                        break
                    content += line + "\n"
            return content.strip()

        interview_playbook = extract_section_text("CUSTOMER INTERVIEW PLAYBOOK")
        competitor_threats = extract_section_text("COMPETITIVE THREAT ASSESSMENT")
        burn_rate_calc = extract_section_text("BURN RATE CALCULATION")

        # Save decisions to DB
        try:
            for decision in decisions:
                supabase.table("decisions").insert({
                    "startup_id": state["startup_id"],
                    "meeting_id": state["meeting_id"],
                    "decision_text": decision,
                    "made_by": "CEO",
                    "decision_type": "strategic",
                }).execute()
        except Exception as e:
            print(f"[DB] Failed to save decisions: {e}")

        report_content = {
            "validation_score": validation_score,
            "elevator_pitch": elevator_pitch,
            "dashboard": dashboard,
            "strengths": strengths,
            "risks": risks,
            "recommendations": recommendations,
            "decisions": decisions,
            "assumptions": assumptions,
            "kill_criteria": kill_criteria,
            "interview_playbook": interview_playbook,
            "competitor_threats": competitor_threats,
            "burn_rate_calc": burn_rate_calc,
            "analysis": analyses,
        }

        return {
            "decisions": decisions,
            "report": {
                "startup_name": state["startup_name"],
                "industry": state["industry"],
                **report_content,
                "_validation_score": validation_score,
            },
            "current_stage": STAGE_REPORT,
        }

    return decision_node


def make_report_node(on_stream: StreamCallback, supabase):
    """Returns the LangGraph report/persist node function."""

    async def report_node(state: MeetingState) -> dict:
        report = state["report"]
        validation_score = report.get("_validation_score", 0)

        await on_stream(STAGE_REPORT, "", "__stage_change__")

        # Save report
        try:
            supabase.table("reports").insert({
                "startup_id": state["startup_id"],
                "meeting_id": state["meeting_id"],
                "report_type": "full",
                "content": {k: v for k, v in report.items() if k != "_validation_score"},
            }).execute()
        except Exception as e:
            print(f"[DB] Failed to save report: {e}")

        # Update startup validation score
        try:
            supabase.table("startups").update({
                "validation_score": validation_score,
                "stage": "validation" if validation_score > 30 else "idea",
            }).eq("id", state["startup_id"]).execute()
        except Exception as e:
            print(f"[DB] Failed to update startup: {e}")

        # Mark meeting complete
        try:
            supabase.table("meetings").update({
                "status": "completed",
                "completed_at": datetime.utcnow().isoformat(),
            }).eq("id", state["meeting_id"]).execute()
        except Exception as e:
            print(f"[DB] Failed to complete meeting: {e}")

        # Persist meeting summary to startup RAG memory asynchronously
        asyncio.create_task(
            _persist_meeting_to_rag(state)
        )

        await on_stream(STAGE_COMPLETE, "", "__meeting_complete__")
        return {"current_stage": STAGE_COMPLETE}

    return report_node


# ─── RAG memory persistence (background) ─────────────────────────────────────

async def _persist_meeting_to_rag(state: MeetingState) -> None:
    """After a meeting completes, persist key content to startup RAG memory.
    Runs as a fire-and-forget background task."""
    try:
        from app.db.vector_store import add_startup_memory

        startup_id = state["startup_id"]
        startup_name = state["startup_name"]
        texts = []
        metadatas = []

        # Analyses
        for role, analysis in state.get("analyses", {}).items():
            texts.append(f"[{startup_name}] {role} Analysis: {analysis}")
            metadatas.append({"category": "analysis", "executive": role})

        # Debate
        for role, debate in state.get("debate_responses", {}).items():
            texts.append(f"[{startup_name}] {role} Debate: {debate}")
            metadatas.append({"category": "debate", "executive": role})

        # Decisions
        decisions = state.get("decisions", [])
        if decisions:
            texts.append(f"[{startup_name}] Key Decisions: " + " | ".join(decisions))
            metadatas.append({"category": "decisions"})

        if texts:
            await add_startup_memory(startup_id=startup_id, texts=texts, metadatas=metadatas)
            print(f"[RAG] Persisted {len(texts)} memory entries for startup {startup_id}")
    except Exception as e:
        print(f"[RAG] Failed to persist meeting memory: {e}")


# ─── Main entry points ────────────────────────────────────────────────────────

async def run_meeting(
    state: MeetingState,
    on_stream: StreamCallback,
) -> MeetingState:
    """
    Main meeting orchestrator using LangGraph StateGraph.

    Flow: analysis → debate → END
    All stages stream tokens in real-time via on_stream callback → WebSocket.
    """
    supabase = get_supabase()

    # Build the graph
    graph = StateGraph(MeetingState)

    graph.add_node("analysis", make_analysis_node(on_stream, supabase))
    graph.add_node("debate", make_debate_node(on_stream, supabase))

    graph.set_entry_point("analysis")
    graph.add_edge("analysis", "debate")
    graph.add_edge("debate", END)

    compiled = graph.compile()

    # Run through the graph — each node streams tokens via on_stream callback
    final_state = await compiled.ainvoke(state)
    return final_state


async def run_followup(
    startup_name: str,
    startup_id: str,
    meeting_id: str,
    question: str,
    executives: list[str],
    meeting_history: str,
    on_stream: StreamCallback,
    meeting_type: str = "full_board",
) -> None:
    """Run a follow-up question through all selected executives.
    Retrieves startup-specific RAG context for each executive's response.
    """
    supabase = get_supabase()
    exec_map = get_executives(executives)
    msg_sequence = 3000  # offset to avoid collision

    await on_stream("followup", "", "__stage_change__")

    # Smart Routing: Ask LLM which executives should answer
    from langchain_core.messages import HumanMessage
    router_prompt = f"""Analyze this question from the founder: "{question}"
Which two of these executives are best suited to provide specialized insights before the CEO gives the final answer?
Available Executives: {', '.join([r for r in executives if r != 'CEO'])}
Return ONLY their exact titles separated by a comma (e.g., "CTO, Finance & Operations"). If the question explicitly asks for the CEO or is purely general, you can just return nothing."""
    
    routing_response = ""
    if "CEO" in exec_map:
        try:
            resp = await exec_map["CEO"].llm.ainvoke([HumanMessage(content=router_prompt)])
            routing_response = resp.content
        except Exception:
            routing_response = ""

    discussion_roles = []
    for r in executives:
        if r != "CEO" and r in routing_response:
            discussion_roles.append(r)
    
    # Fallback if routing fails or returns empty
    if not discussion_roles:
        discussion_roles = [r for r in executives if r != "CEO"][:2]
    else:
        # cap at 2 max
        discussion_roles = discussion_roles[:2]

    recent_discussion_text = ""

    for role in discussion_roles:
        executive = exec_map[role]
        await on_stream("followup", role, "__speaking__")

        full_text = ""
        async for token in executive.answer_followup(
            startup_name=startup_name,
            question=question,
            meeting_history=meeting_history,
            startup_id=startup_id,
            meeting_type=meeting_type,
        ):
            full_text += token
            await on_stream("followup", role, token)

        await on_stream("followup", role, "__done__")
        recent_discussion_text += f"[{role}]: {full_text}\n"

        msg_sequence += 1
        try:
            supabase.table("meeting_messages").insert({
                "meeting_id": meeting_id,
                "executive_role": role,
                "content": full_text,
                "message_type": "followup",
                "stage": "followup",
                "sequence_order": msg_sequence,
            }).execute()
        except Exception as e:
            print(f"[DB] Failed to save followup: {e}")

        await asyncio.sleep(0.2)

    # CEO Final Synthesis
    if "CEO" in exec_map:
        await on_stream("followup", "CEO", "__speaking__")
        from langchain_core.messages import SystemMessage, HumanMessage
        prompt = f"""You are the CEO of Operatium. The founder asked: "{question}"
Your executive team just provided these brief thoughts:
{recent_discussion_text}

Provide the final, highly structured, comprehensive, and innovative answer to the founder. 
DO NOT summarize or repeat the discussion of the executives. The founder wants a direct, extremely clear ANSWER to their specific question based on the insights provided. Focus entirely on giving them the exact result, actionable advice, or explanation they asked for.
If the founder asks for specific estimates (like timelines, team size, budget, or metrics), YOU MUST PROVIDE EXPLICIT LOGICAL ESTIMATES (e.g., "3-6 months", "2 engineers", "$50k-$100k") based on industry standards for {startup_name}. DO NOT give vague answers like "it depends" without providing a concrete baseline.
If the founder specifies a currency (e.g., INR, USD, AUD), YOU MUST accurately calculate and format all financial estimates in that exact currency.
Use Markdown formatting extensively (bolding, bullet points, numbered lists, tables, etc.) to make the answer visually appealing and easy to digest.
Start your answer EXACTLY with: "Thanks folks."
Be clear, direct, and use the exact startup name "{startup_name}"."""
        
        full_text = ""
        async for chunk in exec_map["CEO"].llm.astream([SystemMessage(content="You are the CEO."), HumanMessage(content=prompt)]):
            if chunk.content:
                full_text += chunk.content
                await on_stream("followup", "CEO", chunk.content)
        
        await on_stream("followup", "CEO", "__done__")
        msg_sequence += 1
        try:
            supabase.table("meeting_messages").insert({
                "meeting_id": meeting_id,
                "executive_role": "CEO",
                "content": full_text,
                "message_type": "followup",
                "stage": "followup",
                "sequence_order": msg_sequence,
            }).execute()
        except Exception as e:
            print(f"[DB] Failed to save CEO followup: {e}")

    await on_stream("followup", "", "__meeting_complete__")


async def run_executive_questions(
    startup_name: str,
    startup_id: str,
    meeting_id: str,
    executives: list[str],
    meeting_history: str,
    on_stream: StreamCallback,
) -> None:
    """Trigger key executives to ask questions to the founder based on the meeting context."""
    supabase = get_supabase()
    # Limit to key roles for Q&A to prevent overwhelming the user
    important_roles = {"CEO", "CTO", "Product Manager", "Investor & Risk Advisor"}
    exec_map = get_executives([r for r in executives if r in important_roles])
    msg_sequence = 4000

    await on_stream("followup", "", "__stage_change__")

    for role, executive in exec_map.items():
        await on_stream("followup", role, "__speaking__")
        full_text = ""
        async for token in executive.ask_founder_question(
            startup_name=startup_name,
            meeting_history=meeting_history,
            startup_id=startup_id,
        ):
            full_text += token
            await on_stream("followup", role, token)

        await on_stream("followup", role, "__done__")

        msg_sequence += 1
        try:
            supabase.table("meeting_messages").insert({
                "meeting_id": meeting_id,
                "executive_role": role,
                "content": full_text,
                "message_type": "followup",
                "stage": "followup",
                "sequence_order": msg_sequence,
            }).execute()
        except Exception as e:
            print(f"[DB] Failed to save executive question: {e}")

        await asyncio.sleep(0.2)

    await on_stream("followup", "", "__meeting_complete__")


async def generate_dynamic_report(meeting_id: str) -> dict:
    """Generate a dynamic report from the current meeting context using the CEO LLM."""
    supabase = get_supabase()
    meeting_data = supabase.table("meetings").select("*").eq("id", meeting_id).single().execute()
    if not meeting_data.data:
        raise Exception("Meeting not found")
    
    meeting = meeting_data.data
    startup_data = supabase.table("startups").select("*").eq("id", meeting["startup_id"]).single().execute()
    startup = startup_data.data or {}

    messages = supabase.table("meeting_messages").select("*").eq("meeting_id", meeting_id).order("sequence_order").execute()
    
    # Compile history
    history = "\n\n".join([f"**{m['executive_role']} ({m['stage'].upper()})**: {m['content']}" for m in (messages.data or [])])

    decision_prompt = f"""The executive board has finished discussing the startup concept.
It is time to make a final strategic verdict and generate a structured report.

Startup Name: {startup.get('name')}
Industry: {startup.get('industry')}
Concept: {startup.get('description')}

Here is the accumulated meeting context:
{history}

You must format your final output exactly as follows.
CRITICAL: You are writing this for a non-technical audience. Use simple, everyday English. If you must use a complex business or technical term, you MUST format it as: [[Term|Simple 1-2 line explanation]]. 

**CLOSING STATEMENT**:
[1-2 sentence statement thanking the executive team for their analysis and officially concluding the meeting]

**VALIDATION SCORE**: [0-100]

**ELEVATOR PITCH** (1 sentence simple explanation of the idea):
[Your 1 sentence pitch]

**DASHBOARD METRICS**:
- Market Potential: [0-10]
- Technical Feasibility: [0-10]
- Revenue Potential: [0-10]
- Execution Difficulty: [0-10]
- Investor Readiness: [0-10]

**STRENGTHS**:
- [Strength 1]
- [Strength 2]
- [Strength 3]

**CRITICAL RISKS TO WATCH**:
- [Risk 1]
- [Risk 2]
- [Risk 3]

**RECOMMENDATIONS**:
- [Recommendation 1]
- [Recommendation 2]
- [Recommendation 3]

**KEY DECISIONS** (List 5-8 major strategic decisions agreed upon during the meeting. Make them detailed, crisp, and highly actionable. Each decision should be 1-2 sentences):
1. [Detailed Decision 1]
2. [Detailed Decision 2]
3. [Detailed Decision 3]
4. [Detailed Decision 4]
5. [Detailed Decision 5]

**Q&A HISTORY** (Summarize any follow-up questions asked by the founder and the exact answers given. If none, write "No questions asked"):
Q: [Question]
A: [Answer]

**IMMEDIATE NEXT STEPS** (first 30 days):
1. ...
2. ...
3. ...
"""
    llm = _build_decision_llm()
    decision_text = ""
    async for chunk in llm.astream([
        SystemMessage(content="You are the CEO summarizing the meeting into a report."),
        HumanMessage(content=decision_prompt),
    ]):
        if chunk.content:
            decision_text += chunk.content

    # Parse structured output
    validation_score = 0
    dashboard = {
        "Market Potential": 0,
        "Technical Feasibility": 0,
        "Revenue Potential": 0,
        "Execution Difficulty": 0,
        "Investor Readiness": 0,
    }

    for line in decision_text.split("\n"):
        line_upper = line.upper()
        if "VALIDATION SCORE" in line_upper:
            nums = re.findall(r'\d+', line)
            if nums:
                validation_score = min(int(nums[0]), 100)
        for key in dashboard:
            if key.upper() in line_upper:
                idx = line_upper.find(key.upper())
                nums = re.findall(r'\d+', line[idx:])
                if nums:
                    dashboard[key] = min(int(nums[0]), 10)

    def extract_list(header: str) -> list[str]:
        items = []
        in_section = False
        for line in decision_text.split("\n"):
            line = line.strip()
            upper_line = line.upper()
            
            is_header_line = False
            if any(h in upper_line for h in ["DASHBOARD", "STRENGTHS", "CRITICAL RISKS", "RECOMMENDATIONS", "KEY DECISIONS", "IMMEDIATE NEXT STEPS", "ELEVATOR PITCH", "Q&A HISTORY"]):
                if line.startswith("**") or line.startswith("##") or (":" in line and len(line) < 200):
                    is_header_line = True

            if header.upper() in upper_line and is_header_line:
                in_section = True
                continue
            
            if in_section:
                if is_header_line and header.upper() not in upper_line:
                    break
                
                if re.match(r'^[-*]\s+', line) or re.match(r'^\d+[\.)]\s+', line):
                    cleaned = re.sub(r'^[-*\d.)]+\s*', '', line)
                    if cleaned:
                        items.append(cleaned)
        return items

    elevator_pitch = ""
    in_pitch = False
    for line in decision_text.split("\n"):
        line = line.strip()
        if "ELEVATOR PITCH" in line.upper() and "**" in line:
            in_pitch = True
            continue
        if in_pitch:
            if line.startswith("**"):
                break
            if line:
                elevator_pitch += line + " "
    elevator_pitch = elevator_pitch.strip()

    strengths = extract_list("STRENGTHS")
    risks = extract_list("CRITICAL RISKS")
    recommendations = extract_list("RECOMMENDATIONS")
    decisions = extract_list("KEY DECISIONS")

    qa_history = []
    in_qa = False
    current_q = None
    for line in decision_text.split("\n"):
        line = line.strip()
        if "Q&A HISTORY" in line.upper() and "**" in line:
            in_qa = True
            continue
        if in_qa:
            if line.startswith("**"):
                break
            if line.upper().startswith("Q:"):
                current_q = line[2:].strip()
            elif line.upper().startswith("A:") and current_q:
                qa_history.append({"question": current_q, "answer": line[2:].strip()})
                current_q = None

    # Update startup validation score
    try:
        supabase.table("startups").update({
            "validation_score": validation_score,
            "stage": "validation" if validation_score > 30 else "idea",
        }).eq("id", startup["id"]).execute()
    except Exception as e:
        print(f"[DB] Failed to update startup: {e}")

    report_content = {
        "validation_score": validation_score,
        "elevator_pitch": elevator_pitch,
        "dashboard": dashboard,
        "strengths": strengths,
        "risks": risks,
        "recommendations": recommendations,
        "decisions": decisions,
        "qa_history": qa_history,
    }

    report_data = {
        "startup_id": startup["id"],
        "meeting_id": meeting_id,
        "report_type": "dynamic",
        "content": report_content,
    }

    try:
        saved_report = supabase.table("reports").insert(report_data).execute()
        if saved_report.data:
            return saved_report.data[0]
    except Exception as e:
        print(f"[DB] Failed to save dynamic report: {e}")

    return report_data


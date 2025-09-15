import os
from typing import Dict, Any, Iterable
from openai import OpenAI

DEFAULT_MODEL = "gpt-4o-mini"


def stream_answer(question: str, relevant_insights: Dict[str, Any], model: str | None = None, verbose: bool = False) -> Iterable[str]:
    """
    Streams an answer from OpenAI using only the provided aggregated insights
    (never send raw rows). Yields text chunks suitable for SSE streaming.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        yield "[OpenAI missing configuration: set OPENAI_API_KEY env var]"
        return

    client = OpenAI()
    mdl = model or DEFAULT_MODEL

    system = (
        "You are a data assistant for a safety dashboard. You are given a JSON of precomputed "
        "insights (aggregated counts, trends). Answer using only this data. If data does not include "
        "the requested information, say you don't have it.\n\n"
        "Formatting: Start with a one-sentence summary, then concise bullets. For tables, use GitHub-flavored Markdown tables only (with a header row and separator). Do NOT output ASCII art tables."
    )
    if verbose:
        system += (
            "\n\nVerbose mode: Provide richer insights across multiple angles (Incidents, Hazards, Audits, Inspections) "
            "when available. Call out top categories, trends, and notable highs/lows. Keep phrasing crisp."
        )

    # Keep prompt lean — include only the relevant subset, not the entire KB
    user = (
        "User question: " + question + "\n\n"
        "Relevant insights JSON (keys and small objects):\n" + str(relevant_insights) + ("\n\nUser requested verbose insights: true" if verbose else "")
    )

    try:
        stream = client.chat.completions.create(
            model=mdl,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            stream=True,
        )
        for chunk in stream:
            try:
                delta = chunk.choices[0].delta
                txt = getattr(delta, "content", None)
                if txt:
                    # Yield raw text; FastAPI endpoint will wrap into SSE
                    yield txt
            except Exception:
                # if unexpected chunk shape, ignore
                continue
    except Exception as e:
        yield f"[OpenAI error: {getattr(e, 'message', str(e))}]"

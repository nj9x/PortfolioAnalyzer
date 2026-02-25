import json
import re
import logging

logger = logging.getLogger(__name__)


def _strip_markdown_fences(text: str) -> str:
    """Aggressively strip markdown code fences from a response."""
    text = text.strip()
    # Remove leading ```json or ``` (with optional whitespace/newlines)
    text = re.sub(r"^```(?:json|JSON)?\s*\n?", "", text)
    # Remove trailing ```
    text = re.sub(r"\n?\s*```\s*$", "", text)
    return text.strip()


def _try_repair_json(text: str) -> dict | None:
    """Attempt to repair truncated JSON by closing open braces/brackets."""
    text = _strip_markdown_fences(text)

    # Remove trailing comma if present
    text = text.rstrip().rstrip(",")

    # Count open/close braces and brackets
    open_braces = text.count("{") - text.count("}")
    open_brackets = text.count("[") - text.count("]")

    # If nothing to repair, skip
    if open_braces <= 0 and open_brackets <= 0:
        return None

    # Try to close at a reasonable boundary — trim back to last complete value
    # Remove any trailing partial string (unmatched quote)
    last_char = text.rstrip()[-1] if text.rstrip() else ""
    if last_char not in ("}", "]", '"', "e", "l"):  # true/false/null end chars
        # We're mid-value; try trimming back to last comma or colon
        trim_pos = max(text.rfind(","), text.rfind(":"), text.rfind("["), text.rfind("{"))
        if trim_pos > len(text) // 2:
            text = text[:trim_pos]
            # If we trimmed to a comma, remove it
            text = text.rstrip().rstrip(",")
            # Recount
            open_braces = text.count("{") - text.count("}")
            open_brackets = text.count("[") - text.count("]")

    # Close brackets then braces
    text += "]" * max(0, open_brackets)
    text += "}" * max(0, open_braces)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def parse_analysis_response(raw_response: str) -> dict:
    """Extract structured JSON from Claude's response."""
    # Strategy 1: Strip markdown fences and try direct parse
    stripped = _strip_markdown_fences(raw_response)
    try:
        result = json.loads(stripped)
        if isinstance(result, dict):
            return result
    except json.JSONDecodeError:
        pass

    # Strategy 2: Find JSON in code blocks (greedy .* to capture full nested object)
    json_match = re.search(r"```(?:json|JSON)?\s*(\{.*\})\s*```", raw_response, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # Strategy 3: Try parsing the entire response as JSON
    try:
        return json.loads(raw_response)
    except json.JSONDecodeError:
        pass

    # Strategy 4: Find the outermost JSON object in the response
    # Use a more targeted approach — find first { and last }
    first_brace = raw_response.find("{")
    last_brace = raw_response.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        candidate = raw_response[first_brace : last_brace + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    # Strategy 5: Try to repair truncated JSON (common when max_tokens is exceeded)
    repaired = _try_repair_json(raw_response)
    if repaired and isinstance(repaired, dict):
        repaired["_truncated"] = True
        logger.warning("JSON was truncated — repaired by closing brackets")
        return repaired

    # Fallback: return raw response in a structured format
    logger.error("Failed to parse analysis response as JSON (length=%d)", len(raw_response))
    return {
        "summary": raw_response[:500] if len(raw_response) > 500 else raw_response,
        "risk_score": None,
        "market_outlook": "neutral",
        "recommendations": [],
        "general_advice": [],
        "_parse_error": True,
    }

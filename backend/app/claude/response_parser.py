import json
import re


def _try_repair_json(text: str) -> dict | None:
    """Attempt to repair truncated JSON by closing open braces/brackets."""
    # Strip markdown fences
    text = re.sub(r"^```(?:json)?\s*", "", text.strip())
    text = re.sub(r"\s*```$", "", text.strip())

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
    # Try to find JSON in code blocks first (greedy .* to capture full nested object)
    json_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", raw_response, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # Try parsing the entire response as JSON
    try:
        return json.loads(raw_response)
    except json.JSONDecodeError:
        pass

    # Try to find any JSON object in the response (greedy + DOTALL for multi-line)
    json_match = re.search(r"\{.*\}", raw_response, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass

    # Try to repair truncated JSON (common when max_tokens is exceeded)
    repaired = _try_repair_json(raw_response)
    if repaired and isinstance(repaired, dict):
        repaired["_truncated"] = True
        return repaired

    # Fallback: return raw response in a structured format
    return {
        "summary": raw_response,
        "risk_score": None,
        "market_outlook": "neutral",
        "recommendations": [],
        "general_advice": [],
        "_parse_error": True,
    }

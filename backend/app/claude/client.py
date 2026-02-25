import logging
import anthropic
from app.config import get_settings
from app.claude.prompts import SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# Simple float timeout (seconds) — more reliable across SDK versions than httpx.Timeout.
# 120s is generous for 4096 max_tokens output.
_API_TIMEOUT = 120.0


def analyze_portfolio(user_message: str) -> str:
    """Send portfolio context to Claude and get analysis.

    Uses a 2-minute timeout and no retries so failures surface quickly.
    """
    settings = get_settings()

    logger.info(
        "Creating Anthropic client (model=%s, max_tokens=%d)...",
        settings.CLAUDE_MODEL,
        settings.CLAUDE_MAX_TOKENS,
    )

    client = anthropic.Anthropic(
        api_key=settings.ANTHROPIC_API_KEY,
        timeout=_API_TIMEOUT,
        max_retries=0,  # Don't retry — surface errors immediately
    )

    logger.info(
        "Sending portfolio analysis request (%d chars prompt)...",
        len(user_message),
    )

    try:
        message = client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=settings.CLAUDE_MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
    except anthropic.APITimeoutError:
        logger.error("Anthropic API timed out after %.0fs", _API_TIMEOUT)
        raise
    except anthropic.APIStatusError as e:
        logger.error("Anthropic API error: %s %s — %s", e.status_code, e.message, e.body)
        raise
    except Exception as e:
        logger.error("Unexpected error calling Anthropic API: %s", e)
        raise

    logger.info(
        "Claude response received: stop_reason=%s, input_tokens=%s, output_tokens=%s",
        message.stop_reason,
        message.usage.input_tokens if message.usage else "?",
        message.usage.output_tokens if message.usage else "?",
    )

    if message.stop_reason == "max_tokens":
        logger.warning(
            "Claude response was truncated (hit max_tokens=%d). "
            "Consider increasing CLAUDE_MAX_TOKENS.",
            settings.CLAUDE_MAX_TOKENS,
        )

    return message.content[0].text


def analyze_chart_image(
    image_base64: str, media_type: str, user_notes: str = ""
) -> str:
    """Send a chart screenshot to Claude for technical analysis using vision."""
    from app.claude.chart_prompts import CHART_ANALYSIS_SYSTEM_PROMPT

    settings = get_settings()
    client = anthropic.Anthropic(
        api_key=settings.ANTHROPIC_API_KEY,
        timeout=_API_TIMEOUT,
        max_retries=0,
    )

    content = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": image_base64,
            },
        },
        {
            "type": "text",
            "text": (
                "Analyze this TradingView chart screenshot. "
                "Identify all key levels, patterns, and provide trading suggestions. "
                "Respond ONLY with valid JSON matching the structure specified in your instructions."
                + (f"\n\nAdditional context from user: {user_notes}" if user_notes else "")
            ),
        },
    ]

    message = client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=settings.CLAUDE_MAX_TOKENS,
        system=CHART_ANALYSIS_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
    )

    if message.stop_reason == "max_tokens":
        logger.warning(
            "Claude chart analysis response was truncated (hit max_tokens=%d).",
            settings.CLAUDE_MAX_TOKENS,
        )

    return message.content[0].text


def analyze_ticker_data(ticker: str, ohlcv_text: str, user_notes: str = "") -> str:
    """Send OHLCV price data to Claude for technical analysis (no image)."""
    from app.claude.chart_prompts import TICKER_ANALYSIS_SYSTEM_PROMPT

    settings = get_settings()
    client = anthropic.Anthropic(
        api_key=settings.ANTHROPIC_API_KEY,
        timeout=_API_TIMEOUT,
        max_retries=0,
    )

    text = (
        f"Analyze the following daily OHLCV data for {ticker}. "
        "Identify all key levels, patterns, and provide trading suggestions. "
        "Respond ONLY with valid JSON matching the structure specified in your instructions.\n\n"
        f"{ohlcv_text}"
        + (f"\n\nAdditional context from user: {user_notes}" if user_notes else "")
    )

    message = client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=settings.CLAUDE_MAX_TOKENS,
        system=TICKER_ANALYSIS_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": text}],
    )

    if message.stop_reason == "max_tokens":
        logger.warning(
            "Claude ticker analysis response was truncated (hit max_tokens=%d).",
            settings.CLAUDE_MAX_TOKENS,
        )

    return message.content[0].text

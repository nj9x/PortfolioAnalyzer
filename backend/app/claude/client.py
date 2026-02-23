import logging
import anthropic
from app.config import get_settings
from app.claude.prompts import SYSTEM_PROMPT

logger = logging.getLogger(__name__)


def analyze_portfolio(user_message: str) -> str:
    """Send portfolio context to Claude and get analysis."""
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    message = client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=settings.CLAUDE_MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
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
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

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

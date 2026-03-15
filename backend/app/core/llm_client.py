"""LLM client abstraction supporting Anthropic (cloud) and OpenAI-compatible (local) APIs."""
import os
import logging
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


def get_model_name() -> str:
    """Get the model name based on configuration."""
    if settings.USE_LOCAL_LLM:
        return settings.LOCAL_LLM_MODEL
    return "claude-sonnet-4-20250514"


def generate(
    system: str,
    messages: list[dict],
    max_tokens: int = 600,
    stream: bool = False,
) -> str:
    """
    Generate a response from the configured LLM.

    Args:
        system: System prompt
        messages: List of {"role": str, "content": str} dicts
        max_tokens: Maximum tokens in response
        stream: Whether to stream (only used for Anthropic)

    Returns:
        The generated text response
    """
    if settings.USE_LOCAL_LLM:
        return _generate_openai(system, messages, max_tokens)
    else:
        return _generate_anthropic(system, messages, max_tokens, stream)


def _generate_openai(
    system: str,
    messages: list[dict],
    max_tokens: int,
) -> str:
    """Generate using OpenAI-compatible API (Docker Model Runner)."""
    from openai import OpenAI

    base_url = settings.ANTHROPIC_BASE_URL
    if not base_url:
        raise RuntimeError("Local LLM enabled but ANTHROPIC_BASE_URL not configured")

    client = OpenAI(base_url=base_url, api_key="local")

    # Build messages with system prompt
    oai_messages = [{"role": "system", "content": system}]
    for msg in messages:
        oai_messages.append({"role": msg["role"], "content": msg["content"]})

    response = client.chat.completions.create(
        model=settings.LOCAL_LLM_MODEL,
        messages=oai_messages,
        max_tokens=max_tokens,
        temperature=0.7,
    )

    return response.choices[0].message.content or ""


def _generate_anthropic(
    system: str,
    messages: list[dict],
    max_tokens: int,
    stream: bool,
) -> str:
    """Generate using Anthropic API."""
    import anthropic

    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("Anthropic API key not configured")

    # Clean up empty base URL env var
    if os.environ.get("ANTHROPIC_BASE_URL") == "":
        os.environ.pop("ANTHROPIC_BASE_URL", None)

    client_kwargs = {"api_key": settings.ANTHROPIC_API_KEY}
    if settings.ANTHROPIC_BASE_URL:
        client_kwargs["base_url"] = settings.ANTHROPIC_BASE_URL

    client = anthropic.Anthropic(**client_kwargs)
    model_name = "claude-sonnet-4-20250514"

    if stream:
        response_text = ""
        with client.messages.stream(
            model=model_name,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        ) as s:
            for chunk in s.text_stream:
                response_text += chunk
        return response_text
    else:
        message = client.messages.create(
            model=model_name,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        return message.content[0].text

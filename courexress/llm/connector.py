import json
import time
from typing import Any, Union
import httpx
from loguru import logger
from .. import config

DEFAULT_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "responses": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "question_id": {"type": "STRING"},
                    "chosen": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"}
                    },
                    "answer": {"type": "STRING"}
                },
                "required": ["question_id"]
            }
        }
    },
    "required": ["responses"]
}

FALLBACK_MODELS = ["gemini-flash-lite-latest", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-3.8-flash"]


class GeminiConnector:
    """Connects to Google Gemini API with automatic model failover and retries."""

    def __init__(self, api_key: str = None, model: str = None):
        raw_key = api_key or getattr(config, "GEMINI_API_KEY", "") or ""
        self.api_key = raw_key.strip().strip('"\'')
        self.models = [model] if model else FALLBACK_MODELS
        if not self.api_key:
            raise RuntimeError("Gemini API Key is not configured. Add 'gemini_api_key' to ~/.skip-course/config.json")

    def get_response(self, prompt: Any, system_prompt: str = None, response_schema: dict = None) -> Union[dict, str]:
        prompt_str = prompt if isinstance(prompt, str) else json.dumps(prompt, ensure_ascii=False)

        generation_config = {}
        if response_schema:
            generation_config["responseMimeType"] = "application/json"
            generation_config["responseSchema"] = response_schema

        last_error = None

        for model in self.models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
            payload = {
                "contents": [
                    {
                        "parts": [{"text": prompt_str}]
                    }
                ]
            }

            if system_prompt:
                payload["systemInstruction"] = {
                    "parts": [{"text": system_prompt}]
                }

            if generation_config:
                payload["generationConfig"] = generation_config

            for attempt in range(2):
                try:
                    with httpx.Client(timeout=30.0) as client:
                        res = client.post(url, json=payload)
                        if res.status_code == 200:
                            data = res.json()
                            candidate = data["candidates"][0]
                            text = candidate["content"]["parts"][0]["text"]

                            if response_schema:
                                try:
                                    return json.loads(text)
                                except json.JSONDecodeError:
                                    clean = text.strip()
                                    if clean.startswith("```json"):
                                        clean = clean[7:]
                                    if clean.startswith("```"):
                                        clean = clean[3:]
                                    if clean.endswith("```"):
                                        clean = clean[:-3]
                                    return json.loads(clean.strip())

                            return text.strip()

                        if res.status_code in [400, 401, 403]:
                            err_msg = (
                                f"Gemini API Authentication Failed ({res.status_code}): {res.text}. "
                                "Make sure you are using a Google AI Studio API key starting with 'AIzaSy...' "
                                "(not an OAuth token or GCP access token)."
                            )
                            logger.error(err_msg)
                            raise RuntimeError(err_msg)

                        if res.status_code in [429, 503]:
                            logger.info(f"Model {model} busy ({res.status_code}), switching to fallback model immediately...")
                            break

                        last_error = RuntimeError(f"Gemini API {res.status_code}: {res.text}")
                        break
                except (httpx.TimeoutException, httpx.NetworkError) as e:
                    last_error = e
                    logger.warning(f"Timeout on {model}, trying next option...")
                    break

        raise last_error or RuntimeError("All Gemini model attempts failed.")


class PerplexityConnector:
    """Fallback Perplexity Connector."""

    def __init__(self, api_key: str = None, model: str = "sonar"):
        self.api_key = api_key or getattr(config, "PERPLEXITY_API_KEY", "")
        self.model = model
        if not self.api_key:
            raise RuntimeError("Perplexity API Key is not configured.")

    def get_response(self, prompt: Any, system_prompt: str = None, response_schema: dict = None) -> Union[dict, str]:
        prompt_str = prompt if isinstance(prompt, str) else json.dumps(prompt, ensure_ascii=False)
        url = "https://api.perplexity.ai/chat/completions"
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt_str})

        with httpx.Client(timeout=40.0) as client:
            res = client.post(
                url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": self.model, "messages": messages}
            )
            if res.status_code != 200:
                raise RuntimeError(f"Perplexity API error: {res.text}")
            text = res.json()["choices"][0]["message"]["content"]
            if response_schema:
                return json.loads(text)
            return text

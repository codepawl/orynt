"""Rule-based AI/ML keyword and tag extraction."""

from __future__ import annotations

import re

# Curated taxonomy: tag name -> list of keyword patterns (case-insensitive)
TAXONOMY: dict[str, list[str]] = {
    "llm": [
        "llm", "large language model", "gpt", "claude", "gemini", "llama",
        "mistral", "phi-", "qwen", "deepseek", "chatgpt", "copilot",
        "chatbot", "language model",
    ],
    "computer-vision": [
        "computer vision", "image recognition", "object detection", "yolo",
        "diffusion", "stable diffusion", "midjourney", "dall-e", "sam",
        "image generation", "image segmentation",
    ],
    "nlp": [
        "nlp", "natural language", "text classification", "sentiment analysis",
        "embedding", "tokenizer", "bert", "text generation", "named entity",
    ],
    "rag": [
        "rag", "retrieval augmented", "vector database", "vector search",
        "pinecone", "chromadb", "weaviate", "qdrant", "semantic search",
    ],
    "mlops": [
        "mlops", "ml pipeline", "model deployment", "model serving",
        "mlflow", "wandb", "kubeflow", "feature store", "model registry",
    ],
    "agents": [
        "ai agent", "agent", "tool use", "function calling", "autogen",
        "crewai", "langgraph", "langchain", "llamaindex", "mcp",
        "multi-agent", "agentic",
    ],
    "training": [
        "fine-tuning", "fine tuning", "lora", "qlora", "rlhf", "dpo",
        "pretraining", "pre-training", "distillation", "training",
        "instruction tuning",
    ],
    "open-source": [
        "open source", "open-source", "hugging face", "huggingface",
        "apache 2", "mit license", "open weight",
    ],
    "research": [
        "arxiv", "paper", "research", "benchmark", "sota",
        "state of the art", "study", "survey",
    ],
    "hardware": [
        "gpu", "tpu", "nvidia", "cuda", "a100", "h100", "groq",
        "cerebras", "inference chip", "accelerator",
    ],
    "safety": [
        "ai safety", "alignment", "guardrails", "red teaming",
        "responsible ai", "jailbreak", "toxicity", "bias",
    ],
    "multimodal": [
        "multimodal", "vision language", "speech", "tts", "whisper",
        "video generation", "sora", "audio", "text-to-speech",
    ],
    "data": [
        "dataset", "data pipeline", "data engineering", "data lake",
        "data quality", "synthetic data", "annotation",
    ],
    "robotics": [
        "robotics", "robot", "embodied ai", "manipulation",
        "autonomous", "self-driving",
    ],
}

# Pre-compile patterns for performance
_COMPILED: dict[str, list[re.Pattern]] = {}
for tag, keywords in TAXONOMY.items():
    _COMPILED[tag] = [re.compile(rf"\b{re.escape(kw)}\b", re.IGNORECASE) for kw in keywords]


def extract_tags(title: str, content: str, max_tags: int = 6) -> list[str]:
    """
    Extract relevant tags from title and content.
    Title matches count 3x more than content matches.
    Returns up to max_tags sorted by relevance score.
    """
    scores: dict[str, float] = {}

    for tag, patterns in _COMPILED.items():
        score = 0.0
        for pattern in patterns:
            # Title has 3x weight
            if pattern.search(title):
                score += 3.0
            if pattern.search(content[:2000]):
                score += 1.0

        if score > 0:
            scores[tag] = score

    # Sort by score descending, take top N
    sorted_tags = sorted(scores, key=scores.get, reverse=True)
    return sorted_tags[:max_tags]


def tags_to_string(tags: list[str]) -> str:
    """Convert tag list to comma-separated string matching MDX format."""
    return ", ".join(tags)

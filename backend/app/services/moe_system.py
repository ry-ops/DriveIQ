"""Mixture of Experts (MoE) system with learning feedback loop."""
import json
import os
from datetime import datetime
from typing import Dict, List, Optional
from pathlib import Path
import anthropic
from app.core.config import settings
from app.services.query_router import QueryType, classify_query, get_expert_prompt


# Storage for learning data
FEEDBACK_DIR = Path("data/moe_feedback")
FEEDBACK_DIR.mkdir(parents=True, exist_ok=True)


class ExpertPerformance:
    """Track performance metrics for each expert."""

    def __init__(self, expert_type: QueryType):
        self.expert_type = expert_type
        self.total_queries = 0
        self.positive_feedback = 0
        self.negative_feedback = 0
        self.avg_response_time = 0.0

    @property
    def satisfaction_rate(self) -> float:
        total = self.positive_feedback + self.negative_feedback
        if total == 0:
            return 0.5
        return self.positive_feedback / total

    def to_dict(self) -> dict:
        return {
            "expert_type": self.expert_type.value,
            "total_queries": self.total_queries,
            "positive_feedback": self.positive_feedback,
            "negative_feedback": self.negative_feedback,
            "satisfaction_rate": self.satisfaction_rate,
            "avg_response_time": self.avg_response_time
        }


class MoESystem:
    """Mixture of Experts system with adaptive routing."""

    def __init__(self):
        self.experts: Dict[QueryType, ExpertPerformance] = {
            qt: ExpertPerformance(qt) for qt in QueryType
        }
        self._load_performance_data()

    def _load_performance_data(self):
        """Load saved performance data."""
        perf_file = FEEDBACK_DIR / "performance.json"
        if perf_file.exists():
            try:
                with open(perf_file) as f:
                    data = json.load(f)
                    for expert_data in data.get("experts", []):
                        expert_type = QueryType(expert_data["expert_type"])
                        self.experts[expert_type].total_queries = expert_data.get("total_queries", 0)
                        self.experts[expert_type].positive_feedback = expert_data.get("positive_feedback", 0)
                        self.experts[expert_type].negative_feedback = expert_data.get("negative_feedback", 0)
            except (json.JSONDecodeError, KeyError):
                pass

    def _save_performance_data(self):
        """Save performance data to disk."""
        data = {
            "updated_at": datetime.utcnow().isoformat(),
            "experts": [exp.to_dict() for exp in self.experts.values()]
        }
        with open(FEEDBACK_DIR / "performance.json", "w") as f:
            json.dump(data, f, indent=2)

    def route_query(self, query: str) -> QueryType:
        """Route query to best expert based on classification and performance."""
        base_type = classify_query(query)

        # For now, use direct classification
        # Future: adjust based on performance metrics
        return base_type

    def get_expert_response(self, query: str, context: str) -> dict:
        """Get response from the appropriate expert."""
        if not settings.ANTHROPIC_API_KEY:
            raise ValueError("Anthropic API key not configured")

        expert_type = self.route_query(query)
        system_prompt = get_expert_prompt(expert_type)

        # Track query
        self.experts[expert_type].total_queries += 1

        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=600,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": f"""Context from vehicle documentation:
{context}

Question: {query}"""
                }
            ]
        )

        response_id = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{expert_type.value}"

        return {
            "response_id": response_id,
            "answer": message.content[0].text,
            "expert_type": expert_type.value,
            "model": "claude-sonnet-4-20250514",
            "confidence": self.experts[expert_type].satisfaction_rate
        }

    def record_feedback(self, response_id: str, helpful: bool, comment: Optional[str] = None):
        """Record user feedback for a response."""
        # Extract expert type from response_id
        parts = response_id.split("_")
        if len(parts) < 2:
            return

        try:
            expert_type = QueryType(parts[-1])
        except ValueError:
            return

        if helpful:
            self.experts[expert_type].positive_feedback += 1
        else:
            self.experts[expert_type].negative_feedback += 1

        # Save feedback
        feedback_data = {
            "response_id": response_id,
            "expert_type": expert_type.value,
            "helpful": helpful,
            "comment": comment,
            "timestamp": datetime.utcnow().isoformat()
        }

        feedback_file = FEEDBACK_DIR / "feedback_log.jsonl"
        with open(feedback_file, "a") as f:
            f.write(json.dumps(feedback_data) + "\n")

        self._save_performance_data()

    def get_performance_stats(self) -> dict:
        """Get performance statistics for all experts."""
        return {
            "updated_at": datetime.utcnow().isoformat(),
            "experts": {
                exp_type.value: self.experts[exp_type].to_dict()
                for exp_type in QueryType
            },
            "total_queries": sum(exp.total_queries for exp in self.experts.values()),
            "total_feedback": sum(
                exp.positive_feedback + exp.negative_feedback
                for exp in self.experts.values()
            )
        }


# Global MoE instance
moe_system = MoESystem()

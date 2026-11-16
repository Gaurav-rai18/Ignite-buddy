"""
Tiny bag-of-words intent classifier (optional soft prior).

Train offline from:
  - @intent examples already registered
  - rows in nlu_feedback.jsonl that you later label

At runtime it never *overrides* a confident slot match; it only helps when
try_intents would otherwise raise NoMatch, by suggesting the most likely
intent name so the orchestrator / help text can be more specific.

Pure stdlib – no sklearn required.  Uses multinomial Naive Bayes with
add-one smoothing.
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable

_TOKEN = re.compile(r"[a-z0-9]+", re.I)


def tokenize(text: str) -> list[str]:
    return _TOKEN.findall((text or "").lower())


class BagOfWordsNB:
    def __init__(self):
        self.class_counts: Counter = Counter()
        self.token_counts: dict[str, Counter] = defaultdict(Counter)
        self.vocab: set[str] = set()
        self.n_docs = 0

    def fit(self, pairs: Iterable[tuple[str, str]]) -> "BagOfWordsNB":
        """pairs: (utterance, intent_name)"""
        for text, label in pairs:
            toks = tokenize(text)
            self.class_counts[label] += 1
            self.n_docs += 1
            for t in toks:
                self.token_counts[label][t] += 1
                self.vocab.add(t)
        return self

    def predict_proba(self, text: str) -> list[tuple[str, float]]:
        if self.n_docs == 0 or not self.class_counts:
            return []
        toks = tokenize(text)
        V = len(self.vocab) or 1
        scores = []
        for label, n_c in self.class_counts.items():
            # log P(label) + sum log P(t|label)
            log_prior = math.log(n_c / self.n_docs)
            total = sum(self.token_counts[label].values())
            log_lik = 0.0
            for t in toks:
                c = self.token_counts[label][t]
                log_lik += math.log((c + 1) / (total + V))
            scores.append((label, log_prior + log_lik))
        # softmax-ish for readability
        if not scores:
            return []
        m = max(s for _, s in scores)
        exps = [(lab, math.exp(s - m)) for lab, s in scores]
        Z = sum(e for _, e in exps) or 1.0
        return sorted(((lab, e / Z) for lab, e in exps), key=lambda x: -x[1])

    def predict(self, text: str) -> tuple[str | None, float]:
        probs = self.predict_proba(text)
        if not probs:
            return None, 0.0
        return probs[0]


# ---------------------------------------------------------------------------
# Global instance – populated from intent examples on first use
# ---------------------------------------------------------------------------
_clf: BagOfWordsNB | None = None


def _build_from_intents() -> BagOfWordsNB:
    from . import intents as intent_mod
    pairs = []
    for it in intent_mod.INTENTS:
        for ex in it.examples:
            pairs.append((ex, it.name))
        # also use trigger keywords as weak positives
        for t in it.triggers:
            # crude: strip regex metachars for bag-of-words
            rough = re.sub(r"[\\^$.|?*+()\[\]{}]", " ", t.pattern)
            pairs.append((rough, it.name))
    return BagOfWordsNB().fit(pairs)


def get_classifier() -> BagOfWordsNB:
    global _clf
    if _clf is None:
        _clf = _build_from_intents()
    return _clf


def suggest_intent(text: str, min_prob: float = 0.25) -> tuple[str | None, float]:
    """Return (intent_name, probability) or (None, 0) if below threshold."""
    label, prob = get_classifier().predict(text)
    if label and prob >= min_prob:
        return label, prob
    return None, 0.0


def retrain_from_feedback(feedback_path: str | Path | None = None, labels: dict[str, str] | None = None) -> int:
    """
    Optional: after you label some feedback rows {utterance: intent_name},
    call this to fold them into the classifier.
    Returns number of extra examples used.
    """
    global _clf
    base = _build_from_intents()
    extra = 0
    if labels:
        for utt, lab in labels.items():
            base.fit([(utt, lab)])
            extra += 1
    _clf = base
    return extra

"""Train an attributed text model and export exact TF-IDF/linear inference."""

from pathlib import Path
import hashlib
import json
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import MultinomialNB
from sklearn.dummy import DummyClassifier
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import f1_score
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    roc_auc_score,
    confusion_matrix,
    classification_report,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
)


def metrics(y, score, kind, threshold=0.5) -> dict:
    """Compute held-out classification or regression measures from real predictions."""
    if kind == "regression":
        return {
            "rows": len(y),
            "mae": float(mean_absolute_error(y, score)),
            "rmse": float(np.sqrt(mean_squared_error(y, score))),
            "r2": float(r2_score(y, score)),
        }
    predicted = np.asarray(score) >= threshold
    return {
        "rows": len(y),
        "accuracy": float(accuracy_score(y, predicted)),
        "macro_f1": float(f1_score(y, predicted, average="macro")),
        "average_precision": float(average_precision_score(y, score)),
        "roc_auc": float(roc_auc_score(y, score)),
        "confusion_matrix": confusion_matrix(y, predicted, labels=[0, 1]).tolist(),
        "classification_report": classification_report(
            y, predicted, output_dict=True, zero_division=0
        ),
    }


p = Path(__file__).resolve().parents[1]


def train() -> None:
    """Fit grouped, training-only text pipelines and export measured inference."""
    source = p / "data/yelp_labelled.txt"
    rows = [
        line.rsplit("\t", 1) for line in source.read_text().splitlines() if line.strip()
    ]
    text = pd.Series([a for (a, b) in rows])
    y = np.array([int(b) for (a, b) in rows])
    groups = text.str.lower().str.replace("\\W+", " ", regex=True).str.strip()
    (train_idx, rest) = next(
        GroupShuffleSplit(n_splits=1, train_size=0.6, random_state=42).split(
            text, groups=groups
        )
    )
    (v, t) = next(
        GroupShuffleSplit(n_splits=1, train_size=0.5, random_state=43).split(
            text.iloc[rest], groups=groups.iloc[rest]
        )
    )
    (val, test) = (rest[v], rest[t])
    vectorizer = TfidfVectorizer(
        token_pattern="[a-z]{2,}",
        ngram_range=(1, 2),
        min_df=2,
        max_features=4000,
        sublinear_tf=True,
    )
    x = vectorizer.fit_transform(text.iloc[train_idx])
    validation = vectorizer.transform(text.iloc[val])
    testing = vectorizer.transform(text.iloc[test])
    models = {
        "logistic_regression": LogisticRegression(C=3, max_iter=1000, random_state=42),
        "multinomial_naive_bayes": MultinomialNB(alpha=1),
    }
    reports = {}
    for name, model in models.items():
        model.fit(x, y[train_idx])
        reports[name] = metrics(
            y[val], model.predict_proba(validation)[:, 1], "classification"
        )
    selected = max(reports, key=lambda n: reports[n]["average_precision"])
    model = models[selected]
    scores = model.predict_proba(validation)[:, 1]
    threshold = round(
        float(
            max(
                np.linspace(0.05, 0.95, 91), key=lambda t: f1_score(y[val], scores >= t)
            )
        ),
        2,
    )
    if selected == "logistic_regression":
        coef = model.coef_[0]
        intercept = float(model.intercept_[0])
    else:
        coef = model.feature_log_prob_[1] - model.feature_log_prob_[0]
        intercept = float(model.class_log_prior_[1] - model.class_log_prior_[0])
    artifact = {
        "version": 1,
        "kind": "classification",
        "features": [
            {
                "name": "review",
                "type": "text",
                "label": "Restaurant review",
                "maxLength": 4000,
            }
        ],
        "threshold": threshold,
        "vocabulary": vectorizer.vocabulary_,
        "idf": vectorizer.idf_.tolist(),
        "coefficients": coef.tolist(),
        "intercept": intercept,
        "unit": "positive sentiment source label",
    }
    (p / "site").mkdir(exist_ok=True)
    (p / "reports").mkdir(exist_ok=True)
    payload = (
        json.dumps(artifact, separators=(",", ":"), allow_nan=False, default=int) + "\n"
    )
    (p / "site/model.json").write_text(payload)
    baseline = DummyClassifier(strategy="prior").fit(x, y[train_idx])
    score = model.predict_proba(testing)[:, 1]
    report = {
        "version": "1.0.0",
        "source_path": "data/yelp_labelled.txt",
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "source_notice": (
            "Kotzias, D. (2015). Sentiment Labelled Sentences, Yelp subse"
            "t. UCI Machine Learning Repository 331. DOI 10.24432/C57604."
            " CC BY 4.0. This replaces the absent original training TSV; "
            "legacy pickle models are preserved but not executed."
        ),
        "original_rows": len(text),
        "valid_target_rows": len(y),
        "selected_model": selected,
        "threshold": threshold,
        "split": {"train": len(train_idx), "validation": len(val), "test": len(test)},
        "split_method": (
            "Grouped normalized review text; seeds 42 and 43; not author/"
            "time-separated"
        ),
        "validation_candidates": reports,
        "test": metrics(y[test], score, "classification", threshold),
        "test_baseline": metrics(
            y[test], baseline.predict_proba(testing)[:, 1], "classification"
        ),
        "artifact_sha256": hashlib.sha256(payload.encode()).hexdigest(),
        "training_only_preprocessing": True,
    }
    for target in ["site/metrics.json", "reports/metrics.json"]:
        (p / target).write_text(json.dumps(report, indent=2) + "\n")
    (p / "site/sample.json").write_text(
        json.dumps({"review": "The meal was excellent and the staff were friendly."})
        + "\n"
    )
    fixtures = [
        {
            "record": {"review": text.iloc[idx]},
            "expected": float(
                model.predict_proba(vectorizer.transform([text.iloc[idx]]))[0, 1]
            ),
        }
        for idx in test[:30]
    ]
    (p / "reports/parity-fixtures.json").write_text(json.dumps(fixtures) + "\n")
    print(selected, report["split"], report["test"])


if __name__ == "__main__":
    train()

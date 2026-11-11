# Restaurant Review Classifier

## 1. Project overview

Classify restaurant review text as positive or negative. The repository trains and evaluates a sentiment model on labeled Yelp sentences and serves it through a browser app for individual reviews and CSV batches.

[Live demo](https://subhashdixit.github.io/restaurant-review-classifier/) · [Source repository](https://github.com/subhashdixit/restaurant-review-classifier)

![Restaurant Review Classifier main screen](docs/images/application.png)

## 2. Motivation and problem statement

### Objective

Predict positive or negative sentiment from restaurant review text and measure how reliably the classifier reproduces the source labels on held-out reviews.

### Problem statement

Given a review sentence, estimate a positive sentiment score and apply a threshold. The labeled corpus contains clear positive and negative examples. Real feedback can be mixed, sarcastic, or contain words the model has never seen.

### Motivation

Reading every review is slow when feedback arrives in batches. A first-pass classifier can help a reviewer prioritize what to read, especially if the interface shows model scores and flags limited vocabulary coverage. The repository includes reproducible training and checks that the browser scoring matches Python.

## 3. Solution and scope

Enter a single record or score a CSV. Inspect the positive-label score, adjust the decision threshold, and export results. The shipped test report uses the validation-selected threshold.

## 4. Quick start and usage

1. Read the synthetic starting review and classify it.
2. Change the wording and inspect the score. The app learns lexical associations; it does not reliably understand sarcasm or mixed intent.
3. Adjust the threshold to see how the binary decision changes. Published metrics still use the validation-selected threshold.
4. Download the sample CSV and retain the `review` header. Upload up to 500 rows / 2 MiB.
5. Download row numbers, predictions, scores and reliability warnings. Inputs are processed in the browser, not posted to a model API.

Reviews require **3–4,000 characters**, with a maximum of 1,000 recognized word tokens. Empty/nontext inputs fail clearly. If an input has no training-vocabulary overlap, the app shows an explicit **unreliable result** warning. A score is not a calibrated probability that a customer was satisfied, and this is not a current restaurant rating service.

## 5. High-level architecture

```mermaid
flowchart LR
    A["Labeled Yelp sentences"] --> B["Offline text model training"] --> C["Versioned vocabulary and weights"] --> D["Browser text scoring"]
```

## 6. End-to-end request workflow

```mermaid
sequenceDiagram
    actor Visitor
    participant UI as Application
    participant Logic as Processing layer
    Visitor->>UI: Enter review text or upload CSV
    UI->>Logic: Tokenize, vectorize, and score review text
    alt Valid input
        Logic-->>UI: Positive-label scores and decisions
        UI-->>Visitor: Render or export the result
    else Invalid input
        Logic-->>UI: Input error
        UI-->>Visitor: Show actionable feedback
    end
```

## 7. Data sources, inputs, and outputs

The original repository contains Flask code and legacy pickle objects but not its training TSV. The maintained app uses the official **Yelp subset of UCI Sentiment Labelled Sentences**: 1,000 sentences, originally 500 positive and 500 negative. This is a disclosed source/model replacement, not an invented evaluation of the missing dataset.

Attribution: Kotzias, D. (2015). [Sentiment Labelled Sentences](https://doi.org/10.24432/C57604), UCI Machine Learning Repository, **CC BY 4.0**. The curated source intentionally selected clear positive/negative examples. It has no neutral label and does not represent all real review language. Original artifacts remain available for historical comparison.

## 8. Data flow and ETL pipeline

```mermaid
flowchart LR
    A["UCI Yelp text and labels"] --> B["Group identical normalized reviews"] --> C["Create train, validation and test splits"] --> D["Fit vectorizer and classifier"] --> E["Export artifacts and parity fixtures"]
```

## 9. Low-level design and interfaces

```mermaid
flowchart LR
    A["app.js: review and batch UI"] --> B["model-worker.js: local jobs"] --> C["text-engine.js: tokenize and vectorize"] --> D["model-engine.js: classify and apply threshold"]
```

The static app validates inputs and scores them locally. It exposes a form and CSV interface.

## 10. Concepts and algorithms

**Tokenization:** lowercase text, extract ASCII letter sequences of at least two characters, then add adjacent word pairs. This explicit rule is identical in Python and JavaScript. It does not stem words or support every language. Bigram features can represent a phrase but do not guarantee correct treatment of negation.

**TF-IDF:** count a feature, use sublinear term frequency `1 + log(count)`, multiply by its training-fitted inverse document frequency, then divide the vector by its L2 norm. The vocabulary has **1154 features**, capped at 4,000 with minimum training document frequency 2. Vocabulary and IDF never fit validation/test text.

**Multinomial Naive Bayes** combines class priors and weighted feature log probabilities, assuming conditional feature independence. It is compact and useful for small text datasets, but correlated phrases violate the assumption. **Logistic regression** is the linear discriminative comparison, fitted with regularization. Both are compared using validation average precision.

Selected model: **multinomial_naive_bayes**. For binary Naive Bayes, the portable model exports `log P(feature|1) − log P(feature|0)` and the log prior ratio. Their dot product with the TF-IDF vector gives a margin; the sigmoid converts it to the same normalized binary score as sklearn. This is an exact numeric export of the selected model, not a keyword-only mock-up.

## 11. Technology choices and dependencies

| Technology | Role and rationale |
| --- | --- |
| Python and scikit-learn | Fit vocabulary, feature weights, and classifier with reproducible splits. |
| JavaScript ES modules | Apply the same text features and scoring to local input. |
| Web Worker | Handle batch scoring without blocking the page. |
| Node and GitHub Actions | Check feature/scoring parity and release contracts before publishing. |

[Dependency versions and reproducible setup](DEPENDENCIES.md)

## 12. Training, inference, and evaluation

Grouped normalized review text is split with seeds 42 and 43: **600 training / 200 validation / 200 test** rows. Grouping reduces exact-text leakage, but is not author/time-separated validation. Validation selects the model and an F1-oriented threshold of **0.43**; test labels select neither.

| Held-out test measure | Result |
|---|---:|
| Accuracy | 0.6850 |
| Macro F1 | 0.6827 |
| Positive precision | 0.6471 |
| Positive recall | 0.7857 |
| Positive F1 | 0.7097 |
| Average precision | 0.8271 |
| ROC AUC | 0.8126 |

Confusion matrix, rows actual and columns predicted: `[[60, 42], [21, 77]]`. These errors are substantial. A small curated test does not establish performance on a current review platform.

Accuracy counts all correct labels. Precision describes false-alarm risk among predicted positives; recall describes missed source positives. F1 balances them at a chosen threshold. Macro F1 weights both classes equally. Average precision measures positive-class ranking across thresholds and depends on prevalence; ROC AUC compares positive/negative ranking but does not describe one operating point. The full baseline/candidate reports and source/artifact SHA-256 are in [reports/metrics.json](reports/metrics.json).

### Reproduce training

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --require-hashes --only-binary=:all: -r requirements-training.lock.txt
python scripts/train.py
python scripts/check_release.py
python -m black --check scripts
python -m pylint scripts
npm test
```

On Windows, activate `.venv\Scripts\activate` instead. Training reads the included source file, reconstructs the split and writes `site/model.json`, `site/sample.json`, `site/metrics.json` and `reports/`. Source data is not fetched live by an end user. Review source rights, model results and hash changes before committing a retrained release.

Legacy count-vectorizer and random-forest pickle files are preserved but are not used by the new site. This release is a separately measured UCI Yelp model.

### Application checks

Ten Node tests check held-out Python/JavaScript score parity, exact unigram/bigram tokenization, L2 normalization, unknown-vocabulary warnings, schema/size bounds, thresholds, CSV edge cases and model identity. JavaScript arithmetic agrees with the sklearn pipeline within `1e-9` on the released held-out fixtures.

## 13. Limitations and data handling

No API key, remote NLP provider, analytics script or persistent review storage is used. GitHub serves normal website assets; user-entered text stays in the browser. CSV computation uses a local worker. Literal HTML is treated as text, and spreadsheet-formula prefixes are escaped in exports. Browser extensions and a shared computer remain outside the app's control.

The curated dataset covers positive and negative sentences. Sarcasm, mixed sentiment, neutral text, and changes in domain can reduce reliability.

## 14. Installation and local setup

Use Node.js **22+** for JavaScript development/checks and Python **3.10 or 3.11** for training and the simple local web server.

```bash
git clone https://github.com/subhashdixit/restaurant-review-classifier.git
cd restaurant-review-classifier
npm ci
npm test
npm run lint
npm run format
python3 -m http.server 8000 --directory site
```

Open `http://127.0.0.1:8000`. Serve over HTTP rather than opening `index.html` with `file://`, because model fetching, modules and workers need an appropriate origin. Production uses HTTPS on Pages. No API key, Docker container or backend account is needed to use this browser app.

## 15. Repository structure

```text
site/index.html          accessible HTML interface
site/style.css           responsive local styling
site/app.js              form, results, plots and batch orchestration
site/text-engine.js      TF-IDF, binary scoring and text validation
site/model-engine.js     shared safe CSV helpers
site/model-worker.js     bounded local batch work
site/model.json          frozen numeric model; no executable pickle
site/metrics.json        evaluation and source/artifact hashes
site/project.json        purpose, limitations and view configuration
scripts/train.py         reproducible project-specific source adapter/training
scripts/check_release.py source/model identity checks
tests/model.test.js      real-model parity, validation, CSV and metadata checks
reports/                 full metrics and held-out parity fixtures
docs/text-contract.md    tokenization, review schema and limits
archive/                 preserved previous documentation
.github/workflows/       test and GitHub Pages release pipeline
```

## 16. Deployment and operations

```mermaid
flowchart LR
    A["GitHub main"] --> B["GitHub Actions checks"] --> C["Publish site directory"] --> D["GitHub Pages"]
```

```mermaid
flowchart LR
 A[Feature branch and PR] --> B[Black + Pylint + ESLint + Prettier]
 B --> C[Source hashes + Node behavior/parity tests]
 C --> D[Review and merge main]
 D --> E[Repeat checks; upload only site folder]
 E --> F[GitHub Pages HTTPS deployment]
 F --> G[Check form, CSV and published model identity]
```

**CI** repeats code and behavior checks for changes, including a real Python/JavaScript model comparison. It catches regressions and packaging mistakes; it does not certify the statistical validity of the dataset. **CD** publishes the checked static artifact from `main`. PRs run checks without publishing. Actions are pinned to reviewed commit hashes, and only the deployment job gets Pages publishing permissions.

Enable **Settings → Pages → Source → GitHub Actions**. The workflow `.github/workflows/pages.yml` builds/tests and uploads `site/`; it does not publish legacy datasets, Python environments or reports as website assets. The repository About/README link points to the verified live app after rollout.

**Hosting** supplies the public asset server; **deployment** replaces its files with a particular revision. GitHub Pages needs no server process, paid inference quota or container here. Docker can be useful for a Python training environment, but is unnecessary for serving these static browser files.

**Versioning:** Git records code, configuration, model weights and evaluation together. Tag known-good releases. Update preprocessing and the exported model as one reviewed change. The model's schema version and report hashes identify the inference contract.

**Rollback:** revert a faulty change through a PR and let the same workflow publish the previous compatible artifacts. Restore model, schema and metrics together, then repeat a synthetic form/CSV check. Deleting a review branch does not delete its merged changes. Main is the maintained branch, with merged branches removed automatically.

**Retraining versus redeployment:** retraining changes learned parameters and needs a new evaluation review; redeploying unchanged files does not create a new model. Useful future work includes time-separated validation, subgroup/coverage analysis, better source documentation and calibrated uncertainty. Those are not claimed as completed.

References: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [scikit-learn evaluation](https://scikit-learn.org/stable/modules/model_evaluation.html), [common leakage pitfalls](https://scikit-learn.org/stable/common_pitfalls.html).

## 17. License, credits, and support

Project by **Subhash Dixit**. The repository has no standalone code license file. Dataset and dependency terms are described separately where applicable. Report bugs or documentation issues with synthetic reproduction inputs.

[GitHub Issues](https://github.com/subhashdixit/restaurant-review-classifier/issues)

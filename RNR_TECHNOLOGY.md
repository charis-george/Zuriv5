# RNR (Remitted Neural Relay) — Technology Reference

This document describes **Remitted Neural Relay (RNR)** as implemented in the Allure Security backend: what it is, why it exists, how the code is organized, how data flows through the system, and how to use it in development and operations.

---

## Table of Contents

1. [Overview](#overview)
2. [Purpose and Design Goals](#purpose-and-design-goals)
3. [How RNR Fits in Allure](#how-rnr-fits-in-allure)
4. [Architecture](#architecture)
5. [Project Structure](#project-structure)
6. [Core Components](#core-components)
7. [Memory Format (`rnr_memory.json`)](#memory-format-rnr_memoryjson)
8. [End-to-End Flow](#end-to-end-flow)
9. [Thresholds and Scoring Logic](#thresholds-and-scoring-logic)
10. [Feature Vectors](#feature-vectors)
11. [REST API](#rest-api)
12. [Configuration and Feature Flags](#configuration-and-feature-flags)
13. [How to Use RNR](#how-to-use-rnr)
14. [Frontend Integration](#frontend-integration)
15. [Legacy vs Production Implementation](#legacy-vs-production-implementation)
16. [Operational Notes](#operational-notes)
17. [Limitations and Future Considerations](#limitations-and-future-considerations)

---

## Overview

**RNR (Remitted Neural Relay)** is Allure’s **adaptive pattern memory** layer. It sits alongside the primary ML threat detector and:

1. **Remits** (stores) feature vectors from events where the model was uncertain or wrong (high loss / low confidence).
2. **Correlates** new incoming events against that memory using **cosine similarity**.
3. **Reinforces** detections when a new event closely matches a previously “difficult” pattern.

RNR is labeled a **flagship MVP feature** in `mvp_config.py` and is integrated into the main threat pipeline (`POST /simulate`) as well as a dedicated admin API under `/api/v1/rnr/*`.

Conceptually, RNR is **not a second ML model**. It is a **lightweight, file-backed similarity index** that gives the system a form of **short-term experiential memory** for edge cases the classifier struggled with.

---

## Purpose and Design Goals

| Goal | How RNR addresses it |
|------|----------------------|
| **Handle ambiguous threats** | Store vectors when `loss > 0.35` or `confidence < 0.55` |
| **Recognize recurring unknown patterns** | Match new features to stored patterns at similarity ≥ 0.92 |
| **Improve decisions without immediate retraining** | Boost `confidence` (+0.15) and `risk_score` (+0.10) on match |
| **Support human and automated review** | Expose patterns via REST API for inspection, stats, and manual store/match |
| **Complement self-retraining** | Patterns highlight what the model got wrong; labels + retrain improve the model long-term |

RNR is especially useful for:

- **Zero-day or novel attack shapes** that repeatedly look similar in feature space but score low on the first encounter.
- **Borderline events** where the model’s softmax confidence sits in a gray zone.
- **Operational feedback loops** where analysts want to see what the system has “learned” from hard examples before the next training cycle.

---

## How RNR Fits in Allure

At a high level, Allure’s MVP threat pipeline is:

```
Threat Event
    → Feature Extraction (FeatureExtractor)
    → ML Prediction (ModelLoader or TextModelLoader)
    → RNR Store / Match (RNRManager)
    → ALL-T / personalization / WAF / storage (optional layers)
    → Response + MongoDB persistence
```

RNR runs **after** the ML prediction and **before** advanced AI layers (behavioral baselines, cross-signal correlation, etc.) in `allure_main.py`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Application                          │
│                      (allure_main.py)                            │
├─────────────────────────────────────────────────────────────────┤
│  POST /simulate                                                  │
│    1. FeatureExtractor.extract(event)  →  np.ndarray (45-dim)  │
│    2. model_loader.predict(features, return_loss=True)           │
│    3. RNR STEP 1: store if loss>0.35 OR confidence<0.55         │
│    4. RNR STEP 2: match_pattern → boost scores if hit            │
├─────────────────────────────────────────────────────────────────┤
│  RNRManager (rnr_manager.py)          ← singleton: rnr = ...()   │
│    • store_pattern(features, loss)                               │
│    • match_pattern(features, threshold=0.92)                     │
│    • persists to rnr_memory.json                                 │
├─────────────────────────────────────────────────────────────────┤
│  API Router (API/RNR/routes.py)       prefix: /api/v1/rnr       │
│    • Admin-authenticated CRUD + stats on same RNRManager         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Legacy path (threat_detection.py) — CLI / training scripts      │
│    RemittedNeuralRelay + ThreatDetector wrapper                  │
│    Same file: rnr_memory.json (older entry format possible)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

| Path | Role |
|------|------|
| `rnr_manager.py` | **Production** RNR implementation (`RNRManager`) |
| `rnr_memory.json` | Persistent pattern store (JSON on disk) |
| `API/RNR/routes.py` | FastAPI routes for admin operations |
| `API/RNR/__init__.py` | Exports `router` for app inclusion |
| `allure_main.py` | Instantiates `RNRManager`, wires router, runs RNR in `/simulate` |
| `allure_utils.py` | `FeatureExtractor` — builds vectors RNR stores/matches |
| `allure_model_loader.py` | Computes `loss` when `return_loss=True` |
| `threat_detection.py` | **Legacy** `RemittedNeuralRelay` + `ThreatDetector` for TensorFlow CLI |
| `mvp_config.py` | Feature flag `"RNR": True` in MVP mode |

---

## Core Components

### 1. `RNRManager` (`rnr_manager.py`)

The active production class used by the API and main app.

```python
class RNRManager:
    def __init__(self): ...           # Load/create rnr_memory.json
    def store_pattern(self, features, loss): ...
    def match_pattern(self, features, threshold=0.92): ...
    def _save(self): ...              # Write memory to disk
```

**Initialization behavior:**

- If `rnr_memory.json` is missing, creates `{"patterns": []}`.
- Migrates **legacy list format** to `{"patterns": [...]}` automatically.
- Resets to empty patterns if JSON is invalid.

**`store_pattern`**

- Appends `{ features, loss, stored_at }` to `memory["patterns"]`.
- `stored_at` is UTC ISO timestamp.

**`match_pattern`**

- Iterates all patterns; skips invalid entries.
- Uses `sklearn.metrics.pairwise.cosine_similarity` between input and each stored vector.
- Returns the **best** pattern with similarity ≥ `threshold` (default **0.92**), or `None`.

### 2. `RemittedNeuralRelay` (`threat_detection.py`)

Older implementation used by the TensorFlow training CLI and `ThreatDetector` wrapper.

| Method | Behavior |
|--------|----------|
| `remit(features, confidence)` | Stores `{ features, confidence }` (no `loss` field) |
| `correlate(features, threshold=0.92)` | Manual cosine similarity; returns max similarity or `0.0` |
| `load_memory` / `save_memory` | Reads/writes JSON (list or dict format) |

### 3. `ThreatDetector` (`threat_detection.py`)

Legacy wrapper around a Keras model + `RemittedNeuralRelay`:

- If confidence is between **0.40 and 0.65**, calls `remit()`.
- Always calls `correlate()`; if correlation &gt; 0, boosts predicted class probability by `0.15 * correlation`.

### 4. `API/RNR/routes.py`

FastAPI router mounted at **`/api/v1/rnr`**. Uses the same global `RNRManager` instance injected at startup via `set_rnr_dependencies(rnr, admin_manager, db)`.

---

## Memory Format (`rnr_memory.json`)

**Current canonical format:**

```json
{
  "patterns": [
    {
      "features": [0.18, 0.45, ...],
      "loss": 0.7288889288902283,
      "stored_at": "2026-01-29T15:56:54.652055"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `features` | `float[]` | Feature vector from `FeatureExtractor` (typically 45 dimensions) |
| `loss` | `float` | Model loss at store time (see [Loss calculation](#loss-calculation)) |
| `stored_at` | `string` | UTC ISO-8601 timestamp |

**Legacy entries** (from `RemittedNeuralRelay`) may use `confidence` instead of `loss` and omit `stored_at`. `RNRManager.match_pattern` still works if `features` is present; API list/stats endpoints may show `loss: 0.0` for those rows.

**Important:** Feature dimension should be **consistent** across patterns. The loader pads/truncates features for the **ML model**, but RNR similarity is computed on **raw stored vectors** — mismatched lengths can cause entries to be skipped or produce weak matches.

---

## End-to-End Flow

### A. Automatic flow (`POST /simulate` in `allure_main.py`)

```
1. Client sends ThreatEvent (url, body, headers, IP, etc.)

2. Feature extraction
   ├─ Text model path: predict text → approximate raw_loss = 1.0 - confidence
   │                  → still extract features for RNR
   └─ Feature model path: extract features → predict(..., return_loss=True)

3. RNR STEP 1 — Store (learning / remit)
   IF raw_loss > 0.35 OR confidence < 0.55:
       rnr.store_pattern(features_list, raw_loss)

4. RNR STEP 2 — Match (correlation / reinforce)
   match = rnr.match_pattern(features_list)   # default threshold 0.92
   IF match:
       confidence = min(1.0, confidence + 0.15)
       risk_score   = min(1.0, risk_score + 0.10)
       threat_type  = "{threat_type} (RNR-reinforced)"

5. Continue pipeline (behavioral AI, WAF, DB save, WebSocket, etc.)
```

### B. Admin API flow

```
Admin (X-Admin-Token) → /api/v1/rnr/patterns/store | match | list | stats
                      → Same RNRManager + rnr_memory.json
```

### C. Legacy CLI flow (`python threat_detection.py`)

```
Train/load Keras model → RemittedNeuralRelay → ThreatDetector.predict()
                      → remit on borderline confidence → correlate → boost
```

---

## Thresholds and Scoring Logic

### Storage trigger (production pipeline)

| Condition | Action |
|-----------|--------|
| `raw_loss > 0.35` | Store pattern |
| `confidence < 0.55` | Store pattern |

Either condition is sufficient (logical **OR**).

### Match trigger

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `threshold` | `0.92` | Minimum cosine similarity to count as a match |

### Reinforcement on match

| Metric | Adjustment |
|--------|------------|
| `confidence` | `+0.15` (capped at 1.0) |
| `risk_score` | `+0.10` (capped at 1.0) |
| `threat_type` | Suffix ` (RNR-reinforced)` |

### Loss calculation

**Feature-based model** (`allure_model_loader.py`, `return_loss=True`):

```text
expected = 1.0 if risk_score > 0.5 else 0.0
loss     = abs(risk_score - expected)
```

High loss means the model’s risk score disagrees with a binary “malicious vs benign” expectation — a proxy for **prediction uncertainty / error**.

**Text-based model** path:

```text
raw_loss = 1.0 - confidence   # approximate loss from confidence only
```

### Legacy `ThreatDetector` storage

Stores when **0.40 &lt; confidence &lt; 0.65** (borderline band), using `confidence` not `loss`.

---

## Feature Vectors

RNR does not define its own features. It uses output from **`FeatureExtractor`** in `allure_utils.py`:

| Source | Examples of derived signals |
|--------|----------------------------|
| URL | Length, query params, SQLi/XSS/phishing pattern counts |
| Request body | Pattern matches, entropy-style metrics |
| User-Agent | Known scanner/tool strings |
| Headers | Suspicious header flags |
| Temporal | Time-based features from event timestamp |

The extractor targets **45 features** (see `get_feature_names()` in `allure_utils.py`). Vectors are `np.float32` arrays validated for NaN/Inf before model inference.

---

## REST API

Base path: **`/api/v1/rnr`**

All mutating/list endpoints require **`X-Admin-Token`** with appropriate role (via `AdminManager`).

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `POST` | `/patterns/store` | ADMIN | Manually store `{ features, loss, metadata? }` |
| `POST` | `/patterns/match` | ADMIN | Match features; optional `threshold` (default 0.92) |
| `GET` | `/patterns` | ADMIN | Paginated list (`limit`, `offset`) |
| `GET` | `/patterns/stats` | VIEWER | Count, avg/min/max loss, feature dimension |
| `GET` | `/status` | VIEWER | `enabled`, `pattern_count`, `memory_size` (bytes) |
| `DELETE` | `/patterns/clear` | ADMIN | Wipe all patterns (irreversible) |

### Example: store a pattern

```bash
curl -X POST "http://localhost:8000/api/v1/rnr/patterns/store" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  -d '{
    "features": [0.1, 0.2, 0.0],
    "loss": 0.72
  }'
```

### Example: match a pattern

```bash
curl -X POST "http://localhost:8000/api/v1/rnr/patterns/match" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  -d '{
    "features": [0.1, 0.2, 0.0],
    "threshold": 0.92
  }'
```

### Example: status

```bash
curl "http://localhost:8000/api/v1/rnr/status" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN"
```

### Health check (RNR flag)

```bash
curl "http://localhost:8000/health"
```

Response includes `"rnr_enabled": true` when the MVP feature flag is on (see `mvp_config.py`). This reflects **product configuration**, not whether a single request skipped RNR logic.

---

## Configuration and Feature Flags

**`mvp_config.py`:**

```python
MVP_FEATURES = {
    "RNR": True,  # Flagship feature
    ...
}
```

```python
is_feature_enabled("RNR")  # Used in /health
```

**Environment:** No dedicated `RNR_ENABLED` env var today. RNR storage/matching in `/simulate` runs whenever the backend processes an event with extractable features.

**Persistence file:** `RNR_FILE = "rnr_memory.json"` (relative to process working directory — typically `Allure-CE-Backend/` when starting uvicorn from that folder).

---

## How to Use RNR

### 1. Normal operation (recommended)

1. Start the backend: `uvicorn allure_main:app --reload`
2. Send threats to `POST /simulate`
3. RNR automatically stores hard examples and reinforces repeats
4. Inspect memory via `GET /api/v1/rnr/patterns` or `GET /api/v1/rnr/patterns/stats`
5. Label events and run retraining so the **primary model** improves; RNR handles the gap until retrain completes

### 2. Programmatic use (Python)

```python
from rnr_manager import RNRManager

rnr = RNRManager()
rnr.store_pattern(features=[...], loss=0.65)
match = rnr.match_pattern(features=[...], threshold=0.92)
if match:
    print("Reinforced:", match["loss"], match["stored_at"])
```

### 3. Manual seeding for red-team / QA

Use `POST /api/v1/rnr/patterns/store` with feature vectors from a known attack sample (extract via `FeatureExtractor.extract(event_dict)` in a script or from logged threat metadata).

### 4. Legacy TensorFlow workflow

```bash
python threat_detection.py --text-dir ./data --input-dim 45
```

Uses `RemittedNeuralRelay` + `ThreatDetector` with the same `rnr_memory.json` file — be aware of **format mixing** (confidence-based vs loss-based entries).

### 5. Clearing memory

```bash
curl -X DELETE "http://localhost:8000/api/v1/rnr/patterns/clear" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN"
```

Or delete/reset `rnr_memory.json` while the server is stopped:

```json
{ "patterns": [] }
```

---

## Frontend Integration

`ALLURE_FRONTEND_REQUIREMENTS.md` specifies UI for RNR-matched threats:

- **Analysis tab:** “RNR Correlation” section when matched
- **Indicator:** `RNR-Reinforced` on threat type
- **Details:** correlation / match metadata when available

The API response from `/simulate` surfaces reinforcement via:

- `threat_type` containing ` (RNR-reinforced)`
- Elevated `confidence` and `risk_score`

Frontend should key off the threat type suffix or dedicated fields if added later.

---

## Legacy vs Production Implementation

| Aspect | `RNRManager` (production) | `RemittedNeuralRelay` (legacy) |
|--------|---------------------------|--------------------------------|
| **Used by** | `allure_main.py`, `/api/v1/rnr/*` | `threat_detection.py` CLI |
| **Store key** | `loss` | `confidence` |
| **Store rule** | `loss > 0.35` OR `confidence < 0.55` | `0.40 < confidence < 0.65` |
| **Similarity** | scikit-learn `cosine_similarity` | NumPy manual cosine |
| **Memory shape** | `{"patterns": [...]}` | List or dict (auto-migrated) |
| **Match return** | Full pattern dict or `None` | Float correlation score |
| **Reinforcement** | In `allure_main` (+0.15 / +0.10) | Inside `ThreatDetector.predict` |

Both write to **`rnr_memory.json`**. Prefer **`RNRManager`** for all new integrations.

---

## Operational Notes

### Startup wiring

1. **Module load:** `rnr = RNRManager()` in `allure_main.py`
2. **Router:** `app.include_router(rnr_router)` if import succeeds
3. **Startup event:** `set_rnr_dependencies(rnr, admin_manager, db)`

If `API.RNR.routes` fails to import, admin endpoints are unavailable but the singleton `rnr` in `/simulate` may still work.

### Concurrency

`RNRManager` reads/writes the JSON file synchronously on each store. Under high traffic, consider:

- File locking or a move to MongoDB/Redis for pattern storage
- Batching writes

### Security

- RNR API routes require **admin authentication**
- Pattern data can encode attack payloads (feature summaries) — treat `rnr_memory.json` as **sensitive**

### Monitoring

- `GET /api/v1/rnr/status` — pattern count and memory size
- `GET /api/v1/rnr/patterns/stats` — loss distribution
- `/health` — `rnr_enabled` flag

---

## Limitations and Future Considerations

1. **File-backed only** — No clustering, eviction, or TTL; memory grows unbounded until cleared.
2. **No runtime disable** — Feature flag is informational; `/simulate` always runs RNR steps today.
3. **Mixed vector lengths** — Old and new patterns with different `len(features)` weaken matching.
4. **Mixed schema** — Legacy `confidence` entries coexist with `loss` entries.
5. **Global memory** — Not per-tenant or per-user; personalization is handled elsewhere (ALL-T).
6. **Similarity metric** — Cosine similarity on hand-crafted features may false-positive on structurally similar benign traffic.
7. **Text model path** — Loss is approximated as `1 - confidence`, which is coarser than feature-model loss.

Reasonable enhancements: MongoDB collection for patterns, max pattern cap with LRU, metadata (event_id, threat_type), dedicated `rnr_match` fields in API responses, and gating store/match behind `is_feature_enabled("RNR")`.

---

## Quick Reference

| Item | Value |
|------|-------|
| **Full name** | Remitted Neural Relay |
| **Primary class** | `RNRManager` |
| **Memory file** | `rnr_memory.json` |
| **Store if** | `loss > 0.35` OR `confidence < 0.55` |
| **Match if** | cosine similarity ≥ `0.92` |
| **Boost on match** | confidence +0.15, risk +0.10 |
| **API prefix** | `/api/v1/rnr` |
| **MVP flag** | `MVP_FEATURES["RNR"] = True` |

---

## Related Documentation

- `MVP_README.md` — MVP feature list and RNR API summary
- `ALLURE_FRONTEND_REQUIREMENTS.md` — UI requirements for RNR-reinforced threats
- `PRODUCTION_ARCHITECTURE.md` — RNR in production architecture context
- `allure_readme.md` — General backend setup and threat detection

---

*Document generated for the Allure Security codebase. Reflects implementation as of the current repository state.*

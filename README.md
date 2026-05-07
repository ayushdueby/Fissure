# Fissure: AI-Powered Git Engine Built From Scratch

A production-grade version control system implemented entirely from first principles in Java and Spring Boot. This is not a wrapper around Git. Not a library. Not a tutorial project. Every component — the object store, commit graph, diff algorithm, merge engine, and AI semantic layer — is built from scratch.

On top of the core engine sits a suite of AI-powered features that do not exist in any version control system today: a semantic diff layer that understands the intent behind code changes, a conflict prophet that predicts merge conflicts before they happen, and a commit intent classifier that tells you why a change was made even when the commit message says nothing useful.

---

## Why This Exists

Every developer uses Git. Almost nobody understands what happens underneath. This project is an answer to that gap — and an attempt to push beyond what existing tools offer.

The insight that drives the AI layer is simple: Myers algorithm, which powers `git diff` in production Git, is optimal at finding the shortest edit script between two files. But shortest edit distance is not the same as most meaningful diff. A rename and a bugfix in the same commit look identical to Myers — two lines deleted, two lines added. They are not the same thing. One is low risk. One is high risk. A senior engineer reading the diff knows the difference immediately. The semantic layer automates that judgment.

The Conflict Prophet goes further. Every existing tool — GitHub, GitLab, Bitbucket — tells you about merge conflicts at merge time, when it is already too late to avoid the work. This engine watches two branches diverge over time and predicts collision probability per file before the conflict exists, giving teams time to coordinate before damage is done.

---

## Architecture

```
REST API Layer (Spring Boot Controllers)
                    |
    +---------------+---------------+------------------+
    |               |               |                  |
Object Store    Commit DAG      Ref Manager      AI Layer
(SHA-256)       (Multi-parent)  (HEAD/branches)  (Gemini)
    |               |               |                  |
    +---------------+---------------+                  |
                    |                                  |
         +----------+----------+                       |
         |                     |                       |
    Diff Engine           Merge Engine                 |
    (Myers + BT)          (3-way merge)                |
         |                     |                       |
         +----------+----------+-----------------------+
                    |
              Storage Layer
         (.git folder simulation)
```

Each layer has a single responsibility. The AI layer consumes the output of existing components — it does not replace them. The diff engine produces `List<DiffLine>`. The semantic layer receives that list and reasons about it. The conflict prophet consumes the DAG and diff engine together. Nothing is duplicated.

---

## Core Engine

### Object Store

The foundation of the system. Every piece of data is stored as an object identified by the SHA-256 hash of its serialized content.

This is content-addressable storage. The same content always produces the same SHA. Two files with identical content are stored exactly once regardless of how many commits reference them. This is how Git achieves deduplication across an entire repository history.

Three object types:

**Blob** — raw file content with no filename. The filename lives in the tree that references the blob. Renaming a file without changing its content produces no new blob.

**Tree** — a directory snapshot. A map of filenames to blob SHAs. Every file modification produces a new blob and a new tree. The old versions are preserved permanently.

**Commit** — a point in time. Holds a pointer to a tree, pointers to one or more parent commits, and metadata. The SHA of a commit is computed from all of its contents — you cannot alter a commit without changing its SHA and invalidating everything that references it.

### Commit DAG

Commit history is a directed acyclic graph. Each node is a commit. Each edge points from child to parent. The graph supports multiple parents per commit, which is what makes merge commits representable.

Key operations:

`getHistory(sha)` — iterative depth-first traversal from a commit backwards through parent pointers. Returns the full ancestor chain newest-first.

`findLCA(sha1, sha2)` — lowest common ancestor of two commits. Collects all ancestors of sha1 into a hash set, then walks sha2's ancestors until finding one present in the set. The first match is the merge base.

`isAncestor(candidate, ofSha)` — determines whether one commit is reachable from another by traversal. Used for fast-forward merge detection.

### Myers Diff Algorithm

Myers algorithm finds the shortest edit script between two sequences of lines. It models the problem as pathfinding on a two-dimensional edit graph: moving right is a deletion, moving down is an insertion, moving diagonally is a match.

The algorithm searches in order of edit distance using a one-dimensional array indexed by diagonal number `k = x - y` to track the furthest-reaching point on each diagonal. Snapshots of this array are saved at each edit distance level. Backtracking reads those snapshots in reverse to reconstruct which moves were made, producing the final sequence of ADDED, DELETED, and UNCHANGED line annotations.

Time complexity is O(ND) where N is the total length of both files and D is the number of edits. For typical code changes where D is small relative to N, this is effectively linear.

### 3-Way Merge Engine

Three versions of a file are involved in every merge: the base (common ancestor), ours (current branch), and theirs (branch being merged). The engine diffs base against ours and base against theirs separately, then walks through base applying both change sets.

When only one side changed a line relative to base, the change is applied automatically. When both sides changed the same line, a conflict is recorded. Conflict output uses standard Git conflict marker format.

Fast-forward detection uses `isAncestor()` to check whether the current branch is a direct ancestor of the target. If so, the branch pointer advances without a merge commit.

When no conflicts exist, a merge commit is created automatically with two parent SHAs — using the multi-parent DAG support built in the commit layer.

### Ref Manager

Refs are named pointers to commit SHAs. HEAD is a special ref that points to a branch name rather than directly to a SHA. This indirection means HEAD moves forward implicitly with every commit on the current branch. Detached HEAD occurs when HEAD stores a raw SHA instead of a branch name.

---

## AI Layer

### Semantic Diff Engine

The semantic diff engine sits directly on top of Myers. It takes the `List<DiffLine>` output from the diff engine, serializes it into a structured context, and sends it to an AI model with a prompt that asks for semantic analysis.

The output goes beyond what line-level analysis can produce:

**Change classification** — every diff is classified as REFACTOR, BUGFIX, FEATURE, RENAME, or CLEANUP. This is inferred from the actual code changes, not from the commit message.

**Semantic grouping** — related lines are clustered together under a human-readable explanation. A commit that renames a function, adds a null check, and removes an unused import produces three semantic groups, not a flat list of eighteen changed lines. Each group is explained independently with its own risk assessment.

**Risk level** — the diff is assigned LOW, MEDIUM, or HIGH risk with a specific reason. A pure rename is LOW. A change to error handling in a payment flow is HIGH. This is computed from the nature of the changes, not from a rule engine.

**PR quality signals** — structural problems are surfaced automatically. A PR that spans too many unrelated concerns is flagged for splitting. A logic change with no corresponding test change is noted. A public API modification without a version bump is called out.

**Improved commit message** — when the original commit message is vague or missing, a better one is generated from the actual diff content.

This is what a senior engineer does in code review. The semantic layer automates it.

### Conflict Prophet

Every existing version control tool detects conflicts at merge time. This engine detects them before they exist.

The prophet works in two stages.

**Stage 1 — Divergence Analysis (pure DSA)**

`analyzeDivergence(branch1, branch2)` finds the LCA of the two branches, collects all commits unique to each branch since divergence, builds frequency maps of which files each branch has touched, and finds the intersection. Files touched by both branches since divergence are collision candidates. Files touched many times by both branches are high-risk candidates.

This stage produces a `DivergenceReport` with per-file collision risk data including touch counts and the specific commits responsible.

**Stage 2 — AI Collision Scoring**

For each high-risk file, the actual diffs from both branches since the LCA are collected and sent to AI together. The model evaluates whether the changes conflict at the semantic level — not just whether lines overlap, but whether the intent of the two change sets is compatible.

The output is a `ProphecyReport` containing overall conflict probability, per-file prophecies with conflicting region estimates and suggestions, and a recommendation of MERGE NOW, COORDINATE, or DANGER.

**Trajectory Analysis**

Beyond point-in-time analysis, the prophet tracks how conflict probability has grown commit by commit since divergence. A slow-growing trajectory looks different from an accelerating one, and teams should respond differently to each.

### Commit Intent Predictor

Commit messages are unreliable. "fix", "update", "changes" — these tell you nothing. The intent predictor analyzes the actual diff, the files changed, the author's recent commit history, and the timestamp to classify what a commit actually did and why.

Output per commit:

- Intent classification: BUGFIX / FEATURE / REFACTOR / PERFORMANCE / SECURITY / CLEANUP / HOTFIX
- Confidence score
- One-sentence reasoning
- Risk level
- Suggested commit message if the original is vague

Batch analysis runs intent prediction across the last N commits on a branch, revealing the pattern of work — how much of recent activity is bug fixing versus feature work versus cleanup.

---

## API Reference

### Repository


| Method | Endpoint      | Description                            |
| ------ | ------------- | -------------------------------------- |
| POST   | `/git/init`   | Initialize repository                  |
| GET    | `/git/status` | Current branch, staged files, HEAD SHA |


### Files


| Method | Endpoint                                    | Description                 |
| ------ | ------------------------------------------- | --------------------------- |
| POST   | `/git/add?path={file}`                      | Stage file (body = content) |
| POST   | `/git/commit?message={msg}&author={author}` | Commit staged files         |


### History


| Method | Endpoint         | Description                              |
| ------ | ---------------- | ---------------------------------------- |
| GET    | `/git/log`       | Commit history of current branch         |
| GET    | `/git/log/graph` | All commits across all branches as graph |


### Branching


| Method | Endpoint                        | Description                   |
| ------ | ------------------------------- | ----------------------------- |
| POST   | `/git/branch?name={name}`       | Create branch at current HEAD |
| GET    | `/git/branch`                   | List all branches             |
| DELETE | `/git/branch?name={name}`       | Delete branch                 |
| POST   | `/git/checkout?target={branch}` | Switch branch or checkout SHA |


### Diff


| Method | Endpoint                                    | Description                    |
| ------ | ------------------------------------------- | ------------------------------ |
| GET    | `/git/diff?sha1={s1}&sha2={s2}&file={f}`    | Myers diff between two commits |
| GET    | `/git/diff/working?file={f}&newContent={c}` | Diff working content vs HEAD   |


### Merge


| Method | Endpoint                           | Description                       |
| ------ | ---------------------------------- | --------------------------------- |
| POST   | `/git/merge?branch={name}`         | Merge branch into current         |
| GET    | `/git/merge/preview?branch={name}` | Preview conflicts without merging |


### AI


| Method | Endpoint                                               | Description                        |
| ------ | ------------------------------------------------------ | ---------------------------------- |
| GET    | `/git/ai/diff?sha1={s1}&sha2={s2}&file={f}`            | Semantic diff with intent analysis |
| GET    | `/git/ai/intent?sha={sha}`                             | Commit intent prediction           |
| GET    | `/git/ai/intent/batch?branch={b}&limit={n}`            | Batch intent across N commits      |
| GET    | `/git/ai/prophet?branch1={b1}&branch2={b2}`            | Full conflict prophecy             |
| GET    | `/git/ai/prophet/trajectory?branch1={b1}&branch2={b2}` | Conflict probability over time     |
| GET    | `/git/ai/prophet/quick?branch1={b1}&branch2={b2}`      | Fast conflict probability score    |


---

## Data Structures and Algorithms


| Algorithm / Structure    | Used In                                                |
| ------------------------ | ------------------------------------------------------ |
| SHA-256 hashing          | Object store — every object identified by content hash |
| HashMap                  | Object store lookup, ref manager, staging index        |
| Directed Acyclic Graph   | Commit history with multi-parent support               |
| Depth-first traversal    | `getHistory()`, ancestor collection                    |
| HashSet ancestor lookup  | `findLCA()` — O(n) LCA on DAG                          |
| Myers diff — O(ND)       | Line-level diff between any two file versions          |
| Snapshot backtracking    | Reconstructing edit script from Myers forward pass     |
| 3-way merge              | Applying two change sets to a common base              |
| Set intersection         | Finding files touched by both branches                 |
| Frequency map            | Ranking collision risk by touch count                  |
| Time series over commits | Conflict trajectory analysis                           |


---

## Getting Started

### Prerequisites

- Java 17 or higher
- Maven
- Gemini API key

### Configuration

Add to `src/main/resources/application.properties`:

```
gemini.api.key=your_key_here
```

### Run

```bash
mvn spring-boot:run
```

Server starts on port 8080.

### Quick Demo

```bash
# Initialize
curl -X POST http://localhost:8080/git/init

# Stage and commit
curl -X POST "http://localhost:8080/git/add?path=Main.java" \
     -d "public class Main { void process() { return; } }"
curl -X POST "http://localhost:8080/git/commit?message=initial&author=dev"

# Create feature branch
curl -X POST "http://localhost:8080/git/branch?name=feature"
curl -X POST "http://localhost:8080/git/checkout?target=feature"

# Make a change on feature
curl -X POST "http://localhost:8080/git/add?path=Main.java" \
     -d "public class Main { void processPayment() { validate(); execute(); } }"
curl -X POST "http://localhost:8080/git/commit?message=refactor&author=dev"

# Get semantic diff
curl "http://localhost:8080/git/ai/diff?sha1=FIRST_SHA&sha2=SECOND_SHA&file=Main.java"

# Make a conflicting change on main
curl -X POST "http://localhost:8080/git/checkout?target=main"
curl -X POST "http://localhost:8080/git/add?path=Main.java" \
     -d "public class Main { void process() { log(); return; } }"
curl -X POST "http://localhost:8080/git/commit?message=add+logging&author=dev2"

# Predict the conflict before merging
curl "http://localhost:8080/git/ai/prophet?branch1=main&branch2=feature"
```

---

## Project Structure

```
src/main/java/com/gitclone/
    model/
        GitObject.java                  Base class — sha, type, serialize()
        Blob.java                       Raw file content
        Tree.java                       Directory snapshot (filename -> blobSha)
        Commit.java                     Point in time with parent pointers
    store/
        ObjectStore.java                SHA-256 content-addressable storage
    dag/
        CommitDAG.java                  Graph structure, DFS, LCA, ancestor check
    refs/
        RefManager.java                 HEAD, branch pointers
    diff/
        DiffEngine.java                 Myers algorithm with backtracking
        DiffLine.java                   Line with ADDED/DELETED/UNCHANGED type
    merge/
        MergeEngine.java                3-way merge with conflict detection
        MergeResult.java                Result with conflict flag and chunks
        MergeChunk.java                 NORMAL or CONFLICT chunk with content
    ai/
        SemanticDiffService.java        Myers output -> AI semantic analysis
        SemanticDiffResult.java         Summary, type, groups, risk, suggestions
        SemanticGroup.java              Cluster of related diff lines
        IntentPredictorService.java     Commit intent classification
        CommitIntentResult.java         Intent, confidence, risk, better message
        CommitContextBuilder.java       Assembles commit context for AI prompts
        ConflictProphetService.java     Pre-emptive conflict prediction
        BranchDivergenceAnalyzer.java   DAG-level divergence analysis
        ProphecyReport.java             Full conflict prediction output
        FileProphecy.java               Per-file conflict probability and advice
    service/
        GitService.java                 Core commands — init, add, commit, log
        DiffService.java                Diff orchestration between commits
        MergeService.java               Merge orchestration with fast-forward
    controller/
        GitController.java              REST API — all endpoints
```

---

## What Does Not Exist Elsewhere

**Semantic grouping of diff output** — no version control tool today groups diff lines by semantic intent. All existing tools show raw line changes. This engine tells you what those changes mean.

**Pre-emptive conflict detection** — every existing tool detects conflicts at merge time. This engine detects collision trajectories while branches are still being developed, giving teams time to coordinate before the problem forms.

**Conflict trajectory over time** — not just whether two branches will conflict, but how quickly the risk is growing commit by commit. A risk score of 0.7 that grew from 0.1 in two commits is different from one that has been 0.7 for ten commits.

**Commit intent inference from diff** — classifying what a commit actually did, independent of what the message says, using the actual code changes as evidence.

---

## Deploy on Render

This repository includes `render.yaml` for one-click blueprint deployment of:

- `fissure-backend` (Spring Boot)
- `fissure-frontend` (Next.js)

### Steps

1. Push your latest code to GitHub.
2. In Render, choose **New + > Blueprint**.
3. Select this repository.
4. Render will detect `render.yaml` and create both services.
5. After first deploy, verify frontend env:
  - `NEXT_PUBLIC_GIT_API_BASE=https://<your-backend-service>.onrender.com/git`

Backend CORS supports localhost and `https://*.onrender.com` by default, and can be overridden with:

`APP_CORS_ALLOWED_ORIGINS`
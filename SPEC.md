# HEAT Technical Specification (SPEC.md)

This document serves as the technical "Source of Truth" for the HEAT ranking system. It documents the architecture, core algorithms, and the rationale behind key design decisions to prevent "black box" syndrome.

---

## 1. System Overview & Tech Stack
HEAT is a data-driven music index for the Cambodian music industry, calculating popularity via the **HEAT Score**.

- **Infrastructure**: GitHub Actions (Primary CI/CD and Daily Cron Runner).
- **Backend/Storage**: 
    - **BigQuery**: Primary data warehouse for time-series snapshots, rank history, and vector embeddings.
    - **Google Sheets**: Master configuration for Artists and Manual Metadata overrides.
- **AI Engine**: 
    - **Vertex AI (Gemini 2.0 Flash)**: Automated song categorization and event tagging.
    - **Vertex AI (text-embedding-004)**: High-dimensional vector generation for AI Semantic Search (RAG).
- **Frontend**: Next.js (App Router) deployed on Vercel.

---

## 2. Directory Structure (Repository Map)

```bash
/
├── .github/workflows/   # GitHub Actions (Daily Pipeline at 21:20 KHR)
├── scripts/             # Core Node.js Automation Pipelines
│   ├── update-songs-node.mjs     # Sync Sheets (Artists/Songs) to BigQuery
│   ├── fetch-snapshots-node.mjs  # Daily YouTube API view count collection
│   ├── generate-ranking-node.mjs # Mathematical Ranking Generation (HEAT Score)
│   ├── batch-label-songs.mjs     # AI-driven metadata enrichment (Sequential)
│   ├── vectorize-songs-node.mjs   # AI Semantic Indexing for Search
│   └── telegram-node.mjs         # Notification system
├── src/
│   ├── lib/
│   │   └── bigquery.ts           # Frontend-to-BQ bridge (Dynamic date selection)
│   └── app/                      # Next.js Application UI
├── gas/                 # Legacy Google Apps Script (Reference only)
└── SPEC.md              # This document
```

---

## 3. Core Logic & Algorithms

### 3.1. The HEAT Score Formula
The HEAT Score prioritizes **Growth Velocity** and **Engagement** over absolute view counts.

**Formula:**
`Score = (BaseViewScore * Scale) + ReactionScore + MomentumBonus`

- **Scale**: `1 + (log10(TotalViews + 1) / 10)` (Rewards established reach).
- **BaseViewScore**: `(5 * ln(DailyViews + 1)) + (DailyViews / 10000)` (Logarithmic growth reward).
- **ReactionScore**: `(3 * ln(DailyLikes + 1)) + (5 * ln(DailyComments + 1) * QualityFactor)` (Weighted engagement).
- **MomentumBonus**: `min(5, GrowthRate * 5) + min(5, Engagement% * 100)` (Reward for trending performance).

### 3.2. Data Stability Logic (The "400 Threshold")
To prevent "NEW ENTRY" bugs and ranking resets during data gaps (e.g., failed YouTube syncs):
- The system automatically audits previous snapshot dates.
- A date is only used as a **Baseline** if it contains **> 400 records**.
- Corrupted dates (like 2026-04-05) are automatically skipped, and the system rolls back to the latest "Healthy" record (e.g., 2026-04-04).

---

## 4. Database Schema (BigQuery)

| Table | Purpose | Key Columns |
|:---|:---|:---|
| `snapshots` | Daily raw views | `date`, `videoId`, `views`, `likes`, `comments` |
| `rank_history` | Daily ranking results | `date`, `rank`, `videoId`, `heatScore`, `type` |
| `songs_master` | Enriched Metadata | `videoId`, `artist`, `title`, `eventTag`, `category` |
| `songs_vector` | AI Search Index | `videoId`, `embedding` (768d), `last_updated` |
| `artists_master` | Artist Profile | `artistName`, `channelId`, `subscribers` |

---

## 5. Architectural Rationale (The "Why")

### 5.1. Manual Artist Management
**Decision:** Deprecated auto-discovery from YouTube channels.
**Rationale:** To prevent "Spam Artists" and unrelated content (e.g., news, gaming) from polluting the music index. All artists must be registered in the **Spreadsheet** to be tracked.

### 5.2. Sequential BigQuery DML
**Decision:** Using sequential `for` loops with retry logic for `UPDATE` statements.
**Rationale:** BigQuery DML (Data Manipulation Language) has serialization limits. Parallel updates to the same table cause `Could not serialize access` errors.

### 5.3. Timezone Synchronization
**Decision:** Standardizing all cron jobs and logs to **Asia/Phnom_Penh (KHR)**.
**Rationale:** Fixing the "Double Update" bug caused by misaligned UTC/JST/KHR schedules. The official "Day Change" occurs at **21:20 KHR**.

### 5.4. Batch Load over Streaming
**Decision:** Using `table.load()` with NDJSON for daily snapshots and ranking history instead of `table.insert()`.
**Rationale:** To prevent **Streaming Buffer** conflicts. BigQuery blocks `DELETE` and `UPDATE` operations on rows currently in the streaming buffer (which can last up to 90 minutes). Since our daily pipeline needs to clear and overwrite data for the same day during re-runs or corrections, Batch Loading ensures data is immediately available for DML operations.

## 6. API Quota Management & Background Processing Policy

### YouTube Data API (50,000 Quota Limit)
**STRICT RULE:** The daily critical pipeline (`daily-snapshot-node.mjs` and ranking generation) MUST NEVER be stopped or fail due to API limits. 

- `daily-snapshot-node.mjs` uses the `videos.list(statistics)` endpoint which is highly quota-efficient.
- Heavy operations like Top Comments fetching (`youtube.commentThreads.list` at 1 quota point per song) for AI context/vectorization must **ONLY** use the "leftover" quota of the day.
- **Enforcement:** Background batch processors (e.g., `batch-label-songs.mjs`) must be heavily throttled or scheduled manually at times when daily updates have already successfully completed, ensuring they do not steal the critical quota needed for the core ranking system.

---

## 7. Maintenance & Troubleshooting

### Forced Regeneration
If a specific day's ranking is incorrect, run the script manually:
`node scripts/generate-ranking-node.mjs --date=YYYY-MM-DD --base=YYYY-MM-DD`

### Google Sheets Sync
If a new song is added to the sheet, it will be picked up by the next `update-songs-node.mjs` run or can be manually triggered to sync metadata instantly.

---
*Last Updated: 2026-04-15*

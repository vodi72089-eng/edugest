# Task 3 Report: Discipline Classifier

**Status:** Complete

## What was done

Created `src/lib/discipline-classifier.ts` — the core rule-based classification module for the disciplinary auto-classification system.

### Exports

- `extractKeywords(text)` — Extracts meaningful keywords from text, filtering stop words and deduplicating
- `classifyStudent(studentId, schoolId)` — Main classification function returning BLACKLIST/GREYLIST/WHITELIST
- `learnKeywordsFromRecord(recordId, title, description, schoolId)` — Learns new blacklist keywords from manually-set records

### Classification rules (in priority order)

1. **WHITELIST** — Positive points detected
2. **BLACKLIST** — CRITICAL severity sanctions
3. **BLACKLIST** — Static critical keywords found in descriptions
4. **BLACKLIST** — Learned keywords found in descriptions
5. **BLACKLIST** — Points threshold reached (≤ -10)
6. **BLACKLIST** — Repeated grave types (3+ VIOLENCE or TRICHERIE)
7. **GREYLIST** — Negative points (moderate sanctions)
8. **GREYLIST** — No sanctions (default)

### TypeScript verification

Ran `npx tsc --noEmit` — no errors in `discipline-classifier.ts`.

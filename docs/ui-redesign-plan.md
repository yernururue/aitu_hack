# City guide redesign — 20 October 2026

User supplied the complete brief and explicitly delegated visual decisions, implementation, demo recording and ordinary push to main. Application already exists; API contracts, paid guard and data pipeline remain intact. Submission was already sent; do not resubmit.

## Acceptance and direction

A calm urban field guide. Paper #F5F1E7, ink #282B23, olive #536144, terracotta #9A4934, muted text #626458. Serif headings with legal Cyrillic support; readable sans body. A generous headline and a useful compact query, rather than a dashboard of panels. Secondary controls use native disclosures; current location/radius/duration/budget/category/open-now/profile are represented in a short visible summary. Main path: describe → check conditions → results → route. No decorative gradient or fake map.

1. R1.1 capture existing desktop1440/mobile390, audit screenshots, preserve live build.
2. R1.2 UI executor owns src/components/**, src/app/globals.css, src/app/layout.tsx, public/fonts/**, docs/licenses.md, tests/e2e/** and UI-specific tests/unit only. Implement layout and states, compact cards, disclosures and source access. Preserve request schema and explicit filter semantics. Add behavior regression tests for changed disclosure/summary/empty result/focus. Read installed Next16 guides first. No paid calls.
3. R1.3 separate reviewer inspects diff, exact before/after screenshots and behavioral evidence; integrator runs lint/typecheck/test/build/NFT and checks 360/390/1440 flow including no horizontal scroll. No full new model eval.
4. R1.4 runtime/media executor prepares safe launch in isolated checkout using absolute existing canonical ledger; only after root accepts UI record exactly one real browser search (EXPO,5km,60min,blank budget, park query), explanation/sources and map transition. No mocks, manual replay or repeated search for recording aesthetics; existing bounded guarded provider retries remain unchanged and actual attempts are audited. Caps remain unchanged. New unknown stops. Preserve historic MP4/WEBM. Encode new MP4 H264/yuv420p/faststart, probe/decode/view playback.
5. R1.5 update README/screenshots/media/current handoff. Verify public replacement and static/private paths before retiring old origin; preserve old checkout/build as rollback. Scan known keys in memory in source/build/outgoing Git objects, never print secrets. Commit explicit paths only and ordinary push main; verify remote hash.

## Audit evidence

Current public live UI opened in IAB, then browser captures at1440×900 and390×844 saved under output/playwright/redesign-before-*.png and visually inspected. Desktop: long left form extends below fold, large idle panel repeats copy; mobile: category chips and location consume screen before radius/time/submit. Repeated per-card controls will be compacted. Initial read-only captures perform no recommendation POST; screenshots do not establish full keyboard/a11y compliance.

## Constraints

298 real POI and591 excerpts; retained source data/raw/normalized/collector work, index and contracts. Exact unknown values remain unknown, opinion labels remain visible, distance is straight-line, visit time an estimate, demo profile use explicit. Budget prep$2/eval$1.50nested/demo$4; existing canonical ledger only; unknown STOP. No keys/private data/raw/normalized/ledger in Git or public build.

## Visual references inspected after user steering

User reiterated removing white/violet and requested looking at other designs. Opened both in IAB and inspected current screenshots on20October2026: [Cereal City Guides / Studio Faculty](https://www.studiofaculty.com/work/cereal-city-guides) — generous margins, expressive book typography, consistent metadata; [The Modern House Journal](https://themodernhouse.com/journal) — serif editorial hierarchy and restrained dividers. Borrow composition principles only, while following the user’s warm paper/ink/olive palette. No third-party code, fonts or photographs copied.

## Content refinement — latest user steering

User asks “Детали по минимуму как у apple сделай по контенту.” R1.2b trims the content after the first accepted redesign: one hero/subtitle, one hint, a short summary of core and active constraints, no repeated slogans/success copy; technical/data warnings behind a clear disclosure with a concise visible caution. Empty categories/inactive demo/openNow defaults need not repeat. Active filters, strict unknown exclusion, demo use, price/hours unknowns, opinions and degraded/empty/error states remain explicit. Same UI owner, scoped independent review and fresh build before the single real recording. No paid call occurred before this steering.

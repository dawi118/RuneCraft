# Gielinor: Reforged implementation and verification

## Source and preservation

The implementation branch is `codex/gielinor-reforged`, based on remote `dawi118/RuneCraft` main at `f497d0e`. The supplied plan names this repository; the user confirmed it after the requested `projectrunecraft` name returned 404.

`migration/snapshots/` preserves the public board, site settings and selected external-feed records fetched on 9 September 2026. These are the actual runtime records, not the older Git JSON. `migration/id-map.json` maps all 19 live stage IDs into eight place pages. `migration/media-manifest.json` records original URLs and SHA-256 checksums. All 74 referenced original assets were downloaded into the ignored local `migration/media/` directory; the 222 generated WebP derivatives are tracked in `public/media/`. Preserve the original-media directory separately before removing this checkout.

Original descriptions, stage notes, captions, dates and unknown metadata remain in the migration source. Public responses use an explicit field allowlist. Original completion stamps retain their source string and a calendar date where valid; their unknown timezone is not invented. General-region stage assignments remain unchanged pending editorial review. A public place can group those stages within Misthalin without changing the original stage history.

Pins are approximate locations placed against the preserved map, recorded separately in `migration/editorial.json`. The public atlas says they are approximate and authors can refine them. They do not imply geographic completion. Terrain-only regions have readable directory notes and no empty standalone route.

## Runtime

Astro with the official Netlify adapter renders the public routes and metadata on request. Published content is not frozen during a code build. A shared content model powers rendering, author validation and the publication API. The supplied gold castle wordmark and centred G icon define the navy-and-gold identity. Public templates prioritize photographs and concise labels; original build notes and captions remain. The browser receives small modules for navigation, the atlas, galleries, saved places and the editor. Fonts and responsive project photographs are local.

Every content-dependent route reads a complete publication snapshot. Public HTML and feeds use a 30-second shared-cache TTL and up to 30 seconds of stale-while-revalidate. Authenticated endpoints and previews are `no-store`. A missing record returns HTTP 404. Storage failure serves a dated last successful publication or explicitly labelled migration snapshot; author operations fail rather than pretending a save succeeded.

The root catch-all redirect into `runecraft_site` has been removed. Both the root and published `_redirects` contain only explicit compatibility redirects; Astro emits its own server routing. Old root fragments are translated by the public compatibility script. Original media URLs are retained. The old data-only build-ignore rule is no longer configured, so a content/schema fallback change cannot accidentally suppress its required deploy.

## Author access and publishing

Use the existing `ADMIN_TOKEN` in Netlify’s environment, with Functions scope and a value for the relevant deployment context. The sole author identity is “Project authors”; sign-in only asks for the access key. No named author credentials or separate session secret are required. The key is verified on the server and exchanged for an eight-hour HttpOnly, SameSite=Strict session. `SESSION_SECRET` is optional; if unset, `ADMIN_TOKEN` signs sessions. No access key is saved in localStorage or bundled in the client.

Local preview/development loads an untracked `.env` file if present; existing process environment variables take precedence. Set `ADMIN_TOKEN` there to use the same key locally, then restart the server. The local preview does not automatically fetch Netlify’s hosted secrets. Deploying to the existing Netlify site uses its configured key; changing hosted environment variables requires a new deployment.

The default workflow is place → photographs → title/note → real-template preview → publish. Rich text supports a small bold/italic toolbar and paragraph breaks, with escaped authored HTML. Stages, cover selection and completion dates are optional details. Publication supplies the verified author, URL and timestamps and distributes the note to its place, journal, home and region.

Device drafts are labelled “Saved on this device”; private account drafts are separate authenticated records. Failed and interrupted saves retain recovery data. An expired session returns to sign-in without losing the draft. Imports validate and display a summary before replacing the working copy; exporting the current copy precedes replacement.

Publishing writes an immutable candidate revision, then atomically switches the complete published snapshot with Netlify Blobs `onlyIfMatch` or `onlyIfNew`. It checks `modified`, retries contention and verifies the receipt with a strong read before claiming success. Field-level three-way merge preserves unrelated work. Same-field conflicts show both values and require an explicit choice in the editor. Repeated request IDs do not duplicate publications. History follows only the committed revision chain, excluding abandoned candidates. Restore makes a new publication and preserves intervening history.

Uploads accept still JPEG, PNG and WebP up to 4 MB, fitting inside Netlify's request envelope after Base64 encoding. The server decodes the bytes, enforces pixel limits, corrects orientation, strips metadata and creates a master plus 400/800/1600-pixel WebP variants. SVG uploads, spoofed bytes and oversized files are rejected. Browser progress is per file and retry targets only failed files. Descriptions, captions, credits, focal points and accessible reordering are editable. Gallery selection is separate from completion and homepage selection.

## Deployment and rollback

1. Use Node 24 and `npm ci`; run `npm test`, `npm run build`, then `npm run test:e2e`.
2. Create a Netlify deploy preview from the implementation branch. Do not point it at the old production Blob stores. Preview content uses a namespace derived from its deploy ID; production uses `CONTENT_NAMESPACE` or the default production namespace.
3. Make the existing shared author key available to Functions in the preview context. Rehearse publishing, concurrent edits, failed uploads and a revision restore there. Confirm cache freshness from a separate browser.
4. Before production cutover, fetch another live board/settings/media export and compare it with the preserved source so intervening author work is not overwritten. The migration scripts are for an initial import, not routine author publishing. Do not rerun them over post-migration editorial work.
5. Keep the old deploy, original Blob stores and complete original-media backup available. The new content store is separate. Rolling the frontend back to the old deployment therefore preserves its original board and media. Rolling back a publication within the new frontend uses Version history.

Routine publishing does not trigger a deploy. Code, validation and fallback snapshot changes do. No production deployment or real author credential change is performed by the implementation tests.

## Conditional features

Local saved places, public search, RSS, curated external articles and reusable guided-tour templates are implemented. The idea form is closed by default. Site settings require a named reviewer and retention period before opening it. Ideas are stored privately; rate limits, duplicate receipts, input limits, consent-aware outcome projections, moderation states, pause and deletion are enforced on the server. A scheduled retention function removes expired submissions. Only reviewed, accepted summaries with explicit consent and an outcome link can appear publicly; optional public credit requires separate consent.

Public multiplayer access, downloads, live Minecraft integration, automatic email digests, a forum and events remain conditional on actual offerings, integrations and author commitments, as required by the plan. No availability, schedule, membership count or support benefit is invented.

## Verification boundaries

Automated checks cover migration, HTML safety, public/private separation, conditional writes, independent/same-field conflicts, idempotency, restore, image validation, sessions, routes, metadata, menus, filters, galleries, device-local saves, recovery and publishing distribution. Browser checks use Chromium and WebKit at 390, 768 and 1440 CSS pixels, plus 320px reflow, JavaScript-disabled browsing and reduced motion. Axe checks key public templates and the author flow.

WebKit emulation is not a physical iPhone test. Automated accessibility checks are not a complete screen-reader audit. Local performance measurements are not 75th-percentile field Core Web Vitals. Real Netlify cache propagation, production Blob credentials, two named authors publishing unaided, a two-minute author usability target, five first-visit testers and 30–60-day audience outcomes require a staging/production environment and people; they cannot be certified by local tests.

## Dependency audit

The 9 September 2026 `npm audit` run reports 10 high-severity dependency entries in the official Netlify adapter's development-emulator chain (`extract-zip`, `image-size`, and IPX's older nested Sharp, including affected parent packages). The application's upload pipeline directly uses Sharp 0.35.4. The emitted SSR bundle contains none of the `extract-zip`, `image-size` or IPX modules. The audit's proposed automatic fix is a major adapter downgrade to 6.4.1, incompatible with this Astro generation; it has not been forced. Track upstream adapter/emulator updates before launch. The development server binds to loopback and the Netlify image emulator is disabled.

## Recorded test results

- `npm run verify`: 35 unit/integration tests passed, including all 15 original tests; 44 browser scenarios passed across Chromium phone/tablet/desktop and WebKit phone/desktop. Sixteen duplicate author-mutation scenarios are intentionally skipped outside the designated Chromium desktop fixture; editor layout checks run on all five profiles.
- After the final navigation initialization fix, rebuilt and ran the delayed-script regression and no-JavaScript/reflow checks on all five profiles: 10 passed. The suite now contains 49 distinct enabled browser scenarios (65 configured cases with the same 16 intentional skips).
- Covered 390px phone, 768px tablet, 1440px desktop and 320px reflow; keyboard gallery controls and focus return, URL filters/history, real 404s, private preview/publish, three-photo update distribution, interrupted saves, expired sessions, automated WCAG AA checks and reduced motion.
- `git diff --check` passed. GitHub Actions runs the build and complete automated suite on feature-branch pushes and pull requests.

The first-load performance check caught the mobile menu collapsing after the deferred script arrived. Enhancement detection now runs in the head before first paint, while no-JavaScript navigation remains visible. A delayed-script test checks that header height stays stable. Safari select controls also have explicit width and text-overflow handling. Font loading avoids late face swaps. See `verification/performance.json` and the viewport screenshots for the final synthetic measurements.

Initial design measurements (superseded by the author-requested gold/navy revision below): LCP 476/316/136 ms at 390/768/1440px; CLS 0 in each profile. The synthetic phone profile with 4× CPU slowdown, 1.6 Mbps download and 150 ms latency recorded LCP 876 ms and CLS 0. Gallery click-to-next-paint measured 14–62 ms across profiles; this is an interaction proxy, not field INP. Initial phone asset transfer was approximately 169 KB (HTML additional), public JavaScript 3,017 bytes gzip, with 625 additional gzip bytes for the atlas. These single local samples meet the engineering budgets but do not establish production percentile performance.

The clean GitHub runner initially caught missing optional `@emnapi/core` and `@emnapi/runtime` lock entries. They were restored from a fresh dependency resolution while retaining the existing dependency versions. Clean-install validation also passed with CI's npm 11.19.0 and Linux/x64 options.

## Author-requested visual revision

The subsequent author direction replaces warm paper/pine styling and decorative prose with the supplied gold identity on midnight navy. The full castle wordmark is used in the home heading, navigation, footer and author workspace; the G is a centred square favicon and atlas marker. Original references, generated transparent masters, optimized web assets and prompts are retained under `design/brand/` and `public/brand/`.

Public cards now emphasize photographs, names and status. Decorative kickers, generic card descriptions, repeated follow bands, speculative photo placeholders, routine snapshot notices and roadmap disclaimers are removed. Original dated build notes and image captions remain. Short essential copy follows the first Project Runecraft Substack article. The homepage, atlas directory, gallery, place pages, journal, follow/support pages and author workspace share the new palette. Hover effects respect reduced motion; opaque navy page and control backgrounds retain readable contrast.

The revision adds regression tests for copy removal and square, centred transparent icon padding: 37 unit/integration tests pass. After the final canvas and cache-refresh adjustments, all 10 accessibility/navigation checks across the five device/browser profiles pass. The full browser suite also covers the revised publishing flow, recovery, public routing, galleries and editor layouts. Current screenshots and synthetic measurements are in `verification/`; they supersede the earlier design measurements.

Final gold/navy measurements: phone initial assets ~415 KB, LCP 324 ms locally; throttled phone LCP 2,304 ms with 4× CPU slowdown, 1.6 Mbps download and 150 ms latency. CLS was 0 across all four samples; gallery click-to-next-paint was 19–59 ms. These remain synthetic local samples, not production field percentiles.

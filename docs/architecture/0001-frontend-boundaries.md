# ADR 0001: Incremental frontend boundaries

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

FlowCV is a local-first resume builder with five Next.js routes, a Zustand resume store, TipTap editors, browser IndexedDB storage, an A4 measurement renderer, five registered templates, and a FastAPI service for import and AI operations. Existing tests cover storage, resume normalization, pagination, rich text, AI acceptance, import, accessibility, responsive widths, and print output.

The current implementation has useful feature folders under `components/`, `frontend/`, `resume/`, `renderer/`, `storage/`, `store/`, and `templates/`, but `app/editor/page.tsx` owns route hydration, autosave, keyboard shortcuts, editor forms, preview measurement, pagination, and modal orchestration. The Zustand hook also combines resume content, in-memory history, and hydration readiness. The editor and template gallery render resume content through separate trees. These are concrete maintenance and consistency risks; they do not justify a repository-wide move or a new state framework.

## Decision

Keep the existing Next.js App Router routes and libraries. Strengthen boundaries around current ownership instead of moving every file into a new tree.

| Concern | Current owner | Boundary contract |
| --- | --- | --- |
| Route composition | `app/` | Routes compose features and own navigation metadata. Keep document editing details out of unrelated public routes. |
| Resume model and normalization | `resume/` | Types, defaults, Zod validation, migrations, and transformations remain framework independent. |
| Resume document and history | `store/resumeStore.ts` | The document store is the canonical in-memory resume source. History remains bounded and grouped; transient panel/tab state stays in React components. |
| Browser persistence | `storage/` | Features use `ResumeStorage`; IndexedDB errors propagate for primary document loads and writes. Writes for one resume are serialized. |
| API contracts | `frontend/api/` and `frontend/ai/` | Network requests use typed, validated client functions. UI code does not construct endpoint requests directly. |
| Document geometry | `renderer/` | Pagination is a pure calculation over measured section and entry dimensions. DOM measurement stays in the client renderer. |
| Template definitions | `templates/` | Registry values are serializable configuration shared by editor and public previews. |
| Feature workflows | `components/editor/`, `components/ai/`, `components/import/` | Feature components own local interaction state and call resume, storage, and API contracts. Shared primitives under `components/ui/` remain business-rule agnostic. |

## Rendering decision

The editor preview is authoritative for live pagination and print layout because it owns DOM measurement and page chunking. `TemplateDocumentPreview` is a compact, unpaginated gallery renderer. It shares resume types, the template registry, rich-text semantics, and design settings, but it is not a substitute for the measured editor renderer. The FastAPI/Playwright export path remains an independent renderer. The following contract is shared across all three:

| Contract | Shared rule | Renderer-specific implementation |
| --- | --- | --- |
| Template identity | Use one of the five `templateRegistry` IDs and its registered layout; an explicit export template selects that same template. | CSS selectors and layout styles are implemented separately in React and Python. |
| Section grouping and order | Follow `sectionsOrder`; omit `hiddenSections`; modern/sidebar put skills, education, certifications, and links in the sidebar in their relative order, and other sections in the main column in their relative order. Other templates use one column. | The editor additionally splits sections and entries into measured page chunks. The gallery is unpaginated. The PDF relies on Chromium print fragmentation. |
| Education and experience | Show degree/title as the entry heading; show date range, institution/company, and location as metadata; preserve grade, description, and bullets where supported by the section model. | The editor measures these DOM nodes; the gallery uses a compact document tree; the PDF maps them to semantic HTML. |
| Skills | Respect `skillsLayout` (`tags`, `inline`, `grouped`, `columns`) and preserve category and skill values. | CSS wrapping and column balancing can differ by engine/container. |
| Design settings | Honor selected font ID, sizes, line height, letter spacing, accent/text/divider colors, divider style, left/center header, page margin, section gap, and entry gap. Page size is A4. | CSS font fallback and physical font availability can differ. Browser page chunking and Chromium print pagination are separate algorithms. |
| Rich text and wrapping | Preserve supported text, paragraph/list structure, bold, italic, underline, strike, code, links, and line breaks; long words and links must wrap within the content column. | DOM measurement and print layout may break lines differently; pagination must be tested separately. |
| Overflow and page breaks | Do not silently discard content or emit blank pages. Keep entry and heading structure together where possible. | The editor uses measured pagination; gallery intentionally has no page model; PDF uses print break rules and may split overlong entries. |

The backend now honors the configured page margin, typography sizing/letter spacing, section and entry gaps, divider and header settings, education/experience fields, skills layout, and the shared section grouping. Browser and server font environments and pagination remain renderer-specific; no pixel-perfect claim is made.

## Dependency decision

Do not add a component framework, form library, drag-and-drop library, animation package, or virtualizer in this change. Current forms are controlled fields, reordering has working keyboard buttons, dialogs have a shared focus-managed primitive, and no profiling evidence demonstrates a need for virtualization. Keep Zustand, TipTap, Zod, Vitest, Testing Library, Playwright, and axe-core. Revisit a dependency only when a measured or reproduced problem justifies its runtime and maintenance cost.

## Migration sequence

1. Keep resume normalization and API validation centralized; add regression tests before changing their contracts.
2. Keep editor route behavior stable while extracting independently testable rendering or persistence boundaries.
3. Consolidate duplicated template formatting only where screen, print, and server renderer contracts can be tested.
4. Split transient UI and persistence status from document state only when selectors or profiling demonstrate meaningful render savings and a compatibility adapter can preserve existing consumers.
5. Organize design tokens and shared primitives before migrating each screen; do not combine a route rewrite with a state migration.

## Risks and verification

- **History and persistence:** ordering mistakes can overwrite a newer resume. Verify serialized writes, autosave, explicit save, AI acceptance, restore, and reload.
- **Renderer alignment:** sharing formatting can change line wrapping and page count. Verify all five templates, rich text, long documents, and generated PDFs.
- **Browser print accessibility:** print filters can force Chromium to flatten resume text into an image. The print stylesheet disables the page drop shadow; the browser test checks that the exported PDF retains font resources and has no full-page image. Contact separators use an ASCII vertical bar because Chromium's extracted text mapped the generated middle-dot pseudo-element to U+FFFD.
- **Store decomposition:** many components and tests currently use `useResumeStore`; retain its public action contract until consumers migrate together.
- **Visual changes:** CSS is currently a large global stylesheet with layered overrides. Continue extracting cohesive tokens and feature styles only with responsive and accessibility checks.

## Initial prioritized issue list

| Priority | Finding and evidence | Impact | Resolution / verification |
| --- | --- | --- | --- |
| P0 | IndexedDB `loadResume` swallowed read errors and returned defaults; saves silently succeeded when IndexedDB was unavailable. | A storage failure could be mistaken for successful hydration and lead to misleading save status or an overwrite. | Propagate primary load/save failures; keep autosave gated on successful hydration; test unavailable storage. |
| P1 | Independent calls opened IndexedDB and wrote the same resume without an adapter ordering contract. | An older write could complete after a newer edit. | Serialize writes per resume ID; test order and failure recovery. |
| P1 | Editor route owns many unrelated workflows in one large client component; it subscribes to the whole resume store. | Changes are difficult to review and typing may rerender broad UI. | Extract boundaries incrementally; measure before further memoization or store splitting. |
| P1 | Editor, gallery, and backend PDF use separate rendering paths. | Formatting, rich text, and pagination can diverge. | Maintain an explicit renderer contract and inspect generated PDFs with fixtures. |
| P2 | Global CSS contains multiple generations of tokens and overrides. | Future screen work risks specificity and visual drift. | Consolidate tokens and migrate cohesive style groups with screenshot and axe checks. |
| P2 | Landing page previously described working import as planned and lacked direct navigation. | Users could miss an existing creation path. | Copy and navigation corrected; landing-to-import browser assertion added. |

## PDF and performance validation (2026-10-25)

- Seven synthetic backend endpoint fixtures covered short, rich-text, dense, long, reordered, hidden, and long-word/boundary resumes; all five templates were also rendered. All 34 generated pages were rendered to PNG and reviewed in contact sheets. Page dimensions were A4; extracted text bounds stayed within each page; no blank pages or editor chrome were found.
- The fixture review reproduced a generic `Item` education heading, duplicate institution text, hard-coded 14 mm PDF margins, and two-column templates that used newspaper columns instead of the editor's main/sidebar partition. The renderer now maps education fields explicitly, follows the selected margin and skills layout, and partitions modern/sidebar sections like the editor.
- Browser print was found to be a single raster image because the page wrapper's drop-shadow filter remained active in print. The print media rule removes the filter. A Chromium PDF check now confirms font resources, no image flattening, selectable resume text, A4 dimensions, and no application controls.
- Current Chromium measurements (three fresh 1440×900 contexts) reached the editor's resume content in 451–478 ms. Across 24 field updates per run, the preview performed one scheduled measurement; measured synchronous work was 0.3–0.5 ms. No comparable pre-change trace exists. Chromium heap reporting rounded to 10 MB and was not useful for a memory delta.
- Live frontend routes and browser print were exercised: the deployed editor produces a searchable, one-page A4 PDF without image flattening. Backend health/Redis health, CORS preflight, templates, inline-payload PDF generation, PDF import, DOCX import, and malformed resume validation were exercised with synthetic data. Live AI/provider calls were omitted because they may consume paid provider capacity. The deployed PDF endpoint still shows the pre-fix education and column layout; these backend fixes remain local until a separately approved deployment.

## Release gate

No deployment is authorized by this ADR. Release requires full tests, typecheck, lint, production build, responsive browser checks, API workflow checks, and page-by-page inspection of representative exported PDFs.

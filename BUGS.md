# Bug Phase Tracker

Collected during development; addressed together in a dedicated bug-fix phase.

## Open

| # | Area | Description | Notes |
|---|------|-------------|-------|
| 3 | Annotations | After Save, annotations become part of the PDF and can no longer be selected/moved/deleted in-app (only unsaved ones are editable). | Needs loading existing annotations into the store. |
| 4 | Annotations | Resize handles exist for rectangles, ellipses, stamps and signatures (image stamps keep their aspect ratio). Line and arrow endpoints are draggable. Freehand drawings, highlights and text-box width can still only be moved. | |
| 5 | Annotations | Not yet verified by hand: highlight/underline rect placement, note editor, stamps, save round-trip in external readers. Automated tests only cover the PDF output (all 10 types, 4 page rotations). | |
| 6 | Annotations | Text/image stamps and notes on rotated pages are not rotated with the page content. | |

## Fixed

| # | Fix |
|---|-----|
| 7 | Highlight/underline now override older markup of the same kind where they overlap (the old one is trimmed, not stacked). |
| 8 | Highlights/underlines can be deleted: click one with the Select tool (or use Edit), then use the Delete button or the Delete key. |
| 9 | Note editor could not be typed into because focus was lost to the click that created it; fixed. Click a note icon (Select/Edit tool) to view or edit its text. |
| 2 | Password-protected PDFs now ask for the password when opened (wrong passwords can retry); the file stays protected when saved again. |
| 1 | Search is now accurate and consistent: finds phrases split across text runs and wrapped lines, hyphenated words, and ignores case, accents, ligatures, curly quotes and dash styles. If nothing matches exactly it retries ignoring spacing. Matches are highlighted across every piece of text they cover (including tagged PDFs) and the current match scrolls into view. |
| 10 | "Text" tool was only selecting text, which looked broken. Renamed to **Select**, and **Text** is now a real text-box tool (click, type, Esc/click away to finish; double-click or Edit text to change it). |

## Completed phases (feature requests)

- **Multi-document tabs** (done): open several PDFs in tabs (Open supports multi-select, drag-drop opens each as a tab, re-opening an already-open file switches to its tab). Each tab keeps its own page/zoom, search, annotations and undo history. Ctrl+W closes, Ctrl+Tab / Ctrl+Shift+Tab cycle, middle-click closes, a dot marks unsaved annotations and closing asks before discarding them.
  - Known limits: scroll position restores to the page top (not the exact offset); tabs are not remembered between app launches; tabs cannot be reordered or dragged out into a new window.

- **Forms and signatures** (done): fillable form fields (text, checkbox, radio, dropdown, list) are shown on the page and edited in place; values are saved into the PDF (a dot on the tab and the Save counter show unsaved edits). Optional "Flatten form on save" makes entries permanent. Sign menu: import a signature image (optionally removes the paper background and trims margins), keep several, click one then click the page to place it, drag/resize it, delete it. Signatures are saved as image stamps.
  - Known limits: no drawn/typed signatures or cryptographic (certificate) signatures, only images; form JavaScript (calculations, validation) is not run; signatures are stored in the app's local storage (not synced); existing signature fields in a PDF are not clickable to sign.

- **Page organization** (done): *Organize pages* shows a page grid. Click / Ctrl-click / Shift-click to select, drag pages to reorder (several at once), rotate left/right, delete, extract the selection to a new PDF, insert another PDF's pages or a blank page after the selection, undo. *Split…* writes several PDFs to a folder (by ranges like `1-3, 5`, every N pages, or one per page). *Merge…* joins PDFs in a chosen order into a new tab. Unsaved annotations and form entries are baked into the file when a page edit is applied; Save writes the result (the tab dot shows pending page edits).
  - Known limits: Insert PDF takes all pages of the chosen file (no page picker); outline/bookmark entries pointing at deleted pages are left dangling; undoing a page edit does not restore annotations that were baked in by it; page edits don't carry across when closing without saving.

- **Compress, password protect, remove metadata** (done), all under *Tools ▾*:
  - *Compress…* (Light / Balanced / Smallest, with a confirmation step before it runs): re-compresses and downsizes embedded JPEG photos, then deduplicates and deflates the file structure with mupdf (WASM). Shows before/after size and can be undone. Files that are already small are left alone.
  - *Password protect…*: AES-256, with an open password, optional owner password and limits on printing, copying, editing and commenting. It is applied when you Save, and the file is written as `<name>_Protected.pdf` (next to the original, which is not overwritten; the suffix is never doubled); the open copy stays readable and the Tools button shows 🔒. *Remove protection* writes an unprotected copy on the next save.
  - *Remove metadata…*: lists what is hidden in the file (title, author, subject, keywords, creator/producer, dates, XMP, other fields, annotation authors) and strips it. Later edits no longer add the pdf-lib producer/date back.
  - Known limits: only JPEG images are downsampled (PNG/flat images, CMYK JPEGs and images with masks are left as they are); passwords cannot contain "," or "="; reopening a protected file keeps the open password but not the original owner password/permission limits (re-apply them in Protect); security-handler certificates and redaction are not supported; metadata removal does not scrub text inside page content.


## Completed feature requests (continued)

- **Draw a signature with a pen** (done): *Sign ▾ → Draw signature…* opens a pad that works with mouse, touch or stylus (pen pressure changes line width), with undo, clear, four ink colours and a thickness slider. It saves a trimmed transparent PNG to the signature list and arms it for placing on the page. Limits: signatures are stored in the app's local storage; no typed-name signatures.

- **Windows installer** (done): `npm run dist` builds `release/PDF-Reader-Setup-<version>.exe` (NSIS; choose folder, Start-menu and desktop shortcuts). Known limits: not code-signed (SmartScreen warning), x64 only.

- **Release and distribution** (done): app icon (`build/icon.ico` / `icon.png`); the installer registers PDF as a file type, so *Open with* works and the app can be made the default; PDFs passed on the command line open as tabs, and opening another PDF while the app is running adds a tab to the existing window; pushing a `v*` tag runs `.github/workflows/release.yml`, which builds the installer and publishes a GitHub Release; the installed app checks that release in the background (at start and every 6 hours), downloads updates and asks to restart.
  - Not verified end to end yet: the in-app update only runs from an installed copy and needs two published releases to try. The installer's file-association registry entries were configured but not tested on a clean machine. Code signing was deferred (needs a certificate); until then SmartScreen warns on install. There is no "Check for updates" menu item.

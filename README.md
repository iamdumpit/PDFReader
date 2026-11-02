# PDFReader

A desktop PDF reader and editor for Windows, built with Electron, React and TypeScript. Open, read, search, annotate,
fill forms, sign, reorganize pages, compress, password-protect and clean metadata — all locally, with no server and
no upload: your files never leave your computer.

> **Status:** early proof of concept. Run it from source (`npm run dev`) or build a Windows installer yourself
> (`npm run dist`, see below). There is no published download yet.
> Known problems and limitations are tracked in [BUGS.md](BUGS.md).

## Features

**Read**
- Open one or several PDFs in tabs (open dialog, drag and drop)
- Continuous scrolling, zoom and fit-to-width, page thumbnails, document outline and your own bookmarks
- Full-text search that handles split lines, hyphenation, accents and case, with highlighted matches
- Night mode

**Annotate**
- Highlight, underline, sticky notes, text boxes, freehand drawing, rectangles, ellipses, lines, arrows, stamps
- Move, resize, recolor, delete, undo/redo; saved as standard PDF annotations other readers can show

**Forms and signatures**
- Fill text fields, checkboxes, radio buttons and dropdowns, with an option to flatten the form on save
- Sign with an image of your signature (background removed automatically) or draw one with a mouse, finger or pen

**Organize pages**
- Reorder by dragging, rotate, delete, extract, insert pages from another PDF or blank pages, undo
- Merge several PDFs; split by page ranges, every N pages, or one file per page

**Tools**
- Compress (re-compresses photos and optimizes the file)
- Password protect with AES-256 and permission limits; protected files open with a password prompt
- Remove metadata (title, author, dates, XMP and more)

## Getting started

Requirements: [Node.js](https://nodejs.org/) (developed on Node 24) and npm, on Windows 10/11.

```bash
git clone https://github.com/iamdumpit/PDFReader.git
cd PDFReader
npm ci
npm run dev
```

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the app with hot reload |
| `npm run typecheck` | Type-check the project |
| `npx vitest run` | Run the unit tests |
| `npm run build` | Production build into `out/` |
| `npm run dist` | Build the Windows installer into `release/` |
| `npm run dist:dir` | Build just the unpacked app (`release/win-unpacked`), faster for testing |

## Building a Windows installer

```bash
npm ci
npm run dist
```

This produces `release/PDF-Reader-Setup-<version>.exe` (about 120 MB), a standard NSIS installer that lets you choose the
install folder and adds Start-menu and desktop shortcuts. The first build downloads Electron and the installer tooling.

Current limits: the installer is **not code-signed**, so Windows SmartScreen shows "Windows protected your PC" — choose
*More info → Run anyway*. It uses the default Electron icon, does not register itself as a `.pdf` handler (double-clicking
a PDF will not open it in this app yet), and has no auto-update.

## How it works

- **pdf.js** renders pages and extracts text for search and selection
- **pdf-lib** writes annotations, fills forms and edits pages
- **mupdf** (WASM) does compression and encryption
- **zustand** holds application state; **electron-vite** builds the app

Code layout: `src/main` and `src/preload` (Electron), `src/renderer/store` (state), `src/renderer/services` (all PDF
logic, unit-tested), and the rest of `src/renderer` for the interface. See [CLAUDE.md](CLAUDE.md) for architecture
notes and the development rules this project follows.

## Contributing

`main` is protected: work happens on a branch (`feat/…`, `fix/…`, `chore/…`) and goes in through a pull request.
Typecheck, tests and build must pass. Commit messages follow Conventional Commits.

## License

No license has been chosen. All rights are reserved by the author; the source is visible but is not licensed for
reuse.

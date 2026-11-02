# PDFReader

A desktop PDF reader and editor for Windows, built with Electron, React and TypeScript. Open, read, search, annotate,
fill forms, sign, reorganize pages, compress, password-protect and clean metadata — all locally, with no server and
no upload: your files never leave your computer.

> **Status:** early proof of concept. See [Installation](#installation-windows-1011) to build and install it; there is
> no published download yet.
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

## Installation (Windows 10/11)

There is no ready-made download yet, so you build the installer once from the source and then install it like any other
program. This takes about 10 minutes the first time.

**What you need first**
- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) LTS (developed on Node 24) — this also installs `npm`

You can check both are installed by running `git --version` and `node -v` in a terminal.

**1. Download the code**

```bash
git clone https://github.com/iamdumpit/PDFReader.git
cd PDFReader
```

**2. Install the dependencies** (downloads a few hundred MB)

```bash
npm ci
```

**3. Build the installer**

```bash
npm run dist
```

The first build also downloads Electron and the installer tools. When it finishes, the installer is at
`release\PDF-Reader-Setup-<version>.exe` (about 120 MB).

**4. Run the installer**
1. Double-click `PDF-Reader-Setup-<version>.exe`.
2. Windows SmartScreen may show **"Windows protected your PC"** because the installer is not code-signed. Click
   **More info → Run anyway**.
3. Choose the install folder and finish the wizard. Shortcuts are added to the Start menu and the desktop.
4. Start **PDF Reader** from the Start menu or desktop, then use **Open** (or Ctrl+O) to pick a PDF.

**Updating:** run `git pull`, `npm ci` and `npm run dist` again, then run the new installer over the old one.

**Uninstalling:** Settings → Apps → Installed apps → PDF Reader → Uninstall. Your PDFs are never touched.

**Current limits:** the installer uses the default Electron icon, does not register itself as the `.pdf` handler
(double-clicking a PDF in Windows will not open it in this app yet), has no auto-update, and is x64 only.

## Run from source (development)

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
| `npm test` | Run the unit tests |
| `npm run build` | Production build into `out/` |
| `npm run dist` | Build the Windows installer into `release/` |
| `npm run dist:dir` | Build just the unpacked app (`release/win-unpacked`), faster for testing |

If `npm run dev` complains that Electron is not installed, run `node node_modules/electron/install.js` once.

## How it works

- **pdf.js** renders pages and extracts text for search and selection
- **pdf-lib** writes annotations, fills forms and edits pages
- **mupdf** (WASM) does compression and encryption
- **zustand** holds application state; **electron-vite** builds the app

Code layout: `src/main` and `src/preload` (Electron), `src/renderer/store` (state), `src/renderer/services` (all PDF
logic, unit-tested), and the rest of `src/renderer` for the interface.

## Contributing

`main` is protected: work happens on a branch (`feat/…`, `fix/…`, `chore/…`) and goes in through a pull request.
Typecheck, tests and build must pass. Commit messages follow Conventional Commits.

## License

No license has been chosen. All rights are reserved by the author; the source is visible but is not licensed for
reuse.

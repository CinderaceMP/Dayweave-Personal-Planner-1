# Dayweave Desktop App

This app bundles the Dayweave web app into a desktop window for macOS and packages it into a `.dmg` using Electron.

## Usage

1. Install dependencies:
   ```bash
   pnpm --dir desktop-app install
   ```
2. Build the web app and package the desktop app:
   ```bash
   pnpm --dir desktop-app run package:mac
   ```
3. The `.dmg` will be placed in `desktop-app/dist/`.

## Notes

- The app looks for the built frontend in `desktop-app/app-dist/public/index.html`.
- If that file is not present, it falls back to `http://localhost:4173`.
- This is the simplest way to make the app downloadable as a native macOS app.

# Contributing to Frescario

Thanks for wanting to help. Contributions in English or Spanish are welcome.

## Ways to help

- **Report a bug:** open an issue using the *Bug report* template.
- **Suggest an idea:** open an issue using the *Feature request* template.
- **Translate:** the interface is in Spanish. Help with English and other languages is especially welcome.
- **Code:** fix a bug or build a feature and open a pull request.

## Translating Frescario

Spanish is the base language. Every other language is **one single file** in `frescario/app/public/i18n/`, for example `en.json`. To add a language:

1. Copy `en.json` to `<code>.json`, using the two-letter language code (for example `fr.json`, `de.json`, `ca.json`).
2. Fill in the top fields:
   - `nombre`: the language name in its own language, as it will appear in the selector (for example `Français`).
   - `locale`: date and number format (for example `fr-FR`).
   - `decimal`: the decimal separator, `","` or `"."`.
   - `mesMayuscula`: `true` if month names are capitalised in the middle of a sentence (German), `false` if not (French, Italian...).
3. Translate the values, never the keys. The keys are the Spanish originals.
   - `textos`: exact texts.
   - `patrones`: regular expressions for texts with numbers or names. In the translation, `$1` inserts the captured text as it is and `%1` translates it too.
   - `avisos`: the phone notifications. Words in `{braces}` are filled in by the app, keep them as they are. `uni` holds the units in singular and plural.
4. Run the app (see below). The new language appears on its own in **Settings → Language**, and phone notifications use it too. Anything you leave untranslated falls back to English.

You don't need to touch any code. One language per pull request, please.

## Project layout

```
repository.yaml          Home Assistant app repository
frescario/
  config.yaml            App definition (version, options)
  Dockerfile             Image build
  DOCS.md                Documentation shown inside Home Assistant
  CHANGELOG.md           Changes per version
  app/
    server.js            Express server and REST API
    ha.js                Home Assistant integration (notifications, sensors, to-do sync)
    externos.js          Open Food Facts and Gemini
    public/              Web interface (vanilla JS, no build step)
```

## Running it locally

You need Node.js 22.

```bash
cd frescario/app
npm install
FRESCARIO_DEV=1 FRESCARIO_DATA=./datos-dev node server.js
```

Open `http://localhost:8099`. In development mode you are logged in as an administrator and the Home Assistant features are disabled.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Keep changes focused: one fix or feature per pull request.
3. Check that the server starts and that the screens you touched work on phone and desktop.
4. If the change is visible to users, add a line to `frescario/CHANGELOG.md`.
5. Describe what you changed and why.

By contributing you agree that your contribution is licensed under the MIT license of this project.

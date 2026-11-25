# Contributing to Frescario

Thanks for wanting to help. Contributions in English or Spanish are welcome.

## Ways to help

- **Report a bug:** open an issue using the *Bug report* template.
- **Suggest an idea:** open an issue using the *Feature request* template.
- **Translate:** the interface is in Spanish. Help with English and other languages is especially welcome.
- **Code:** fix a bug or build a feature and open a pull request.

## Translating Frescario

Spanish is the base language. Each translation is one file in `frescario/app/public/i18n/`, for example `en.json`:

- `textos`: exact texts. The key is the Spanish text and the value is the translation.
- `patrones`: regular expressions for texts with numbers or names. In the translation, `$1` inserts the captured text as it is and `%1` translates it too.

To add a new language:

1. Copy `en.json` to `xx.json` (for example `fr.json`) and translate the values.
2. In `frescario/app/public/app.js`, add the code to the `IDIOMAS` list and a button for it in the language selector (search for `data-idioma`).
3. If you want phone notifications in that language, add it to `TXT` in `frescario/app/ha.js`.

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

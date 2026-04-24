# Ranked Champion Data

This folder hosts the public JSON consumed by the desktop app's ranked champion refresh command.

`latest.json` is intentionally small sample data for the first refresh path. It is not authoritative ranked data yet. Future updates can replace this file with output from a validated data generation script without changing the desktop command boundary.

Validate the file before publishing changes:

```powershell
npm run validate:ranked-data
```

The app expects format version `1`, at least one entry for each lane, no duplicate champion/lane rows, and finite percentage values from `0` to `100`.

Raw URL used by the app:

```text
https://raw.githubusercontent.com/Giggitycountless/LOL-Desktop-Assistant/main/data/ranked-champions/latest.json
```

# findesdu.ai

Lead magnet landing page med AI synlighedscheck.

## Struktur

```
findesdu/
  server.js          — Express backend
  package.json
  railway.toml       — Railway deploy config
  public/
    index.html       — Landing page (standalone)
  leads.json         — Gemte leads (auto-oprettet)
```

## Deploy til Railway

1. Opret nyt projekt på railway.app
2. "Deploy from GitHub repo" — push dette projekt
3. Sæt environment variables (se nedenfor)
4. Tilføj dit custom domain: findesdu.ai og findesdu.online

## Environment Variables

Sæt disse i Railway → Settings → Variables:

| Variable | Eksempel | Beskrivelse |
|---|---|---|
| `EMAIL_HOST` | `smtp.gmail.com` | Din SMTP host |
| `EMAIL_PORT` | `587` | SMTP port (587 = TLS, 465 = SSL) |
| `EMAIL_USER` | `susanne@anseri.ai` | Din email |
| `EMAIL_PASS` | `app-password-her` | App password (ikke dit login-password) |
| `FROM_EMAIL` | `noreply@findesdu.ai` | Afsender-adresse |
| `NOTIFY_EMAIL` | `susanne@anseri.ai` | Hvor du får notifikationer |
| `ADMIN_KEY` | `hemmelig-nøgle` | Til at se leads på /api/leads?key=... |

### Gmail setup
Brug "App Passwords" — ikke dit normale password:
Gmail → Sikkerhed → 2-trins bekræftelse → App-adgangskoder

## Se dine leads

Når deploy er klar:
```
https://findesdu.ai/api/leads?key=DIN_ADMIN_KEY
```

Returnerer JSON med alle leads (email, domæne, score, tidsstempel).

## Koble scanneren til (når den er klar)

I `public/index.html`, find `startScan()` funktionen og erstat:
```js
const score = getSimulatedScore(domain);
```
Med et kald til din scanner API:
```js
const res = await fetch('/api/scan', { 
  method: 'POST', 
  body: JSON.stringify({ domain }) 
});
const { score, findings } = await res.json();
```

Tilføj tilsvarende `/api/scan` endpoint i `server.js`.

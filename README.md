# 🎾 Rezervačný systém pre tenisové kurty (PWA + Netlify Serverless)

Produkčne pripravená webová aplikácia (Progressive Web App) pre online rezerváciu tenisových kurtov so serverless backendom na **Netlify Functions**, úložiskom **Netlify Blobs** (s automatickým lokálnym fallbackom) a e-mailovými notifikáciami cez **Resend API**.

---

## 📁 Štruktúra projektu

```text
tenis-rezervacie/
├── public/                     # Statický frontend + PWA (publish adresár)
│   ├── index.html              # Hlavné používateľské rozhranie (SK)
│   ├── styles.css              # Responzívny mobile-first dizajn
│   ├── app.js                  # Klientska logika, kalendár, sloty, PWA inštalácia
│   ├── manifest.json           # Web App Manifest pre PWA
│   ├── sw.js                   # Service Worker (cache statiky, Network-Only pre /api/*)
│   └── icons/                  # PWA a iOS ikony (192x192, 512x512, apple-touch-icon)
├── netlify/
│   ├── functions/
│   │   └── bookings.mjs        # Serverless API endpoint (/api/bookings GET & POST)
│   └── lib/
│       ├── config.mjs          # Konfigurácia kurtov, otváracích hodín (08:00–21:00) a ceny (8 €/h)
│       ├── storage.mjs         # Abstrakcia úložiska: @netlify/blobs + lokálny JSON fallback
│       └── email.mjs           # Odosielanie e-mailov cez Resend API + konzolový fallback
├── scripts/
│   ├── make-icons.mjs          # Generátor PWA ikon
│   ├── e2e.mjs                 # E2E test API endpointov a súbežných rezervácií
│   └── deploy-github.ps1       # Pomocný PowerShell skript pre push na GitHub
├── dev-server.mjs              # Lokálny vývojový server (bez nutnosti Netlify CLI)
├── netlify.toml                # Konfigurácia Netlify build, redirects (/api/*) a hlavičiek
├── package.json                # Závislosti projektu (@netlify/blobs)
└── .env.example                # Vzor premenných prostredia
```

---

## 🚀 Lokálne spustenie

1. Nainštalujte závislosti:
   ```bash
   npm install
   ```
2. Spustite lokálny vývojový server:
   ```bash
   npm run dev
   ```
3. Otvorte v prehliadači: `http://localhost:8888`

---

## 🌐 Nasadenie na GitHub a Netlify (Produkcia)

### Krok 1: Push repozitára na GitHub

#### Možnosť A: Pomocou priloženého skriptu
Spustite v PowerShell:
```powershell
.\scripts\deploy-github.ps1 -RepoUrl "https://github.com/VASE_MENO/tenis-rezervacie.git"
```

#### Možnosť B: Manuálne príkazy
1. Vytvorte nový prázdny repozitár na [GitHub](https://github.com/new) (napr. `tenis-rezervacie`, **bez** zaškrtnutia README/.gitignore).
2. V koreňovom priečinku projektu spustite:
   ```bash
   git branch -M main
   git remote add origin https://github.com/VASE_MENO/tenis-rezervacie.git
   git push -u origin main
   ```

---

### Krok 2: Prepojenie s Netlify

1. Prihláste sa do [Netlify Dashboard](https://app.netlify.com/).
2. Kliknite na **Add new site** → **Import an existing project** → vyberte **GitHub**.
3. Autorizujte GitHub a vyberte repozitár **`tenis-rezervacie`**.
4. Nastavenia buildu sa automaticky načítajú zo súboru `netlify.toml`:
   - **Publish directory:** `public`
   - **Functions directory:** `netlify/functions`
5. Pred kliknutím na Deploy (alebo v **Site configuration → Environment variables**) pridajte premenné prostredia:

| Premenná | Hodnota | Poznámka |
|---|---|---|
| `RESEND_API_KEY` | `re_xxxxxxxxx` | Váš API kľúč zo služby [Resend](https://resend.com) |
| `MANAGER_EMAIL` | `adam.horvat03@gmail.com` | E-mail správcu kurtov (predvolené aj v kóde) |
| `ADMIN_EMAIL` | `adam.horvat03@gmail.com` | E-mail administrátora (predvolené aj v kóde) |
| `FROM_EMAIL` | `Tenisové kurty <rezervacie@vasadomena.sk>` | Overená odosielacia adresa v Resend (voliteľné) |

6. Kliknite na **Deploy site** (ak ste menili premenné dodatočne, spustite **Trigger deploy → Deploy site**).

---

### Krok 3: Nasadenie cez Netlify CLI (alternatíva z terminálu)

Ak preferujete nasadenie priamo cez príkazový riadok:
```bash
npm install -g netlify-cli
netlify login
netlify init

# Nastavenie environment premenných
netlify env:set RESEND_API_KEY "re_vas_api_kluc"
netlify env:set MANAGER_EMAIL "adam.horvat03@gmail.com"
netlify env:set ADMIN_EMAIL "adam.horvat03@gmail.com"

# Produkčný deploy
netlify deploy --prod
```

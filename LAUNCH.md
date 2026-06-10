# 🚀 Brasero — Guide de lancement

Le site (front) est statique : `index.html`, `checkout.html`, `onboarding.html` + `assets/`.
Le backend (`server/`) gère **Stripe** (paiement réel) et **l'email** des réponses d'onboarding.

Tant que la constante `API` du front est **vide**, tout fonctionne en mode **démo** (paiement Stripe simulé, onboarding loggé). Pour passer en réel, on lance le backend et on renseigne `API`.

---

## 1. Lancer en local (test)

### a. Le front
Depuis la racine du projet :
```bash
python3 -m http.server 8080
```
→ http://localhost:8080

### b. Le backend
```bash
cd server
cp .env.example .env      # puis éditer .env
npm install
npm run dev
```
Le backend tourne sur http://localhost:4242 (emails loggés dans la console tant que SMTP n'est pas configuré).

### c. Brancher Stripe en test
1. Crée un compte Stripe → récupère ta **clé secrète test** sur https://dashboard.stripe.com/test/apikeys → mets-la dans `.env` (`STRIPE_SECRET_KEY=sk_test_...`).
2. Installe le **Stripe CLI** (https://stripe.com/docs/stripe-cli) puis :
   ```bash
   stripe listen --forward-to localhost:4242/webhook
   ```
   Copie le `whsec_...` affiché dans `.env` (`STRIPE_WEBHOOK_SECRET`).
3. Dans **`checkout.html`** et **`onboarding.html`**, mets la constante en haut du `<script>` :
   ```js
   const API='http://localhost:4242';
   ```
4. Recharge le site, choisis un pack → tu es redirigé vers la **vraie page Stripe Checkout** (mode test).
   Carte de test : `4242 4242 4242 4242`, date future, CVC quelconque.
   Après paiement → redirection vers `onboarding.html` → à la fin, les réponses partent au backend (`/api/onboarding`).

---

## 2. Configurer l'email (optionnel mais recommandé)

Dans `server/.env`, renseigne un SMTP (Brevo, Mailgun, Postmark, Gmail app-password, etc.) :
```
SMTP_HOST=smtp.brevo.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM="Brasero <hello@brasero.studio>"
MAIL_TO=toi@brasero.studio
```
Tu reçois alors : un mail à **chaque paiement** (via webhook) et un mail à **chaque onboarding** soumis.

---

## 3. Passer en production

### Front (au choix)
- **Netlify / Vercel / Cloudflare Pages / GitHub Pages** : déploie le dossier racine (les fichiers HTML + `assets/`).
- Mets à jour la constante `API` du front avec l'URL publique du backend (ex. `https://api.brasero.studio`).

### Backend (au choix)
- **Render / Railway / Fly.io / un VPS** : déploie le dossier `server/`.
  - Start command : `npm start`
  - Variables d'env : recopie le contenu de `.env` dans le dashboard de l'hébergeur.
  - `SITE_URL` = l'URL publique du **front** (ex. `https://brasero.studio`).
- Option « tout-en-un » : mets `SERVE_STATIC=1` et déploie tout depuis `server/` ; le backend sert aussi le HTML.

### Stripe en live
1. Bascule sur les **clés live** (`sk_live_...`).
2. Crée un **webhook** sur https://dashboard.stripe.com/webhooks pointant vers `https://TON-BACKEND/webhook`, évènement `checkout.session.completed` → copie le `whsec_...` live dans l'env.
3. Vérifie tes **prix** : ils sont définis côté serveur dans `server/server.js` (`PLANS`) — Starter 120$, Flame 240$, Burst 290$, abonnement = −10%.

---

## 4. Checklist avant d'ouvrir au public

- [ ] `API` renseignée dans `checkout.html` **et** `onboarding.html`
- [ ] Clés Stripe **live** + webhook live configurés
- [ ] SMTP configuré et email de test reçu
- [ ] `SITE_URL` du backend = domaine réel du front
- [ ] CORS OK (le backend n'autorise que `SITE_URL`)
- [ ] Test bout-en-bout : choix pack → paiement → onboarding → email reçu
- [ ] Mentions légales / CGV / politique de remboursement (requis par Stripe)

---

## 5. Ce qui reste « best-effort » (pas de backend requis)

- **Photo + @ Instagram** : récupérés côté navigateur via `unavatar.io` (sans clé). Le nom réel et la bio ne sont pas accessibles sans l'**API Instagram Graph** (OAuth + validation Meta) — à ajouter plus tard si besoin, via un endpoint backend dédié.

---

## Récapitulatif des endpoints backend

| Méthode | Route | Rôle |
|--------|-------|------|
| POST | `/api/checkout-session` | Crée la session Stripe, renvoie l'URL de paiement |
| POST | `/webhook` | Reçoit la confirmation de paiement Stripe (+ email) |
| POST | `/api/onboarding` | Reçoit les réponses d'onboarding (+ email) |
| GET  | `/health` | Vérifie que le backend tourne |

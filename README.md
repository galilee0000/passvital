# PassVital – application web (démo)

Design : fichier Figma « PassVital – Medical Profile » (option A, bleu médical).

## Parcours
1. Une personne scanne le QR code **unique** d’un manchon neuf → `?m=<id du manchon>`.
2. Elle crée son compte (ou se connecte), choisit ou crée une fiche, remplit les 7 étapes
   (identité, contact d’urgence, allergies, pathologies, traitements, compléments + photos / documents / vidéos, vérification).
3. « Publier et activer le manchon » → écran « Manchon activé » avec le code du manchon.
4. Toute autre personne qui scanne le QR code voit directement la fiche d’urgence (sans code).
5. Depuis « Mes fiches » : plusieurs fiches par compte, modification, aperçu, suspension d’un manchon perdu.

## Langues
Français, anglais, espagnol, allemand (fichier `i18n.js`).
- La langue du téléphone est détectée automatiquement ; sélecteur 🌐 en haut de chaque écran.
- Lien direct dans une langue : ajouter `&lang=en`, `&lang=es` ou `&lang=de` (ex. `?m=huq3yphe4pw4&lang=de`).
- Les réponses sont enregistrées en français dans la base et affichées traduites sur la fiche d’urgence.

## Fichiers
- `index.html`, `app.css`, `app.js` : l’application (GitHub Pages).
- `supabase.sql` : base de données (à exécuter une fois dans Supabase › SQL Editor).
- `supabase-support.sql` : demandes au support envoyées par l’assistant « Besoin d’aide ? » (à exécuter une fois).

## Base de données (Supabase)
- `profiles` : une ligne par fiche, toutes les réponses en colonnes.
- `sleeves` : les manchons (id dans le QR, code imprimé, statut, fiche liée).
- `media` : photos, documents, vidéos (fichiers dans le bucket `passvital-media`).
- `consent_log` : preuves de consentement (CGU et publication).
- Vue `admin_overview` : tout en une seule table, avec l’e-mail du compte.
- `support_requests` : demandes au support (n° S-XXXXXX, e-mail, sujet, manchon, message). Colonne `status` : `nouveau`, `en_cours`, `resolu` ; `note_interne` pour vos notes.


## Alerte au contact d’urgence lors d’un scan
Quand une autre personne que le titulaire scanne un manchon, le contact d’urgence reçoit un e-mail :
heure du scan, position (si la personne qui scanne l’autorise), adresse approximative, lien Google Maps.
Au plus 1 alerte par manchon toutes les 10 minutes (+ 1 e-mail de position si elle arrive après).
Le téléphone du titulaire (connecté ou ayant déjà géré ce manchon) ne déclenche pas d’alerte.

Mise en place (une seule fois) :
1. Supabase › SQL Editor : exécuter `supabase-scan-alert.sql`.
2. Créer un compte sur https://resend.com, vérifier un domaine (ex. pshconsultingcom.com) et créer une clé API.
3. Supabase › Edge Functions › Deploy a new function › nom `scan-alert` › coller `supabase/functions/scan-alert/index.ts`.
   Dans les réglages de la fonction : désactiver « Verify JWT ».
4. Supabase › Edge Functions › Secrets : `RESEND_API_KEY` (clé Resend) et `ALERT_FROM` (ex. `PassVital <alertes@pshconsultingcom.com>`).
Journal des scans : Table Editor › `scan_events`.

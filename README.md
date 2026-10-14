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

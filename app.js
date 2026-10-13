/* PassVital – application web (démo). Design : Figma « PassVital – Medical Profile », option A. */
(function () {
  "use strict";

  // ---------------- Configuration ----------------
  var SUPABASE_URL = "https://fuproswhrlbyktxojjig.supabase.co";
  var SUPABASE_KEY = "sb_publishable_4eBsvHm-KvdpI5tF2uigOw_CPL783oI"; // clé publique, prévue pour le navigateur
  var BUCKET = "passvital-media";
  var CONSENT_VERSION = "fiche-v1-2026-10";
  var CGU_VERSION = "cgu-v1-2026-10";
  var MAX_FILE = 50 * 1024 * 1024;

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  var BASE = location.origin + location.pathname;
  var params = new URLSearchParams(location.search);
  var scanId = (params.get("m") || "").toLowerCase();
  if (!/^[a-z0-9]{6,32}$/.test(scanId)) scanId = "";

  var LIENS = ["Conjoint(e)", "Parent", "Enfant", "Frère ou sœur", "Ami(e)", "Autre"];
  var ALL_MED = ["Pénicilline", "Aspirine et AINS", "Sulfamides", "Produits de contraste iodés", "Anesthésiques"];
  var ALL_OTHER = ["Arachides", "Fruits à coque", "Fruits de mer", "Latex", "Piqûres d’insectes"];
  var REACTIONS = ["", "Urticaire, démangeaisons", "Gonflement (œdème)", "Difficultés respiratoires", "Anaphylaxie"];
  var PATHOS = ["Diabète", "Épilepsie", "Maladie cardiaque", "Asthme sévère", "Hypertension", "Antécédent d’AVC", "Insuffisance rénale", "Grossesse en cours", "Troubles cognitifs", "Pacemaker ou défibrillateur"];
  var PRIO = ["Anticoagulant", "Insuline", "Antiépileptique", "Corticoïdes"];
  var GROUPES = ["", "A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−", "Je ne sais pas"];
  var LANGUES = ["Français", "Anglais", "Allemand", "Espagnol", "Arabe", "Autre"];
  var STEPS = [
    ["Identité", "Ces informations permettent aux secours de vous identifier."],
    ["Contact d’urgence", "La personne que les secours pourront appeler."],
    ["Allergies graves", "Elles s’affichent en premier sur votre fiche."],
    ["Pathologies", "Maladies et états que les secours doivent connaître."],
    ["Traitements", "Les médicaments que vous prenez actuellement."],
    ["Compléments", "Groupe sanguin, langues, photos, documents et vidéos."],
    ["Vérification", "Voici ce que verra une personne qui scanne votre QR code."]
  ];
  var COLS = ["prenom", "nom", "nom_public", "photo_path", "telephone", "adresse", "code_postal", "ville", "show_adresse",
    "contact_nom", "contact_lien", "contact_tel", "allergie_grave", "allergies", "allergie_reaction", "stylo_adrenaline",
    "allergie_autre", "pathologies", "pathologie_details", "traitements", "traitements_prioritaires", "groupe_sanguin", "langues", "infos"];

  var app = document.getElementById("app");
  var S = {
    screen: "loading", user: null, scan: null, isOwner: false,
    profiles: [], sleeves: [], media: [], P: null, step: 1, consent: false,
    authTab: "create", form: { email: "", cgu: false }, choice: null, activated: null,
    confirm: null, busy: false, uploading: null, preview: null
  };

  // ---------------- Helpers ----------------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function logo(color, size) { return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="' + color + '"/><path d="M13 7h6v6h6v6h-6v6h-6v-6H7v-6h6z" fill="#fff"/></svg>'; }
  var I = {
    chev: '<svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 2 10l8 8" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevR: '<svg class="chev" width="9" height="15" viewBox="0 0 9 15" aria-hidden="true"><path d="m1.5 1.5 6 6-6 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    phone: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
    qr: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--tint)" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v7h-3"/></svg>',
    ok: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="var(--ok)"/><path d="m7 12.5 3.2 3.2L17 9" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    okBig: '<svg width="72" height="72" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="var(--ok)"/><path d="m7 12.5 3.2 3.2L17 9" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    camera: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/></svg>',
    video: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4z"/></svg>',
    file: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6M9 15l3-3 3 3"/></svg>',
    doc: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>',
    play: '<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="rgba(0,0,0,.55)"/><path d="m10 8 6 4-6 4z" fill="#fff"/></svg>',
    trash: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    plus: '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="11" fill="var(--ok)"/><path d="M11 6v10M6 11h10" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>'
  };
  function initials(p, n) { return ((p || "").trim().charAt(0) + (n || "").trim().charAt(0)).toUpperCase() || "?"; }
  function frDate(iso) { try { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return ""; } }
  function publicUrl(path) { return SUPABASE_URL + "/storage/v1/object/public/" + BUCKET + "/" + String(path).split("/").map(encodeURIComponent).join("/"); }
  function sizeTxt(b) { if (!b) return ""; return b > 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(b / 1024)) + " Ko"; }
  function autoPublic(P) { var p = (P.prenom || "").trim(), n = (P.nom || "").trim(); return p ? p + (n ? " " + n.charAt(0).toUpperCase() + "." : "") : ""; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  var toastTimer = null;
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3200); }
  function showErr(msg) { var e = $("err"); if (e) { e.textContent = msg; e.scrollIntoView({ block: "center", behavior: "smooth" }); } else toast(msg); }
  function go(screen) { S.screen = screen; render(); window.scrollTo(0, 0); }
  function getPending() { try { return JSON.parse(localStorage.getItem("pv-pending") || "null"); } catch (e) { return null; } }
  function setPending(p) { try { if (p) localStorage.setItem("pv-pending", JSON.stringify(p)); else localStorage.removeItem("pv-pending"); } catch (e) {} }
  function errText(e) {
    var m = (e && (e.message || e.error_description)) || "";
    if (/Invalid login credentials/i.test(m)) return "E-mail ou mot de passe incorrect.";
    if (/Email not confirmed/i.test(m)) return "Confirmez d’abord votre adresse e-mail grâce au lien reçu.";
    if (/already registered|already exists/i.test(m)) return "Un compte existe déjà avec cet e-mail. Connectez-vous.";
    if (/sleeve_taken/.test(m)) return "Ce manchon est déjà associé à un autre compte.";
    if (/Password should be/i.test(m)) return "Le mot de passe est trop faible.";
    if (/email rate limit|over_email_send_rate_limit/i.test(m + " " + (e && e.code))) return "Limite d’envoi d’e-mails atteinte (service Supabase gratuit : quelques e-mails par heure). Réessayez plus tard ou désactivez « Confirm email » dans Supabase.";
    if (/rate limit|over_request_rate_limit/i.test(m + " " + (e && e.code))) return "Trop de tentatives depuis cet appareil. Réessayez dans quelques minutes.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Connexion impossible. Vérifiez internet et réessayez.";
    return "Une erreur est survenue. " + m;
  }

  // ---------------- Components ----------------
  function navBrand(right) { return '<header class="nav"><span class="brand">' + logo("var(--tint)", 26) + "PassVital</span>" + (right || "") + "</header>"; }
  function bar(inner) { return '<footer class="bar"><div class="in">' + inner + "</div></footer>"; }
  function groupHead(t, cls) { return '<p class="cap head' + (cls ? " " + cls : "") + '">' + esc(t) + "</p>"; }
  function inputCell(label, f, val, type, ph, extra) {
    return '<label class="cell" for="f-' + f + '"><span>' + esc(label) + '</span><input id="f-' + f + '" data-f="' + f + '" type="' + (type || "text") + '" placeholder="' + esc(ph || "") + '" value="' + esc(val) + '"' + (extra || "") + "></label>";
  }
  function switchCell(label, f, on) { return '<label class="cell wide" for="f-' + f + '"><span>' + esc(label) + '</span><input id="f-' + f + '" data-f="' + f + '" class="switch" type="checkbox" role="switch"' + (on ? " checked" : "") + "></label>"; }
  function checkRows(name, items, selected) {
    return items.map(function (it, i) {
      var id = "c-" + name + "-" + i;
      return '<label class="cell opt" for="' + id + '"><span>' + esc(it) + '</span><input id="' + id + '" class="check" type="checkbox" data-arr="' + name + '" value="' + esc(it) + '"' + (selected.indexOf(it) >= 0 ? " checked" : "") + "></label>";
    }).join("");
  }
  function radioRows(name, items, val) {
    return items.map(function (it, i) {
      var id = "r-" + name + "-" + i;
      return '<label class="cell opt" for="' + id + '"><span>' + esc(it) + '</span><input id="' + id + '" class="check" type="radio" name="' + name + '" data-radio="' + name + '" value="' + esc(it) + '"' + (val === it ? " checked" : "") + "></label>";
    }).join("");
  }
  function selectCell(label, f, options, val) {
    return '<label class="cell sel" for="f-' + f + '"><span>' + esc(label) + '</span><select id="f-' + f + '" data-f="' + f + '">' +
      options.map(function (o) { return '<option value="' + esc(o) + '"' + (o === (val || "") ? " selected" : "") + ">" + (o ? esc(o) : "Choisir") + "</option>"; }).join("") + "</select></label>";
  }
  function avatarHtml(photoPath, ini, cls) {
    return photoPath ? '<div class="avatar ' + (cls || "") + '" style="background-image:url(\'' + esc(publicUrl(photoPath)) + '\')" role="img" aria-label="Photo"></div>' : '<div class="avatar ' + (cls || "") + '">' + esc(ini) + "</div>";
  }

  // ---------------- Screens: auth ----------------
  function vAuth() {
    var p = getPending(), create = S.authTab === "create";
    var h = navBrand(p ? '<span class="step">Activation</span>' : "") + '<div class="stack" style="padding-top:20px">' +
      '<div style="display:flex;flex-direction:column;gap:14px">' + logo("var(--tint)", 56) +
      "<div><h1>" + (create ? "Créer votre compte" : "Se connecter") + '</h1><p class="sub">' +
      (create ? "Votre compte vous permet de remplir et de modifier votre fiche d’urgence." : "Accédez à vos fiches et à vos manchons PassVital.") + "</p></div></div>";
    if (p) h += '<div class="sleeve">' + I.qr + "<div><strong>Manchon détecté</strong><small>" + esc(p.label || "") + " · prêt à être activé</small></div>" + I.ok + "</div>";
    h += '<div class="seg" role="tablist"><button role="tab" data-act="tab" data-tab="create" class="' + (create ? "on" : "") + '" aria-selected="' + create + '">Créer un compte</button><button role="tab" data-act="tab" data-tab="login" class="' + (!create ? "on" : "") + '" aria-selected="' + !create + '">Se connecter</button></div>';
    h += '<div class="group"><div class="list">' +
      '<label class="cell" for="a-email"><span>E-mail</span><input id="a-email" type="email" autocomplete="email" placeholder="nom@exemple.fr" value="' + esc(S.form.email) + '"></label>' +
      '<label class="cell" for="a-pw"><span>Mot de passe</span><input id="a-pw" type="password" autocomplete="' + (create ? "new-password" : "current-password") + '" placeholder="Obligatoire"></label>' +
      (create ? '<label class="cell" for="a-pw2"><span>Confirmation</span><input id="a-pw2" type="password" autocomplete="new-password" placeholder="Obligatoire"></label>' : "") +
      "</div>" + (create ? '<p class="cap">8 caractères minimum, dont au moins 1 chiffre.</p>' : "") + "</div>";
    if (create) h += '<div class="group"><div class="list"><label class="cell wide" for="a-cgu"><span>J’accepte les conditions d’utilisation et la politique de confidentialité</span><input id="a-cgu" class="switch" type="checkbox" role="switch"' + (S.form.cgu ? " checked" : "") + "></label></div></div>";
    else h += '<button class="linkbtn" data-act="forgot" style="align-self:flex-start">Mot de passe oublié ?</button>';
    h += '<p class="err" id="err" role="alert"></p></div>';
    h += bar('<button class="btn primary" data-act="' + (create ? "signup" : "login") + '"' + (S.busy ? " disabled" : "") + ">" + (S.busy ? "Patientez…" : create ? "Créer mon compte" : "Se connecter") + "</button>");
    return h;
  }
  function vCheckMail() {
    return navBrand("") + '<div class="done">' + I.okBig + "<h1>Vérifiez vos e-mails</h1>" +
      '<p class="sub">Nous avons envoyé un lien de confirmation à <strong>' + esc(S.form.email) + "</strong>. Ouvrez-le sur ce téléphone pour continuer.</p></div>" +
      bar('<button class="btn text" data-act="to-login">J’ai confirmé, me connecter</button>');
  }
  function vNewPw() {
    return navBrand("") + '<div class="stack"><div><h1>Nouveau mot de passe</h1><p class="sub">Choisissez un nouveau mot de passe pour votre compte.</p></div>' +
      '<div class="group"><div class="list"><label class="cell" for="n-pw"><span>Mot de passe</span><input id="n-pw" type="password" autocomplete="new-password" placeholder="Obligatoire"></label>' +
      '<label class="cell" for="n-pw2"><span>Confirmation</span><input id="n-pw2" type="password" autocomplete="new-password" placeholder="Obligatoire"></label></div><p class="cap">8 caractères minimum, dont au moins 1 chiffre.</p></div><p class="err" id="err" role="alert"></p></div>' +
      bar('<button class="btn primary" data-act="set-pw">Enregistrer le mot de passe</button>');
  }

  // ---------------- Screens: dashboard & association ----------------
  function sleeveChip(st) { return st === "active" ? '<span class="chip ok">Actif</span>' : st === "suspended" ? '<span class="chip warn">Suspendu</span>' : '<span class="chip off">' + esc(st) + "</span>"; }
  function vDash() {
    var h = navBrand('<button class="linkbtn" data-act="logout">Se déconnecter</button>') +
      '<div class="stack"><div><h1>Mes fiches</h1><p class="sub">' + esc(S.user && S.user.email) + "</p></div>";
    if (!S.profiles.length) h += '<div class="group"><div class="list"><div class="cell"><span class="muted" style="flex:1;padding-block:12px">Vous n’avez pas encore de fiche. Créez-en une pour vous ou pour un proche.</span></div></div></div>';
    S.profiles.forEach(function (p) {
      var sl = S.sleeves.filter(function (s) { return s.profile_id === p.id; });
      h += '<div class="group"><div class="list">' +
        '<div class="pcard">' + avatarHtml(p.photo_path, initials(p.prenom, p.nom), "sm") + "<div><strong>" + esc(p.nom_public || p.prenom || "Fiche sans nom") + "</strong><small>" + (p.published ? "Mise à jour le " + esc(frDate(p.updated_at)) : "Brouillon, non publiée") + "</small></div>" + (p.published ? '<span class="chip ok">Publiée</span>' : '<span class="chip off">Brouillon</span>') + "</div>";
      sl.forEach(function (s) {
        h += '<div class="cell"><span class="mono" style="flex:1 1 auto">' + esc(s.label) + "</span>" + sleeveChip(s.status) +
          (s.status === "active" ? '<button class="btn ghost small" data-act="ask-suspend" data-id="' + esc(s.id) + '">Suspendre</button>' : s.status === "suspended" ? '<button class="btn ghost small" data-act="reactivate" data-id="' + esc(s.id) + '">Réactiver</button>' : "") + "</div>";
        if (S.confirm && S.confirm.type === "suspend" && S.confirm.id === s.id) {
          h += '<div class="cell"><div class="confirm" style="flex:1;padding:12px 0;background:none"><p>Suspendre ' + esc(s.label) + " ? Les personnes qui le scannent ne verront plus aucune information.</p>" +
            '<div class="row"><button class="btn ghost" data-act="cancel-confirm">Annuler</button><button class="btn solid-danger" data-act="suspend" data-id="' + esc(s.id) + '">Suspendre</button></div></div></div>';
        }
      });
      if (!sl.length) h += '<div class="cell"><span class="muted" style="flex:1;padding-block:12px;font-size:15px">Aucun manchon associé. Scannez le QR code d’un manchon neuf pour l’associer à cette fiche.</span></div>';
      h += '<button class="cell tap" data-act="edit" data-id="' + p.id + '"><span style="flex:1">Modifier la fiche</span>' + I.chevR + "</button>" +
        '<button class="cell tap" data-act="preview-profile" data-id="' + p.id + '"><span style="flex:1">Aperçu de la fiche</span>' + I.chevR + "</button>";
      h += "</div></div>";
    });
    h += '<p class="cap">Un manchon perdu ? Suspendez-le : sa fiche n’est plus affichée tant qu’il reste suspendu.</p></div>';
    h += bar('<button class="btn primary" data-act="new-profile">Ajouter une fiche</button>');
    return h;
  }
  function vChoose() {
    var p = getPending() || {};
    var h = navBrand('<button class="linkbtn" data-act="logout">Se déconnecter</button>') + '<div class="stack"><div><h1>Associer ce manchon</h1><p class="sub">Choisissez la fiche à relier au manchon <span style="white-space:nowrap">' + esc(p.label || "") + "</span>.</p></div>" +
      '<div class="sleeve">' + I.qr + "<div><strong>Manchon " + esc(p.label || "") + "</strong><small>Prêt à être activé</small></div>" + I.ok + "</div>" +
      '<div class="group">' + groupHead("Vos fiches") + '<div class="list">';
    S.profiles.forEach(function (pr, i) {
      h += '<label class="cell opt" for="ch-' + i + '"><span>' + esc(pr.nom_public || pr.prenom || "Fiche sans nom") + (pr.published ? "" : " (brouillon)") + '</span><input id="ch-' + i + '" class="check" type="radio" name="choice" value="' + pr.id + '"' + (S.choice === pr.id ? " checked" : "") + "></label>";
    });
    h += '<label class="cell opt" for="ch-new"><span>Nouvelle fiche (moi, un enfant, un proche…)</span><input id="ch-new" class="check" type="radio" name="choice" value="new"' + (S.choice === "new" ? " checked" : "") + "></label></div></div>" +
      '<p class="err" id="err" role="alert"></p></div>' + bar('<button class="btn primary" data-act="choose"' + (S.busy ? " disabled" : "") + ">Continuer</button>");
    return h;
  }
  function vActivated() {
    var a = S.activated || {};
    return navBrand("") + '<div class="done">' + I.okBig + "<h1>Manchon activé</h1>" +
      '<p class="sub">La fiche de ' + esc(a.name || "") + " est maintenant liée à ce manchon.</p>" +
      '<div class="codebox"><small>Code du manchon</small><strong>' + esc(a.label || "") + "</strong></div>" +
      '<p class="sub">Toute personne qui scanne ce QR code voit directement la fiche d’urgence, sans code ni compte.</p></div>' +
      bar('<button class="btn primary" data-act="open-scan" data-id="' + esc(a.id || "") + '">Voir la fiche</button><button class="btn text" data-act="dash">Mes fiches</button>');
  }

  // ---------------- Screens: editor (7 steps from Figma) ----------------
  function vEditor() {
    var P = S.P, st = S.step, t = STEPS[st - 1];
    var h = '<header class="nav"><button class="back" data-act="prev">' + I.chev + 'Retour</button><span class="step">' + st + " sur 7</span></header>" +
      '<div class="progress"><i style="width:' + Math.round(st / 7 * 100) + '%"></i></div><div class="stack"><div><h1>' + esc(t[0]) + '</h1><p class="sub">' + esc(t[1]) + "</p></div>";
    if (st === 1) {
      h += '<div class="photo">' + avatarHtml(P.photo_path, initials(P.prenom, P.nom)) +
        '<label class="linkbtn" for="up-avatar" style="cursor:pointer">' + (P.photo_path ? "Changer la photo" : "Ajouter une photo") + '<input id="up-avatar" type="file" accept="image/*" data-up="avatar" style="position:absolute;width:1px;height:1px;opacity:0"></label></div>' +
        '<div class="list">' + inputCell("Prénom", "prenom", P.prenom, "text", "Obligatoire", ' autocomplete="given-name"') + inputCell("Nom", "nom", P.nom, "text", "Obligatoire", ' autocomplete="family-name"') + "</div>" +
        '<div class="group">' + groupHead("Coordonnées") + '<div class="list">' +
        inputCell("Téléphone", "telephone", P.telephone, "tel", "+49 …", ' autocomplete="tel"') +
        inputCell("Adresse", "adresse", P.adresse, "text", "Rue et numéro", ' autocomplete="street-address"') +
        inputCell("Code postal", "code_postal", P.code_postal, "text", "30926", ' inputmode="numeric" autocomplete="postal-code"') +
        inputCell("Ville", "ville", P.ville, "text", "Ville", ' autocomplete="address-level2"') +
        switchCell("Afficher mon adresse sur la fiche d’urgence", "show_adresse", P.show_adresse) +
        '</div><p class="cap">Votre téléphone personnel n’est jamais affiché. L’adresse ne l’est que si vous l’autorisez.</p></div>' +
        '<div class="group">' + groupHead("Nom affiché sur la fiche") + '<div class="list">' + inputCell("Nom public", "nom_public", P.nom_public || autoPublic(P), "text", "Prénom + initiale") + '</div><p class="cap">Proposé automatiquement : prénom et initiale du nom. Votre nom complet n’est jamais affiché.</p></div>';
    } else if (st === 2) {
      h += '<div class="group">' + groupHead("Contact") + '<div class="list">' + inputCell("Nom", "contact_nom", P.contact_nom, "text", "Obligatoire") + inputCell("Téléphone", "contact_tel", P.contact_tel, "tel", "Obligatoire") + "</div></div>" +
        '<div class="group">' + groupHead("Lien avec vous") + '<div class="list">' + radioRows("contact_lien", LIENS, P.contact_lien || "") + '</div><p class="cap">Ce numéro pourra être appelé en un geste depuis votre fiche d’urgence.</p></div>';
    } else if (st === 3) {
      var al = arr(P.allergies);
      h += '<div class="list">' + switchCell("J’ai une allergie grave", "allergie_grave", P.allergie_grave) + "</div>" +
        '<div class="group">' + groupHead("Médicaments") + '<div class="list">' + checkRows("allergies", ALL_MED, al) + "</div></div>" +
        '<div class="group">' + groupHead("Aliments et autres") + '<div class="list">' + checkRows("allergies", ALL_OTHER, al) + "</div></div>" +
        '<div class="group">' + groupHead("Réaction") + '<div class="list">' + selectCell("Réaction la plus grave", "allergie_reaction", REACTIONS, P.allergie_reaction) + switchCell("Stylo d’adrénaline sur moi", "stylo_adrenaline", P.stylo_adrenaline) + inputCell("Autre allergie", "allergie_autre", P.allergie_autre, "text", "Préciser") + "</div></div>";
    } else if (st === 4) {
      h += '<div class="list">' + checkRows("pathologies", PATHOS, arr(P.pathologies)) + "</div>" +
        '<div class="group">' + groupHead("Précisions") + '<div class="list"><label class="cell" for="f-pathologie_details"><textarea id="f-pathologie_details" data-f="pathologie_details" maxlength="300" placeholder="Ex. Diabète de type 1, risque d’hypoglycémie">' + esc(P.pathologie_details) + '</textarea></label></div><p class="cap">Indiquez uniquement ce qui est utile en urgence.</p></div>';
    } else if (st === 5) {
      var tr = arr(P.traitements);
      tr.forEach(function (t, i) {
        h += '<div class="group"><p class="cap head" style="display:flex;justify-content:space-between;align-items:center">Traitement ' + (i + 1) + ' <button class="linkbtn" style="font-size:13px;min-height:32px;color:var(--urgent)" data-act="del-tr" data-i="' + i + '">Supprimer</button></p><div class="list">' +
          ["nom|Médicament|Ex. Insuline", "dosage|Dosage|Ex. 10 UI", "frequence|Fréquence|Ex. 3 fois par jour"].map(function (d) {
            var k = d.split("|");
            return '<label class="cell" for="t-' + i + "-" + k[0] + '"><span>' + k[1] + '</span><input id="t-' + i + "-" + k[0] + '" type="text" data-t="' + i + '" data-k="' + k[0] + '" placeholder="' + k[2] + '" value="' + esc(t[k[0]]) + '"></label>';
          }).join("") + "</div></div>";
      });
      h += '<div class="list"><button class="cell tap add" data-act="add-tr">' + I.plus + "<span style=\"flex:1\">Ajouter un traitement</span></button></div>" +
        '<div class="group">' + groupHead("À signaler en priorité") + '<div class="list">' + checkRows("traitements_prioritaires", PRIO, arr(P.traitements_prioritaires)) + '</div><p class="cap">Ces traitements modifient la prise en charge par les secours.</p></div>';
    } else if (st === 6) {
      h += '<div class="list">' + selectCell("Groupe sanguin", "groupe_sanguin", GROUPES, P.groupe_sanguin) + "</div>" +
        '<div class="group">' + groupHead("Langues parlées") + '<div class="list">' + checkRows("langues", LANGUES, arr(P.langues)) + "</div></div>" +
        '<div class="group">' + groupHead("Informations complémentaires") + '<div class="list"><label class="cell" for="f-infos"><textarea id="f-infos" data-f="infos" maxlength="300" placeholder="Ex. Porte des lentilles, directives anticipées chez mon médecin…">' + esc(P.infos) + '</textarea></label></div><p class="cap" id="cnt">' + (P.infos || "").length + " / 300 caractères</p></div>" +
        '<div class="group">' + groupHead("Photos, documents et vidéos") +
        '<div class="uploads">' +
        '<label class="upbtn" for="up-photo">' + I.camera + 'Prendre une photo<input id="up-photo" type="file" accept="image/*" capture="environment" data-up="photo"></label>' +
        '<label class="upbtn" for="up-video">' + I.video + 'Filmer une vidéo<input id="up-video" type="file" accept="video/*" capture="environment" data-up="video"></label>' +
        '<label class="upbtn" for="up-file">' + I.file + 'Importer un fichier<input id="up-file" type="file" accept="image/*,video/*,application/pdf,.pdf,.doc,.docx" data-up="file"></label></div>';
      if (S.uploading) h += '<div class="list"><div class="media-row"><div class="thumb"><div class="spin" style="width:20px;height:20px;margin:0"></div></div><div class="meta"><strong>' + esc(S.uploading) + "</strong><small>Envoi en cours…</small></div></div></div>";
      if (S.media.length) {
        h += '<div class="list">' + S.media.map(function (m) {
          var th = m.kind === "photo" ? '<div class="thumb" style="background-image:url(\'' + esc(publicUrl(m.path)) + '\')"></div>' : '<div class="thumb">' + (m.kind === "video" ? I.video : I.doc) + "</div>";
          var row = '<div class="media-row">' + th + '<div class="meta"><strong>' + esc(m.name || "Fichier") + "</strong><small>" + (m.kind === "video" ? "Vidéo" : m.kind === "photo" ? "Photo" : "Document") + (m.size_bytes ? " · " + sizeTxt(m.size_bytes) : "") + " · " + (m.show_public ? "visible sur la fiche" : "privé") + '</small></div>' +
            '<input class="switch" type="checkbox" role="switch" aria-label="Visible sur la fiche" data-media-toggle="' + m.id + '"' + (m.show_public ? " checked" : "") + '><button class="iconbtn" aria-label="Supprimer ' + esc(m.name) + '" data-act="ask-del-media" data-id="' + m.id + '">' + I.trash + "</button></div>";
          if (S.confirm && S.confirm.type === "media" && S.confirm.id === m.id) row += '<div class="media-row"><div class="confirm" style="flex:1;padding:0;background:none"><p>Supprimer ce fichier définitivement ?</p><div class="row"><button class="btn ghost" data-act="cancel-confirm">Annuler</button><button class="btn solid-danger" data-act="del-media" data-id="' + m.id + '">Supprimer</button></div></div></div>';
          return row;
        }).join("") + "</div>";
      }
      h += '<p class="cap">50 Mo maximum par fichier. L’interrupteur indique si le fichier est visible par les personnes qui scannent votre QR code.</p></div>';
    } else if (st === 7) {
      var items = [["Nom public et photo", true], ["Contact d’urgence et bouton d’appel", !!P.contact_tel], ["Allergies graves", P.allergie_grave || arr(P.allergies).length || P.allergie_autre], ["Pathologies", arr(P.pathologies).length || P.pathologie_details],
        ["Traitements en cours", arr(P.traitements).length], ["Groupe sanguin et langues", P.groupe_sanguin || arr(P.langues).length], ["Informations complémentaires", P.infos], ["Adresse", P.show_adresse && (P.adresse || P.ville)],
        ["Photos, documents et vidéos (" + S.media.filter(function (m) { return m.show_public; }).length + ")", S.media.some(function (m) { return m.show_public; })]];
      h += '<div class="group">' + groupHead("Visible lors d’un scan") + '<div class="list">' + items.filter(function (x) { return x[1]; }).map(function (x) { return '<div class="cell opt"><span>' + esc(x[0]) + '</span><input class="check" type="checkbox" checked disabled aria-label="Inclus"></div>'; }).join("") +
        '</div><p class="cap">Votre nom complet, votre e-mail et votre téléphone personnel ne sont jamais affichés.</p></div>' +
        '<div class="list"><button class="cell tap" data-act="preview-editor"><span style="flex:1">Aperçu de ma fiche</span>' + I.chevR + "</button></div>" +
        '<div class="group"><div class="list"><label class="cell wide" for="f-consent"><span>J’accepte que ces informations soient visibles par toute personne qui scanne mon QR code</span><input id="f-consent" class="switch" type="checkbox" role="switch"' + (S.consent ? " checked" : "") + '></label></div><p class="cap">Vous pourrez modifier votre fiche ou suspendre votre manchon à tout moment.</p></div>';
    }
    h += '<p class="err" id="err" role="alert"></p></div>';
    var label = st < 7 ? "Continuer" : (getPending() ? "Publier et activer le manchon" : "Publier ma fiche");
    h += bar('<button class="btn primary" data-act="next"' + (S.busy ? " disabled" : "") + ">" + (S.busy ? "Enregistrement…" : label) + "</button>");
    return h;
  }

  // ---------------- Screen: emergency card (public view & preview) ----------------
  function cardFromProfile(P, media) {
    return {
      nom_public: P.nom_public || autoPublic(P) || P.prenom, initiales: initials(P.prenom, P.nom), photo_path: P.photo_path,
      adresse: P.show_adresse ? [P.adresse, [P.code_postal, P.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") : null,
      contact_nom: P.contact_nom, contact_lien: P.contact_lien, contact_tel: P.contact_tel, allergie_grave: P.allergie_grave,
      allergies: arr(P.allergies), allergie_reaction: P.allergie_reaction, stylo_adrenaline: P.stylo_adrenaline, allergie_autre: P.allergie_autre,
      pathologies: arr(P.pathologies), pathologie_details: P.pathologie_details, traitements: arr(P.traitements), traitements_prioritaires: arr(P.traitements_prioritaires),
      groupe_sanguin: P.groupe_sanguin, langues: arr(P.langues), infos: P.infos, updated_at: P.updated_at || new Date().toISOString(),
      media: (media || []).filter(function (m) { return m.show_public; })
    };
  }
  function rows(list) { return list.map(function (t) { return '<div class="cell opt"><span>' + t + "</span></div>"; }).join(""); }
  function vCard(c, mode) {
    var h = "";
    if (mode === "preview") h += '<header class="nav"><button class="back" data-act="close-preview">' + I.chev + 'Retour</button><span class="step">Aperçu</span></header>';
    h += '<header class="urg">' + logo("var(--tint)", 28) + "<strong>Fiche d’urgence</strong><span>PassVital</span></header>" +
      '<div class="stack" style="padding-top:8px"><div class="who">' + avatarHtml(c.photo_path, c.initiales) + "<div><h1>" + esc(c.nom_public || "") + '</h1><p class="sub" style="font-size:13px;margin-top:2px">Informations déclarées par le titulaire</p></div></div>';
    if (c.contact_tel) {
      h += '<div class="group"><a class="btn call" href="tel:' + esc(String(c.contact_tel).replace(/[^+\d]/g, "")) + '">' + I.phone + "Appeler " + esc(c.contact_nom || "le contact d’urgence") + "</a>" +
        '<p class="cap">Contact d’urgence' + (c.contact_lien ? " · " + esc(c.contact_lien) : "") + " · " + esc(c.contact_tel) + "</p></div>";
    }
    var al = arr(c.allergies).map(esc);
    if (c.allergie_autre) al.push(esc(c.allergie_autre));
    var alRows = al.length ? al.slice() : [c.allergie_grave === false ? "Aucune allergie grave déclarée" : "Non renseigné"];
    if (c.allergie_reaction) alRows.push("Réaction : " + esc(c.allergie_reaction));
    if (c.stylo_adrenaline) alRows.push("<strong>Porte un stylo d’adrénaline</strong>");
    h += '<div class="group">' + groupHead("Allergies", "accent") + '<div class="list">' + rows(alRows) + "</div></div>";
    var pa = arr(c.pathologies).map(esc);
    if (c.pathologie_details) pa.push(esc(c.pathologie_details));
    h += '<div class="group">' + groupHead("Pathologies", "accent") + '<div class="list">' + rows(pa.length ? pa : ["Aucune déclarée"]) + "</div></div>";
    var tr = arr(c.traitements).filter(function (t) { return t && t.nom; }).map(function (t) { return esc(t.nom) + (t.dosage || t.frequence ? " – " + esc([t.dosage, t.frequence].filter(Boolean).join(", ")) : ""); });
    if (arr(c.traitements_prioritaires).length) tr.push("<strong>À signaler : " + esc(arr(c.traitements_prioritaires).join(", ")) + "</strong>");
    h += '<div class="group">' + groupHead("Traitements en cours") + '<div class="list">' + rows(tr.length ? tr : ["Aucun déclaré"]) + "</div></div>";
    var inf = [];
    if (c.groupe_sanguin) inf.push("Groupe sanguin : <strong>" + esc(c.groupe_sanguin) + "</strong>");
    if (arr(c.langues).length) inf.push("Langues : " + esc(arr(c.langues).join(", ")));
    if (c.infos) inf.push(esc(c.infos));
    if (c.adresse) inf.push("Adresse : " + esc(c.adresse));
    if (inf.length) h += '<div class="group">' + groupHead("Informations") + '<div class="list">' + rows(inf) + "</div></div>";
    var md = arr(c.media);
    if (md.length) {
      h += '<div class="group">' + groupHead("Photos, documents et vidéos") + '<div class="list"><div class="gallery">' + md.map(function (m) {
        var u = publicUrl(m.path);
        if (m.kind === "photo") return '<a href="' + esc(u) + '" target="_blank" rel="noopener" style="background-image:url(\'' + esc(u) + '\')" aria-label="Photo ' + esc(m.name) + '"></a>';
        return '<a href="' + esc(u) + '" target="_blank" rel="noopener" aria-label="' + esc(m.name) + '">' + (m.kind === "video" ? I.play : I.doc) + "<span>" + esc(m.name || "") + "</span></a>";
      }).join("") + "</div></div></div>";
    }
    h += '<p class="cap">Mis à jour le ' + esc(frDate(c.updated_at)) + ". Ces informations sont déclaratives et ne remplacent pas un avis médical.</p></div>";
    if (mode === "public") {
      h += bar((c.contact_tel ? '<a class="btn call" href="tel:' + esc(String(c.contact_tel).replace(/[^+\d]/g, "")) + '">' + I.phone + "Appeler le contact d’urgence</a>" : "") +
        (S.isOwner ? '<button class="btn text" data-act="dash">Modifier ma fiche</button>' : ""));
    }
    return h;
  }
  function vMessage(title, text, actions) { return navBrand("") + '<div class="stack"><div><h1>' + title + '</h1><p class="sub">' + text + "</p></div></div>" + (actions ? bar(actions) : ""); }

  // ---------------- Render ----------------
  function render() {
    var s = S.screen, h;
    if (s === "loading") h = '<div class="center"><div><div class="spin"></div>Chargement…</div></div>';
    else if (s === "auth") h = vAuth();
    else if (s === "checkmail") h = vCheckMail();
    else if (s === "newpw") h = vNewPw();
    else if (s === "dash") h = vDash();
    else if (s === "choose") h = vChoose();
    else if (s === "activated") h = vActivated();
    else if (s === "editor") h = vEditor();
    else if (s === "public") h = vCard(S.scan.card, "public");
    else if (s === "preview") h = vCard(S.preview, "preview");
    else if (s === "unknown") h = vMessage("Manchon inconnu", "Ce QR code ne correspond à aucun manchon PassVital.");
    else if (s === "suspended") h = vMessage("Manchon suspendu", "Ce manchon a été suspendu par son propriétaire. Aucune information n’est affichée.");
    else if (s === "pendingcard") h = vMessage("Fiche en préparation", "Ce manchon est activé mais sa fiche d’urgence n’est pas encore publiée.", S.user ? '<button class="btn primary" data-act="dash">Mes fiches</button>' : "");
    else h = vMessage("Connexion impossible", "Impossible de charger la page. Vérifiez la connexion internet puis réessayez.", '<button class="btn primary" data-act="reload">Réessayer</button>');
    app.innerHTML = h;
    if (typeof helpSync === "function") helpSync();
  }

  // ---------------- Data ----------------
  async function loadMine() {
    var r = await Promise.all([
      sb.from("profiles").select("*").order("created_at"),
      sb.from("sleeves").select("*").order("label"),
      sb.from("media").select("*").order("created_at")
    ]);
    r.forEach(function (x) { if (x.error) throw x.error; });
    S.profiles = r[0].data; S.sleeves = r[1].data; S.allMedia = r[2].data;
  }
  async function ensureCgu() {
    var flag = null; try { flag = localStorage.getItem("pv-cgu"); } catch (e) {}
    if (flag && S.user) { await sb.from("consent_log").insert({ version: CGU_VERSION }); try { localStorage.removeItem("pv-cgu"); } catch (e) {} }
  }
  async function openDashboard() { S.screen = "loading"; render(); await ensureCgu(); await loadMine(); S.confirm = null; go("dash"); }
  async function openScan() {
    S.screen = "loading"; render();
    var r = await sb.rpc("scan_sleeve", { p_id: scanId });
    if (r.error) throw r.error;
    S.scan = r.data || { status: "unknown" };
    var st = S.scan.status;
    if (st === "active") {
      S.isOwner = false;
      if (S.user) { var o = await sb.from("sleeves").select("id").eq("id", scanId).maybeSingle(); S.isOwner = !!o.data; }
      return go("public");
    }
    if (st === "available") {
      setPending({ id: scanId, label: S.scan.label });
      if (S.user) return openChoose();
      S.authTab = "create"; return go("auth");
    }
    if (st === "pending") return go("pendingcard");
    if (st === "suspended" || st === "revoked") return go("suspended");
    return go("unknown");
  }
  async function openChoose() {
    await ensureCgu();
    await loadMine();
    if (!S.profiles.length) return newProfile();
    S.choice = S.profiles[0].id; go("choose");
  }
  async function afterLogin() {
    if (getPending()) return openChoose();
    return openDashboard();
  }
  async function newProfile() {
    var r = await sb.from("profiles").insert({}).select().single();
    if (r.error) throw r.error;
    S.P = r.data; S.media = []; S.step = 1; S.consent = false; go("editor");
  }
  function editProfile(id) {
    var p = S.profiles.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    S.P = JSON.parse(JSON.stringify(p)); S.media = (S.allMedia || []).filter(function (m) { return m.profile_id === id; });
    S.step = 1; S.consent = !!p.published; go("editor");
  }
  function readStep() {
    if (S.screen !== "editor") return;
    var P = S.P;
    app.querySelectorAll("[data-f]").forEach(function (el) {
      var f = el.getAttribute("data-f");
      if (el.type === "checkbox") P[f] = el.checked; else P[f] = el.value.trim();
    });
    var names = {};
    app.querySelectorAll("[data-arr]").forEach(function (el) { names[el.getAttribute("data-arr")] = true; });
    Object.keys(names).forEach(function (n) {
      P[n] = Array.prototype.map.call(app.querySelectorAll('[data-arr="' + n + '"]:checked'), function (el) { return el.value; });
    });
    app.querySelectorAll("[data-radio]").forEach(function (el) { if (el.checked) P[el.getAttribute("data-radio")] = el.value; });
    if (app.querySelector("[data-t]")) {
      var tr = arr(P.traitements).map(function (t) { return Object.assign({}, t); });
      app.querySelectorAll("[data-t]").forEach(function (el) { var i = +el.getAttribute("data-t"); if (tr[i]) tr[i][el.getAttribute("data-k")] = el.value.trim(); });
      P.traitements = tr;
    }
    var c = $("f-consent"); if (c) S.consent = c.checked;
  }
  async function saveP(extra) {
    var patch = {};
    COLS.forEach(function (c) { if (S.P[c] !== undefined) patch[c] = S.P[c]; });
    if (!patch.nom_public) patch.nom_public = autoPublic(S.P) || null;
    patch.traitements = arr(S.P.traitements).filter(function (t) { return t && (t.nom || t.dosage || t.frequence); });
    Object.assign(patch, extra || {});
    var r = await sb.from("profiles").update(patch).eq("id", S.P.id).select().single();
    if (r.error) throw r.error;
    S.P = r.data;
  }
  function validate(st) {
    var P = S.P;
    if (st === 1 && (!P.prenom || !P.nom)) return "Renseignez le prénom et le nom.";
    if (st === 2 && (!P.contact_nom || !P.contact_tel || P.contact_tel.replace(/\D/g, "").length < 6)) return "Renseignez le nom et un numéro de téléphone valide pour le contact d’urgence.";
    if (st === 7 && !S.consent) return "Activez l’interrupteur de consentement pour publier la fiche.";
    return null;
  }
  async function next() {
    readStep();
    var e = validate(S.step); if (e) return showErr(e);
    S.busy = true; render();
    try {
      if (S.step < 7) { await saveP(); S.busy = false; S.step++; return go("editor"); }
      await saveP({ published: true, consent_at: new Date().toISOString(), consent_version: CONSENT_VERSION });
      await sb.from("consent_log").insert({ profile_id: S.P.id, version: CONSENT_VERSION });
      var p = getPending();
      if (p) {
        var r = await sb.rpc("activate_sleeve", { p_id: p.id, p_profile: S.P.id });
        if (r.error) throw r.error;
        setPending(null);
        S.activated = { id: p.id, label: r.data || p.label, name: S.P.nom_public || S.P.prenom };
        S.busy = false; return go("activated");
      }
      S.busy = false; toast("Fiche publiée"); return openDashboard();
    } catch (err) { S.busy = false; render(); showErr(errText(err)); }
  }
  async function upload(file, kind) {
    if (!file) return;
    if (file.size > MAX_FILE) return toast("Fichier trop lourd : 50 Mo maximum.");
    readStep();
    var ext = ((file.name || "").split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || (file.type.split("/")[1] || "bin").slice(0, 5);
    var path = S.user.id + "/" + S.P.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
    var avatar = kind === "avatar";
    S.uploading = avatar ? null : (file.name || "Fichier"); render();
    try {
      var up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (up.error) throw up.error;
      if (avatar) { S.P.photo_path = path; await saveP(); }
      else {
        var k = /^image\//.test(file.type) ? "photo" : /^video\//.test(file.type) ? "video" : "document";
        var r = await sb.from("media").insert({ profile_id: S.P.id, path: path, kind: k, name: (file.name || (k + "." + ext)).slice(0, 120), size_bytes: file.size }).select().single();
        if (r.error) throw r.error;
        S.media.push(r.data);
      }
      S.uploading = null; render(); toast(avatar ? "Photo ajoutée" : "Fichier ajouté");
    } catch (err) { S.uploading = null; render(); showErr(errText(err)); }
  }

  // ---------------- Events ----------------
  app.addEventListener("input", function (e) {
    if (e.target.id === "f-infos") { var c = $("cnt"); if (c) c.textContent = e.target.value.length + " / 300 caractères"; }
    if (e.target.id === "a-email") S.form.email = e.target.value;
    if (S.screen === "editor" && S.step === 1 && (e.target.id === "f-prenom" || e.target.id === "f-nom")) {
      var np = $("f-nom_public"), pr = $("f-prenom").value, no = $("f-nom").value;
      if (np && (!np.dataset.touched)) np.value = autoPublic({ prenom: pr, nom: no });
    }
    if (e.target.id === "f-nom_public") e.target.dataset.touched = "1";
  });
  app.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "a-cgu") S.form.cgu = t.checked;
    if (t.getAttribute("data-up")) { var f = t.files && t.files[0]; t.value = ""; upload(f, t.getAttribute("data-up") === "avatar" ? "avatar" : null); }
    if (t.name === "choice") S.choice = t.value;
    var mt = t.getAttribute("data-media-toggle");
    if (mt) {
      var m = S.media.filter(function (x) { return x.id === mt; })[0]; if (!m) return;
      m.show_public = t.checked;
      sb.from("media").update({ show_public: t.checked }).eq("id", mt).then(function (r) { if (r.error) toast(errText(r.error)); else { readStep(); render(); } });
    }
  });

  var actions = {
    tab: function (b) { S.form.email = ($("a-email") || {}).value || S.form.email; S.authTab = b.getAttribute("data-tab"); render(); },
    signup: async function () {
      var em = $("a-email").value.trim(), p1 = $("a-pw").value, p2 = $("a-pw2").value, cgu = $("a-cgu").checked;
      S.form.email = em; S.form.cgu = cgu;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return showErr("Saisissez une adresse e-mail valide.");
      if (p1.length < 8 || !/\d/.test(p1)) return showErr("Le mot de passe doit contenir au moins 8 caractères, dont 1 chiffre.");
      if (p1 !== p2) return showErr("Les deux mots de passe ne sont pas identiques.");
      if (!cgu) return showErr("Acceptez les conditions d’utilisation pour continuer.");
      S.busy = true; render();
      var p = getPending();
      var r = await sb.auth.signUp({ email: em, password: p1, options: { emailRedirectTo: BASE + (p ? "?m=" + p.id : "") } });
      S.busy = false;
      if (r.error) { render(); return showErr(errText(r.error)); }
      if (r.data.user && r.data.user.identities && r.data.user.identities.length === 0) { S.authTab = "login"; render(); return showErr("Un compte existe déjà avec cet e-mail. Connectez-vous."); }
      try { localStorage.setItem("pv-cgu", "1"); } catch (e) {}
      if (r.data.session) { S.user = r.data.session.user; return afterLogin(); }
      go("checkmail");
    },
    login: async function () {
      var em = $("a-email").value.trim(), pw = $("a-pw").value; S.form.email = em;
      if (!em || !pw) return showErr("Saisissez votre e-mail et votre mot de passe.");
      S.busy = true; render();
      var r = await sb.auth.signInWithPassword({ email: em, password: pw });
      S.busy = false;
      if (r.error) { render(); return showErr(errText(r.error)); }
      S.user = r.data.user; afterLogin();
    },
    forgot: async function () {
      var em = ($("a-email").value || "").trim(); S.form.email = em;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return showErr("Saisissez d’abord votre adresse e-mail.");
      var r = await sb.auth.resetPasswordForEmail(em, { redirectTo: BASE });
      if (r.error) return showErr(errText(r.error));
      toast("E-mail de réinitialisation envoyé");
    },
    "to-login": function () { S.authTab = "login"; go("auth"); },
    "set-pw": async function () {
      var p1 = $("n-pw").value, p2 = $("n-pw2").value;
      if (p1.length < 8 || !/\d/.test(p1)) return showErr("Le mot de passe doit contenir au moins 8 caractères, dont 1 chiffre.");
      if (p1 !== p2) return showErr("Les deux mots de passe ne sont pas identiques.");
      var r = await sb.auth.updateUser({ password: p1 });
      if (r.error) return showErr(errText(r.error));
      toast("Mot de passe modifié"); openDashboard();
    },
    logout: async function () { await sb.auth.signOut(); S.user = null; S.authTab = "login"; go("auth"); },
    dash: function () { openDashboard(); },
    reload: function () { location.reload(); },
    "new-profile": function () { newProfile(); },
    edit: function (b) { editProfile(b.getAttribute("data-id")); },
    "preview-profile": function (b) {
      var id = b.getAttribute("data-id"), p = S.profiles.filter(function (x) { return x.id === id; })[0];
      S.preview = cardFromProfile(p, (S.allMedia || []).filter(function (m) { return m.profile_id === id; })); S.previewBack = "dash"; go("preview");
    },
    "preview-editor": function () { readStep(); S.preview = cardFromProfile(S.P, S.media); S.previewBack = "editor"; go("preview"); },
    "close-preview": function () { go(S.previewBack || "dash"); },
    choose: async function () {
      var p = getPending(); if (!S.choice) return showErr("Choisissez une fiche.");
      if (S.choice === "new") return newProfile();
      var prof = S.profiles.filter(function (x) { return x.id === S.choice; })[0];
      if (prof && prof.published) {
        S.busy = true; render();
        var r = await sb.rpc("activate_sleeve", { p_id: p.id, p_profile: prof.id });
        S.busy = false;
        if (r.error) { render(); return showErr(errText(r.error)); }
        setPending(null); S.activated = { id: p.id, label: r.data || p.label, name: prof.nom_public || prof.prenom }; return go("activated");
      }
      editProfile(S.choice);
    },
    "open-scan": function (b) { location.href = BASE + "?m=" + encodeURIComponent(b.getAttribute("data-id")); },
    prev: function () { readStep(); if (S.step > 1) { S.step--; go("editor"); } else { saveP().catch(function () {}); getPending() ? openChoose() : openDashboard(); } },
    next: function () { next(); },
    "add-tr": function () { readStep(); S.P.traitements = arr(S.P.traitements).concat([{ nom: "", dosage: "", frequence: "" }]); render(); },
    "del-tr": function (b) { readStep(); var i = +b.getAttribute("data-i"); S.P.traitements = arr(S.P.traitements).filter(function (_, j) { return j !== i; }); render(); },
    "ask-del-media": function (b) { readStep(); S.confirm = { type: "media", id: b.getAttribute("data-id") }; render(); },
    "del-media": async function (b) {
      var id = b.getAttribute("data-id"), m = S.media.filter(function (x) { return x.id === id; })[0]; if (!m) return;
      await sb.storage.from(BUCKET).remove([m.path]);
      var r = await sb.from("media").delete().eq("id", id);
      if (r.error) return toast(errText(r.error));
      S.media = S.media.filter(function (x) { return x.id !== id; }); S.confirm = null; render(); toast("Fichier supprimé");
    },
    "cancel-confirm": function () { readStep(); S.confirm = null; render(); },
    "ask-suspend": function (b) { S.confirm = { type: "suspend", id: b.getAttribute("data-id") }; render(); },
    suspend: async function (b) {
      var r = await sb.rpc("set_sleeve_status", { p_id: b.getAttribute("data-id"), p_status: "suspended" });
      if (r.error || !r.data) return toast("La suspension a échoué.");
      toast("Manchon suspendu"); openDashboard();
    },
    reactivate: async function (b) {
      var r = await sb.rpc("set_sleeve_status", { p_id: b.getAttribute("data-id"), p_status: "active" });
      if (r.error || !r.data) return toast("La réactivation a échoué.");
      toast("Manchon réactivé"); openDashboard();
    }
  };
  app.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
    var fn = actions[b.getAttribute("data-act")]; if (!fn) return;
    e.preventDefault();
    Promise.resolve(fn(b)).catch(function (err) { S.busy = false; render(); showErr(errText(err)); });
  });
  app.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && S.screen === "auth" && e.target.tagName === "INPUT") { var b = app.querySelector('[data-act="signup"],[data-act="login"]'); if (b) b.click(); }
  });

  // ---------------- Assistant d’aide (support) ----------------
  // Réponses fixes, rédigées à l’avance : le robot ne répond qu’avec ces textes.
  // Si la question n’est pas reconnue, il propose d’envoyer la demande au support
  // (table support_requests, via la fonction create_support_request).
  var SUJETS = ["Activation du manchon", "Manchon perdu ou volé", "Ma fiche d’urgence", "Mon compte et connexion", "Autre demande"];
  var FAQ = [
    { id: "activer", q: "Comment activer mon manchon ?", sujet: 0, k: ["activ", "associ", "scann", "qr", "lier", "relier", "nouveau manchon"],
      a: "Scannez le QR code du manchon avec l’appareil photo de votre téléphone. Créez un compte ou connectez-vous, choisissez la fiche à relier (ou créez-en une), puis publiez-la. Le manchon est alors activé et son code s’affiche à l’écran." },
    { id: "perdu", q: "J’ai perdu mon manchon", sujet: 1, k: ["perdu", "perte", "vol", "egare", "suspend", "retrouv", "desactiv"],
      a: "Connectez-vous, ouvrez <strong>Mes fiches</strong> et appuyez sur <strong>Suspendre</strong> à côté du manchon. Plus personne ne verra votre fiche en le scannant. Si vous le retrouvez, appuyez sur <strong>Réactiver</strong>." },
    { id: "modifier", q: "Comment modifier ma fiche ?", sujet: 2, k: ["modif", "chang", "mettre a jour", "mise a jour", "corrig", "edit", "ajout", "supprim"],
      a: "Dans <strong>Mes fiches</strong>, appuyez sur <strong>Modifier la fiche</strong>. Parcourez les étapes puis appuyez sur <strong>Publier ma fiche</strong> à la fin : les changements sont visibles immédiatement lors d’un scan." },
    { id: "mdp", q: "Mot de passe oublié", sujet: 3, k: ["mot de passe", "mdp", "password", "oubli", "connect", "identifi", "login"],
      a: "Sur l’écran <strong>Se connecter</strong>, saisissez votre e-mail puis appuyez sur <strong>Mot de passe oublié ?</strong>. Vous recevrez un lien pour choisir un nouveau mot de passe. Pensez à regarder dans vos courriers indésirables." },
    { id: "visible", q: "Qui peut voir ma fiche ?", sujet: 2, k: ["qui peut", "qui voit", "visible", "voir ma fiche", "confidenti", "donnees", "rgpd", "prive", "securi", "public"],
      a: "Toute personne qui scanne votre manchon actif voit votre fiche d’urgence : nom public, contact d’urgence, allergies, pathologies, traitements et les fichiers que vous avez rendus visibles. Votre nom complet, votre e-mail et votre téléphone personnel ne sont jamais affichés." },
    { id: "proche", q: "Créer une fiche pour un proche", sujet: 2, k: ["enfant", "proche", "famille", "parent", "plusieurs", "autre personne", "deuxieme", "second"],
      a: "Dans <strong>Mes fiches</strong>, appuyez sur <strong>Ajouter une fiche</strong>. Vous pouvez gérer plusieurs fiches avec un seul compte, et chaque fiche peut être reliée à son propre manchon." },
    { id: "email", q: "Je n’ai pas reçu l’e-mail", sujet: 3, k: ["e mail", "email", "mail", "confirmation", "pas recu", "lien"],
      a: "L’e-mail peut mettre quelques minutes à arriver. Vérifiez vos courriers indésirables (spams). Si vous ne le recevez toujours pas, contactez le support : nous vérifierons votre compte." }
  ];
  var URGENCE = ["urgence", "malaise", "accident", "inconscient", "blesse", "saign", "respire", "112", "samu", "pompier"];
  var H = { open: false, view: "chat", msgs: [], sending: false, draft: null, lastAsk: "" };
  var helpEl = $("help");
  I.help = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/><path d="M9.6 9.6a2.5 2.5 0 0 1 4.8.9c0 1.6-2.4 2-2.4 3.3M12 16.6h.01"/></svg>';
  I.send = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

  function norm(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’'\-]/g, " ").replace(/\s+/g, " "); }
  function matchFaq(text) {
    var t = " " + norm(text) + " ";
    var u = t.replace(/(fiche|contact|numero|carte) d urgence/g, " ");
    if (URGENCE.some(function (k) { return u.indexOf(k) >= 0; })) return "urgence";
    var best = null, score = 0;
    FAQ.forEach(function (f) {
      var s = f.k.reduce(function (n, k) { return n + (t.indexOf(k) >= 0 ? 1 : 0); }, 0);
      if (s > score) { score = s; best = f; }
    });
    return best;
  }
  function faqById(id) { return FAQ.filter(function (f) { return f.id === id; })[0]; }
  function menuMsg(text) { return { from: "bot", html: text, menu: true }; }
  function answer(f) {
    if (f === "urgence") {
      H.msgs.push({ from: "bot", html: "Je ne peux pas vous aider pour une urgence médicale. <strong>Appelez immédiatement le 112</strong> (numéro d’urgence européen).", chips: [{ label: "Appeler le 112", href: "tel:112" }, { label: "Autres questions", act: "menu" }] });
      return;
    }
    H.sujet = f.sujet;
    H.msgs.push({ from: "bot", html: f.a, chips: [{ label: "Autres questions", act: "menu" }, { label: "Contacter le support", act: "contact" }] });
  }
  function ask(text) {
    text = String(text || "").trim(); if (!text) return;
    H.msgs.push({ from: "me", html: esc(text) });
    var f = matchFaq(text);
    if (f) answer(f);
    else {
      H.lastAsk = text; H.sujet = 4;
      H.msgs.push({ from: "bot", html: "Je n’ai pas de réponse toute prête à cette question. Je peux la transmettre au support : une personne vous répondra par e-mail.", chips: [{ label: "Envoyer au support", act: "contact", prefill: true }, { label: "Autres questions", act: "menu" }] });
    }
    renderHelp();
  }
  function sleeveChoices() {
    var out = [];
    function add(l) { if (l && out.indexOf(l) < 0) out.push(l); }
    var p = getPending(); if (p) add(p.label);
    if (S.scan && S.scan.label) add(S.scan.label);
    (S.sleeves || []).forEach(function (s) { add(s.label); });
    return out;
  }
  function readHelpForm() {
    if (!H.draft) return;
    var e = $("h-email"), s = $("h-sujet"), sl = $("h-sleeve"), m = $("h-msg");
    if (e) H.draft.email = e.value.trim();
    if (s) H.draft.sujet = +s.value;
    if (sl) H.draft.sleeve = sl.value.trim();
    if (m) H.draft.msg = m.value;
  }
  function helpVisible() { return ["loading", "public", "preview"].indexOf(S.screen) < 0; }
  function chatView() {
    var h = '<div class="help-body" id="help-body"><p class="help-note">En cas d’urgence médicale, appelez le <a href="tel:112">112</a>.</p>';
    H.msgs.forEach(function (m, i) {
      var last = i === H.msgs.length - 1;
      h += '<div class="hmsg ' + (m.from === "me" ? "me" : "bot") + '">' + m.html + "</div>";
      if (last && m.menu) {
        h += '<div class="list hmenu">' + FAQ.map(function (f) { return '<button class="cell tap" data-hact="faq" data-id="' + f.id + '"><span style="flex:1">' + esc(f.q) + "</span>" + I.chevR + "</button>"; }).join("") +
          '<button class="cell tap" data-hact="contact"><span style="flex:1;color:var(--tint);font-weight:600">Contacter le support</span>' + I.chevR + "</button></div>";
      }
      if (last && m.chips) {
        h += '<div class="hchips">' + m.chips.map(function (c) {
          return c.href ? '<a class="hchip" href="' + esc(c.href) + '">' + esc(c.label) + "</a>" : '<button class="hchip" data-hact="' + c.act + '"' + (c.prefill ? ' data-prefill="1"' : "") + ">" + esc(c.label) + "</button>";
        }).join("") + "</div>";
      }
    });
    h += "</div>";
    h += '<form class="help-compose" id="help-compose"><input id="help-q" type="text" maxlength="300" autocomplete="off" enterkeyhint="send" placeholder="Écrivez votre question" aria-label="Votre question"><button class="help-send" type="submit" aria-label="Envoyer">' + I.send + "</button></form>";
    return h;
  }
  function formView() {
    var d = H.draft, ch = sleeveChoices();
    var h = '<div class="help-body"><div class="stack" style="padding-top:4px">' +
      '<p class="sub" style="margin:0 4px">Décrivez votre demande. Le support PassVital vous répondra par e-mail.</p><div class="group"><div class="list">';
    if (S.user) h += '<div class="cell"><span>E-mail</span><span class="val muted">' + esc(S.user.email) + "</span></div>";
    else h += '<label class="cell" for="h-email"><span>E-mail</span><input id="h-email" type="email" autocomplete="email" placeholder="nom@exemple.fr" value="' + esc(d.email) + '"></label>';
    h += '<label class="cell sel" for="h-sujet"><span>Sujet</span><select id="h-sujet">' + SUJETS.map(function (s, i) { return '<option value="' + i + '"' + (i === d.sujet ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("") + "</select></label>";
    if (ch.length) {
      h += '<label class="cell sel" for="h-sleeve"><span>Manchon</span><select id="h-sleeve" class="mono"><option value="">Aucun</option>' + ch.map(function (l) { return '<option value="' + esc(l) + '"' + (l === d.sleeve ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select></label>";
    } else {
      h += '<label class="cell" for="h-sleeve"><span>Manchon</span><input id="h-sleeve" type="text" maxlength="20" autocapitalize="characters" placeholder="PV-XXXX-XXX (facultatif)" value="' + esc(d.sleeve) + '"></label>';
    }
    h += '</div><p class="cap">' + (S.user ? "Votre e-mail et le code du manchon sont ajoutés automatiquement à la demande." : "Le code est imprimé sur votre manchon, sous le QR code.") + "</p></div>" +
      '<div class="group">' + groupHead("Votre message") + '<div class="list"><label class="cell" for="h-msg"><textarea id="h-msg" maxlength="1000" placeholder="Ex. Mon manchon ne s’active pas après le scan…">' + esc(d.msg) + '</textarea></label></div><p class="cap" id="h-cnt">' + (d.msg || "").length + " / 1000 caractères</p></div>" +
      '<p class="err" id="h-err" role="alert"></p><p class="cap">N’indiquez pas d’informations médicales dans ce message. En cas d’urgence, appelez le 112.</p></div></div>' +
      '<div class="help-foot"><button class="btn primary" data-hact="send"' + (H.sending ? " disabled" : "") + ">" + (H.sending ? "Envoi…" : "Envoyer au support") + "</button></div>";
    return h;
  }
  function renderHelp() {
    var vis = helpVisible();
    if (!vis) H.open = false;
    if (H.view === "form") readHelpForm();
    var h = "";
    if (vis && !H.open) h = '<button class="help-fab" id="help-fab" data-hact="open" aria-haspopup="dialog">' + I.help + "<span>Besoin d’aide ?</span></button>";
    if (H.open) {
      var form = H.view === "form";
      h = '<div class="help-scrim" data-hact="close"></div><section class="help-sheet" role="dialog" aria-modal="true" aria-labelledby="help-title"><div class="grab" aria-hidden="true"></div><header class="help-head">' +
        (form ? '<button class="back" data-hact="to-chat">' + I.chev + "Assistant</button>" : '<div class="help-id">' + logo("var(--tint)", 32) + '<div><strong id="help-title">Assistant PassVital</strong><small>Répond tout de suite · support sur demande</small></div></div>') +
        (form ? '<strong id="help-title" class="help-title">Contacter le support</strong>' : "") +
        '<button class="linkbtn" data-hact="close">Fermer</button></header>' + (form ? formView() : chatView()) + "</section>";
    }
    helpEl.innerHTML = h;
    document.body.classList.toggle("help-lock", H.open);
    var b = $("help-body"); if (b && !form) b.scrollTop = b.scrollHeight;
  }
  function hErr(msg) { var e = $("h-err"); if (e) { e.textContent = msg; e.scrollIntoView({ block: "center", behavior: "smooth" }); } else toast(msg); }
  function openHelp() {
    H.open = true; H.view = "chat";
    if (!H.msgs.length) H.msgs.push(menuMsg("Bonjour, je suis l’assistant PassVital. Choisissez une question ou écrivez la vôtre ci-dessous."));
    renderHelp();
    if (window.matchMedia && matchMedia("(pointer: fine)").matches) { var q = $("help-q"); if (q) q.focus(); }
  }
  function closeHelp() { H.open = false; renderHelp(); var f = $("help-fab"); if (f) f.focus(); }
  function openForm(prefill) {
    var ch = sleeveChoices();
    H.draft = { email: (S.user && S.user.email) || S.form.email || "", sujet: H.sujet == null ? 4 : H.sujet, sleeve: ch[0] || "", msg: prefill && H.lastAsk ? H.lastAsk : "" };
    H.view = "form"; renderHelp();
  }
  async function sendSupport() {
    readHelpForm();
    var d = H.draft, email = S.user ? S.user.email : d.email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) return hErr("Saisissez une adresse e-mail valide pour recevoir la réponse.");
    if ((d.msg || "").trim().length < 10) return hErr("Décrivez votre demande en quelques mots (10 caractères minimum).");
    var last = 0; try { last = +localStorage.getItem("pv-help-last") || 0; } catch (x) {}
    if (Date.now() - last < 60000) return hErr("Une demande vient d’être envoyée. Patientez une minute avant d’en envoyer une autre.");
    H.sending = true; renderHelp();
    var r = await sb.rpc("create_support_request", { p_email: email, p_sujet: SUJETS[d.sujet] || SUJETS[4], p_sleeve: d.sleeve || null, p_message: d.msg.trim(), p_page: S.screen });
    H.sending = false;
    if (r.error) {
      renderHelp();
      var m = (r.error.message || "") + " " + (r.error.code || "");
      return hErr(/too_many/.test(m) ? "Trop de demandes envoyées. Réessayez dans quelques minutes."
        : /invalid_email/.test(m) ? "Saisissez une adresse e-mail valide."
        : /PGRST202|Could not find the function|does not exist/i.test(m) ? "Le support n’est pas encore configuré. Réessayez plus tard."
        : errText(r.error));
    }
    try { localStorage.setItem("pv-help-last", String(Date.now())); } catch (x) {}
    H.msgs.push({ from: "me", html: "Demande envoyée : " + esc(SUJETS[d.sujet]) });
    H.msgs.push({ from: "bot", html: "Merci ! Votre demande <strong class=\"mono\">" + esc(r.data) + "</strong> a bien été transmise au support. Vous recevrez une réponse par e-mail à <strong>" + esc(email) + "</strong>.", chips: [{ label: "Autres questions", act: "menu" }, { label: "Fermer", act: "close" }] });
    H.draft = null; H.lastAsk = ""; H.view = "chat"; renderHelp();
  }
  var hActions = {
    open: openHelp, close: closeHelp,
    menu: function () { H.msgs.push(menuMsg("Voici les questions les plus fréquentes :")); renderHelp(); },
    faq: function (b) { var f = faqById(b.getAttribute("data-id")); if (!f) return; H.msgs.push({ from: "me", html: esc(f.q) }); answer(f); renderHelp(); },
    contact: function (b) { openForm(b.getAttribute("data-prefill") === "1"); },
    "to-chat": function () { readHelpForm(); H.view = "chat"; renderHelp(); },
    send: function () { return sendSupport(); }
  };
  helpEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-hact]"); if (!b || b.disabled) return;
    e.preventDefault();
    Promise.resolve(hActions[b.getAttribute("data-hact")](b)).catch(function (err) { H.sending = false; renderHelp(); hErr(errText(err)); });
  });
  helpEl.addEventListener("submit", function (e) {
    if (e.target.id !== "help-compose") return;
    e.preventDefault(); var q = $("help-q"); var v = q.value; q.value = ""; ask(v);
    if (window.matchMedia && matchMedia("(pointer: fine)").matches) { var q2 = $("help-q"); if (q2) q2.focus(); }
  });
  helpEl.addEventListener("input", function (e) { if (e.target.id === "h-msg") { var c = $("h-cnt"); if (c) c.textContent = e.target.value.length + " / 1000 caractères"; } });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && H.open) closeHelp(); });
  function helpSync() { if (!H.open || !helpVisible()) renderHelp(); }

  // ---------------- Boot ----------------
  async function boot() {
    var s = await sb.auth.getSession();
    S.user = s.data.session ? s.data.session.user : null;
    sb.auth.onAuthStateChange(function (ev, session) {
      S.user = session ? session.user : null;
      if (ev === "PASSWORD_RECOVERY") go("newpw");
    });
    if (/type=recovery/.test(location.hash)) return go("newpw");
    if (scanId) return openScan();
    if (S.user) return afterLogin();
    S.authTab = getPending() ? "create" : "login";
    go("auth");
  }
  boot().catch(function (err) { console.error(err); S.screen = "error"; render(); });
})();

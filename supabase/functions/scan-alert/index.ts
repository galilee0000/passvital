// PassVital – Edge Function "scan-alert"
// Called by the public card when someone other than the owner scans a sleeve.
// Sends an e-mail to the emergency contact with the time and, if the person who
// scanned allowed it, their location. Uses Resend (https://resend.com) to send e-mails.
//
// Secrets to set in Supabase > Edge Functions > Secrets:
//   RESEND_API_KEY  re_…                                   (never put it in the web page)
//   ALERT_FROM      PassVital <alertes@votre-domaine.com>  (domain verified in Resend)
//   APP_URL         https://galilee0000.github.io/passvital/   (optional)
//   ALERT_TZ        Europe/Berlin                          (optional, time zone of the e-mail)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase.
// In the function settings, turn OFF "Verify JWT" (the page uses the publishable key).

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const COOLDOWN_MIN = 10; // at most one alert e-mail per sleeve every 10 minutes (+ one location update)
const APP_URL = Deno.env.get("APP_URL") || "https://galilee0000.github.io/passvital/";
const TZ = Deno.env.get("ALERT_TZ") || "Europe/Berlin";
const LOCALES: Record<string, string> = { fr: "fr-FR", en: "en-GB", es: "es-ES", de: "de-DE" };

type Lang = "fr" | "en" | "es" | "de";
const T: Record<Lang, Record<string, string>> = {
  fr: {
    subject: "PassVital : le manchon de {name} vient d’être scanné",
    subjectLoc: "PassVital : position du scan du manchon de {name}",
    hello: "Bonjour {contact},",
    intro: "Le manchon PassVital de <b>{name}</b> vient d’être scanné par une autre personne. Vous recevez ce message car {name} vous a désigné(e) comme contact d’urgence.",
    introLoc: "La personne qui a scanné le manchon de <b>{name}</b> vient de partager sa position.",
    when: "Heure du scan", where: "Position", approx: "Adresse approximative", precision: "précision ± {m} m",
    map: "Ouvrir dans Google Maps", noLoc: "Position non partagée par la personne qui a scanné.",
    advice: "Ce scan peut signifier que {name} a besoin d’aide. Essayez de le/la joindre. En cas d’urgence, appelez le 112.",
    card: "Voir la fiche d’urgence", sleeve: "Manchon",
    footer: "Message automatique envoyé par PassVital. Merci de ne pas y répondre.",
  },
  en: {
    subject: "PassVital: {name}’s sleeve has just been scanned",
    subjectLoc: "PassVital: location of the scan of {name}’s sleeve",
    hello: "Hello {contact},",
    intro: "<b>{name}</b>’s PassVital sleeve has just been scanned by someone else. You are receiving this message because {name} named you as their emergency contact.",
    introLoc: "The person who scanned <b>{name}</b>’s sleeve has just shared their location.",
    when: "Time of scan", where: "Location", approx: "Approximate address", precision: "accuracy ± {m} m",
    map: "Open in Google Maps", noLoc: "The person who scanned did not share their location.",
    advice: "This scan may mean that {name} needs help. Try to reach them. In an emergency, call 112.",
    card: "View the emergency card", sleeve: "Sleeve",
    footer: "Automatic message sent by PassVital. Please do not reply.",
  },
  es: {
    subject: "PassVital: acaban de escanear el brazalete de {name}",
    subjectLoc: "PassVital: ubicación del escaneo del brazalete de {name}",
    hello: "Hola, {contact}:",
    intro: "Otra persona acaba de escanear el brazalete PassVital de <b>{name}</b>. Recibes este mensaje porque {name} te ha designado como contacto de emergencia.",
    introLoc: "La persona que escaneó el brazalete de <b>{name}</b> acaba de compartir su ubicación.",
    when: "Hora del escaneo", where: "Ubicación", approx: "Dirección aproximada", precision: "precisión ± {m} m",
    map: "Abrir en Google Maps", noLoc: "La persona que escaneó no compartió su ubicación.",
    advice: "Este escaneo puede significar que {name} necesita ayuda. Intenta contactar con él/ella. En caso de emergencia, llama al 112.",
    card: "Ver la ficha de emergencia", sleeve: "Brazalete",
    footer: "Mensaje automático enviado por PassVital. Por favor, no respondas.",
  },
  de: {
    subject: "PassVital: Das Armband von {name} wurde gerade gescannt",
    subjectLoc: "PassVital: Standort des Scans von {name}s Armband",
    hello: "Hallo {contact},",
    intro: "Das PassVital-Armband von <b>{name}</b> wurde gerade von einer anderen Person gescannt. Sie erhalten diese Nachricht, weil {name} Sie als Notfallkontakt angegeben hat.",
    introLoc: "Die Person, die das Armband von <b>{name}</b> gescannt hat, hat gerade ihren Standort geteilt.",
    when: "Zeitpunkt des Scans", where: "Standort", approx: "Ungefähre Adresse", precision: "Genauigkeit ± {m} m",
    map: "In Google Maps öffnen", noLoc: "Die Person, die gescannt hat, hat ihren Standort nicht geteilt.",
    advice: "Dieser Scan kann bedeuten, dass {name} Hilfe braucht. Versuchen Sie, {name} zu erreichen. Im Notfall rufen Sie die 112 an.",
    card: "Notfallausweis ansehen", sleeve: "Armband",
    footer: "Automatische Nachricht von PassVital. Bitte nicht antworten.",
  },
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const num = (x: unknown, min: number, max: number) => (typeof x === "number" && isFinite(x) && x >= min && x <= max ? x : null);

async function reverseGeocode(lat: number, lng: number, lang: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}&accept-language=${lang}`, {
      headers: { "User-Agent": "PassVital scan alert (contact: support PassVital)" }, signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d.display_name === "string" ? d.display_name.slice(0, 300) : null;
  } catch { return null; }
}

function emailHtml(t: Record<string, string>, v: Record<string, string>, loc: { lat: number; lng: number; acc: number | null; addr: string | null } | null, locationUpdate: boolean) {
  const row = (k: string, val: string) =>
    `<tr><td style="padding:10px 0;color:#6b7280;font-size:14px;width:150px;vertical-align:top">${k}</td><td style="padding:10px 0;font-size:15px;color:#111827">${val}</td></tr>`;
  let rows = locationUpdate ? "" : row(esc(t.when), esc(v.when));
  if (loc) {
    const maps = `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
    rows += row(esc(t.where), `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}${loc.acc ? ` <span style="color:#6b7280">(${esc(fill(t.precision, { m: String(loc.acc) }))})</span>` : ""}<br><a href="${maps}" style="color:#0B5CAD;font-weight:600">${esc(t.map)}</a>`);
    if (loc.addr) rows += row(esc(t.approx), esc(loc.addr));
  } else {
    rows += row(esc(t.where), `<span style="color:#6b7280">${esc(t.noLoc)}</span>`);
  }
  rows += row(esc(t.sleeve), `<span style="font-family:monospace">${esc(v.label)}</span>`);
  return `<!doctype html><html><body style="margin:0;background:#F2F2F7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0B5CAD;padding:18px 24px;color:#fff;font-size:18px;font-weight:700">✚ PassVital</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:16px;color:#111827">${esc(fill(t.hello, v))}</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#111827">${fill(locationUpdate ? t.introLoc : t.intro, { name: esc(v.name) })}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E5E7EB;border-bottom:1px solid #E5E7EB">${rows}</table>
<p style="margin:16px 0;font-size:15px;line-height:1.5;color:#111827"><b>${esc(fill(t.advice, { name: v.name }))}</b></p>
<p style="margin:0"><a href="${esc(v.cardUrl)}" style="display:inline-block;background:#0B5CAD;color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px">${esc(t.card)}</a></p>
</td></tr>
<tr><td style="padding:14px 24px;background:#F9FAFB;color:#6b7280;font-size:12px">${esc(t.footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const sleeveId = String(body.sleeve || "").toLowerCase();
  if (!/^[a-z0-9]{6,32}$/.test(sleeveId)) return json({ error: "bad_sleeve" }, 400);
  const lat = num(body.lat, -90, 90), lng = num(body.lng, -180, 180);
  const acc = num(body.accuracy, 0, 100000);
  const hasLoc = lat !== null && lng !== null;

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: sleeve } = await db.from("sleeves").select("id,label,status,profile_id").eq("id", sleeveId).maybeSingle();
  if (!sleeve || sleeve.status !== "active" || !sleeve.profile_id) return json({ status: "inactive" });
  const { data: p } = await db.from("profiles")
    .select("id,nom_public,prenom,contact_nom,contact_email,alerte_scan,alert_lang,published")
    .eq("id", sleeve.profile_id).maybeSingle();
  if (!p || !p.published) return json({ status: "inactive" });

  const enabled = !!p.alerte_scan && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.contact_email || "");
  const lang = (["fr", "en", "es", "de"].includes(p.alert_lang) ? p.alert_lang : "fr") as Lang;
  const t = T[lang];
  const name = p.nom_public || p.prenom || "PassVital";
  const since = new Date(Date.now() - COOLDOWN_MIN * 60000).toISOString();
  const { data: recent } = await db.from("scan_events").select("*").eq("sleeve_id", sleeveId).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  // A scan was already reported a few minutes ago: only send the location if it was missing.
  let locationUpdate = false, eventId: number;
  if (recent) {
    if (!hasLoc || recent.lat !== null) return json({ status: "recent", alerted: enabled });
    locationUpdate = true; eventId = recent.id;
  } else {
    const { data: ev, error } = await db.from("scan_events").insert({
      sleeve_id: sleeveId, profile_id: p.id, lat, lng, accuracy_m: acc === null ? null : Math.round(acc),
      location_at: hasLoc ? new Date().toISOString() : null, email_status: enabled ? "pending" : (p.alerte_scan ? "no_email" : "disabled"),
    }).select("id").single();
    if (error) return json({ error: "log_failed" }, 500);
    eventId = ev.id;
  }

  const addr = hasLoc ? await reverseGeocode(lat!, lng!, lang) : null;
  if (locationUpdate) {
    await db.from("scan_events").update({ lat, lng, accuracy_m: acc === null ? null : Math.round(acc), adresse_approx: addr, location_at: new Date().toISOString() }).eq("id", eventId);
  } else if (addr) {
    await db.from("scan_events").update({ adresse_approx: addr }).eq("id", eventId);
  }
  if (!enabled) return json({ status: "logged", alerted: false });

  const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("ALERT_FROM");
  if (!key || !from) { await db.from("scan_events").update({ email_status: "failed" }).eq("id", eventId); return json({ error: "email_not_configured" }, 500); }

  const when = new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: "full", timeStyle: "short", timeZone: TZ }).format(new Date()) + ` (${TZ.split("/").pop()!.replace("_", " ")})`;
  const v = { name, contact: p.contact_nom || "", when, label: sleeve.label, cardUrl: `${APP_URL}?m=${sleeveId}&lang=${lang}` };
  const loc = hasLoc ? { lat: lat!, lng: lng!, acc: acc === null ? null : Math.round(acc), addr } : null;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [p.contact_email], subject: fill(locationUpdate ? t.subjectLoc : t.subject, { name }), html: emailHtml(t, v, loc, locationUpdate) }),
  });
  const status = r.ok ? (locationUpdate ? "location_sent" : "sent") : "failed";
  if (!locationUpdate || r.ok) await db.from("scan_events").update({ email_status: status }).eq("id", eventId);
  return json({ status: r.ok ? "sent" : "email_failed", alerted: r.ok });
});

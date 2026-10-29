/* Portadas y locuciones: añade cortinilla/créditos a vídeos y locuciones a audios, todo en el navegador.
   Vídeo: ffmpeg.wasm. Si el vídeo es H.264 con audio AAC, solo se codifican la portada y los
   créditos con los mismos parámetros y se concatenan sin recodificar el original. Si no, se recodifica todo.
   Voz sintética: Piper (onnxruntime-web + piper_phonemize), con voces de rhasspy/piper-voices. */
import { FFmpeg } from "./vendor/ffmpeg/index.js";

const CORE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/";
const ORT = "https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/";
const PHON = "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/";
const VOICES_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/";
const VOICES = {
  "davefx": ["es_ES/davefx/medium/es_ES-davefx-medium.onnx", null],
  "sharvard-F": ["es_ES/sharvard/medium/es_ES-sharvard-medium.onnx", "F"],
  "sharvard-M": ["es_ES/sharvard/medium/es_ES-sharvard-medium.onnx", "M"],
  "claude-mx": ["es_MX/claude/high/es_MX-claude-high.onnx", null],
};
const LIC = {
  "by": ["Atribución 4.0 Internacional", "https://creativecommons.org/licenses/by/4.0/deed.es", "CC BY 4.0"],
  "by-sa": ["Atribución-CompartirIgual 4.0 Internacional", "https://creativecommons.org/licenses/by-sa/4.0/deed.es", "CC BY-SA 4.0"],
};
const VIDEO_EXT = ["mp4", "m4v", "mov", "mkv", "webm", "avi", "wmv", "flv", "mts", "m2ts", "3gp", "mpg", "mpeg"];
const AUDIO_EXT = ["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac", "wma", "webm", "aiff", "aif"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const URJC_RED = "#cb0017";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const lines = s => s.split("\n").map(x => x.trim()).filter(Boolean);
const joinY = arr => arr.length <= 1 ? (arr[0] || "") : arr.slice(0, -1).join(", ") + " y " + arr[arr.length - 1];
const extOf = n => (n.match(/\.([^.]+)$/) || [, ""])[1].toLowerCase();
const baseOf = n => n.replace(/\.[^.]+$/, "");
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtSize = b => b > 1e9 ? (b / 1e9).toFixed(1) + " GB" : b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " kB";
const fmtTime = s => { s = Math.round(s); const m = Math.floor(s / 60); return m ? `${m} min ${s % 60} s` : `${s} s`; };

/* ---------- Estado ---------- */
const S = {
  kind: "video", voz: "sint", prev: "portada",
  files: [],            // {file, path, title, state, msg, row}
  imgs: { portada: null, cierre: null },
  rec: { entrada: null, cierre: null },   // Blob grabado o subido
  outDir: null, running: false, cancel: false,
  textsDirty: { entrada: false, cierre: false },
};

/* ---------- Datos (con los de «Textos listos») ---------- */
const KEY = "portadas-2027";
const FIELDS = ["d-coleccion", "d-portitulo", "d-autores", "d-asig", "d-grados", "d-fecha", "d-anio", "d-lic", "d-serie", "d-ia",
  "v-portada", "v-cierre", "v-ia", "v-d-portada", "v-d-ia", "v-d-cierre", "a-entrada", "a-cierre", "a-concierre", "a-voz"];

function loadData() {
  const now = new Date();
  $("#d-fecha").value = `${MESES[now.getMonth()][0].toUpperCase()}${MESES[now.getMonth()].slice(1)} de ${now.getFullYear()}`;
  $("#d-anio").value = now.getFullYear();
  let t = {}, own = null;
  try { t = JSON.parse(store.get("textos-2027") || "{}"); } catch (e) {}
  try { own = JSON.parse(store.get(KEY) || "null"); } catch (e) {}
  if (t.nombre || t.autores) {
    if (t.nombre) { $("#d-asig").value = t.nombre; $("#d-coleccion").value = `Materiales de la asignatura ${t.nombre}`; }
    if (t.autores) $("#d-autores").value = lines(t.autores).map(l => l.split(",")[0].trim()).join("\n");
    if (t.grados) $("#d-grados").value = t.grados;
    if (t.anio) $("#d-anio").value = t.anio;
    if (t.lic) $("#d-lic").value = t.lic;
    if (t.serie) $("#d-serie").value = t.serie;
    if (t.ia) $("#d-ia").value = t.ia;
    $("#datos-origen").innerHTML = `Datos cargados de <a href="textos.html">Textos listos</a>. Puedes cambiarlos aquí.`;
  }
  if (own) {
    FIELDS.forEach(id => {
      const el = $("#" + id); if (!el || own[id] === undefined) return;
      if (el.type === "checkbox") el.checked = own[id]; else el.value = own[id];
    });
    S.textsDirty = own._dirty || S.textsDirty;
    if (own._kind) S.kind = own._kind;
    if (own._voz) S.voz = own._voz;
  }
  $("#v-ia").checked = own && own["v-ia"] !== undefined ? own["v-ia"] : !!$("#d-ia").value.trim();
}
function saveData() {
  const o = { _dirty: S.textsDirty, _kind: S.kind, _voz: S.voz };
  FIELDS.forEach(id => { const el = $("#" + id); if (el) o[id] = el.type === "checkbox" ? el.checked : el.value; });
  store.set(KEY, JSON.stringify(o));
}
function data() {
  const autores = lines($("#d-autores").value);
  const lic = LIC[$("#d-lic").value];
  return {
    coleccion: $("#d-coleccion").value.trim() || "Materiales de la asignatura",
    porTitulo: $("#d-portitulo").checked,
    autores, autoresTxt: joinY(autores) || "Autores",
    asig: $("#d-asig").value.trim(), grados: lines($("#d-grados").value),
    fecha: $("#d-fecha").value.trim(), anio: $("#d-anio").value.trim() || String(new Date().getFullYear()),
    licKey: $("#d-lic").value, licName: lic[0], licUrl: lic[1], licShort: lic[2],
    serie: $("#d-serie").value.trim().replace(/\/$/, "") || "https://tv.urjc.es",
    ia: lines($("#d-ia").value),
  };
}
const titleFor = (f, d) => d.porTitulo ? (f.title.trim() || d.coleccion) : d.coleccion;
function titleFromName(name) {
  let t = baseOf(name).replace(/[_]+/g, " ").replace(/^\s*\d+\s*[-.)–—]?\s*/, "").replace(/\s+/g, " ").trim();
  if (!t) t = baseOf(name);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ---------- Textos de las locuciones ---------- */
function defaultTexts() {
  const d = data();
  const quien = d.autores.length > 1 ? `Autores: ${d.autoresTxt}.` : `Autoría: ${d.autoresTxt}.`;
  const asig = d.asig ? ` Asignatura ${d.asig}${d.grados.length ? ", del " + joinY(d.grados) : ""}.` : "";
  const entrada = `{titulo}. Material docente en abierto de la Universidad Rey Juan Carlos. ${quien}${asig} ` +
    `Publicado en TV URJC${d.fecha ? ", " + d.fecha.toLowerCase() : ""}, con la licencia Creative Commons ${d.licName}.` + iaSpoken(d);
  const cierre = `Este audio es material docente en abierto de la Universidad Rey Juan Carlos. ` +
    `Copyright ${d.anio}, ${d.autoresTxt}. Algunos derechos reservados. ` +
    `Se distribuye bajo la licencia ${d.licName} de Creative Commons, que puedes consultar en la web de Creative Commons.`;
  return { entrada, cierre };
}
function iaSpoken(d) {
  if (!d.ia.length) return "";
  return ` Este audio incluye contenidos creados con herramientas de inteligencia artificial generativa: ${d.ia.map(x => x.replace(/\.$/, "")).join("; ")}. ` +
    `Todo el contenido ha sido revisado y validado por ${d.autores.length > 1 ? "los autores" : "su autor o autora"}.`;
}
function refreshTexts(force) {
  const t = defaultTexts();
  ["entrada", "cierre"].forEach(k => { if (force || !S.textsDirty[k]) { $("#a-" + k).value = t[k]; S.textsDirty[k] = false; } });
}
function spokenEntrada(f, d) {
  const title = S.voz === "mic" ? d.coleccion : titleFor(f, d);
  return $("#a-entrada").value.replace(/\{titulo\}/g, title).trim();
}
// Debajo del texto de entrada: cómo queda con el hueco {titulo} relleno
function renderSaid() {
  const el = $("#a-entrada-said"), d = data();
  if (!$("#a-entrada").value.includes("{titulo}")) { el.innerHTML = ""; return; }
  const f = S.files[0] || { title: d.coleccion };
  const who = S.voz === "mic" ? "Lo que leerás al grabar:" : S.files[0] ? `Así sonará en «${esc(S.files[0].file.name)}»:` : "Así sonará (con el título común, hasta que elijas los ficheros):";
  el.innerHTML = `<strong>${who}</strong>${esc(spokenEntrada(f, d))}`;
}

/* ---------- Diapositivas (canvas) ---------- */
const badges = {};
function badge(key) {
  if (!badges[key]) badges[key] = new Promise(res => {
    const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = `assets/img/cc-${key}.svg`;
  });
  return badges[key];
}
let fontsReady = null;
const ensureFonts = () => fontsReady ||= Promise.all(["400", "600", "700", "800"].map(w => document.fonts.load(`${w} 40px Inter`))).catch(() => {});
const FONT = '"Inter", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';

function wrap(ctx, text, maxW) {
  const out = [];
  String(text).split("\n").forEach(par => {
    let line = "";
    par.split(/\s+/).filter(Boolean).forEach(w => {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width <= maxW || !line) line = t; else { out.push(line); line = w; }
    });
    // palabras larguísimas (URL): partir por caracteres
    if (line) out.push(line);
  });
  return out.flatMap(l => {
    if (ctx.measureText(l).width <= maxW) return [l];
    const parts = []; let cur = "";
    for (const ch of l) { if (ctx.measureText(cur + ch).width > maxW && cur) { parts.push(cur); cur = ch; } else cur += ch; }
    if (cur) parts.push(cur); return parts;
  });
}
// Bloque de texto: devuelve la altura usada. Si draw=false solo mide.
function block(ctx, text, x, y, maxW, size, { weight = 400, color = "#1c1b1a", lh = 1.25, maxLines = 99, draw = true, align = "left", spacing = 0 } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = spacing ? spacing + "px" : "0px";
  let ls = wrap(ctx, text, maxW);
  if (ls.length > maxLines) { ls = ls.slice(0, maxLines); ls[maxLines - 1] = ls[maxLines - 1].replace(/\s*\S*$/, "") + "…"; }
  if (draw) {
    ctx.fillStyle = color; ctx.textBaseline = "top"; ctx.textAlign = align;
    ls.forEach((l, i) => ctx.fillText(l, align === "center" ? x + maxW / 2 : x, y + i * size * lh));
  }
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  return ls.length * size * lh;
}

async function drawSlide(canvas, kind, f, d) {
  await ensureFonts();
  const W = canvas.width, H = canvas.height, ctx = canvas.getContext("2d");
  const u = Math.min(W, H) / 1080;              // unidad: 1 px a 1080p
  const portrait = H > W;
  const m = Math.round((portrait ? 70 : 110) * u);
  const cw = W - 2 * m - 18 * u;
  const x0 = m + 18 * u;
  const img = await badge(d.licKey);

  if ((kind === "portada" || kind === "cierre") && $(`#v-${kind}`).value === "img") {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const im = S.imgs[kind];
    if (im) { const k = Math.min(W / im.width, H / im.height); ctx.drawImage(im, (W - im.width * k) / 2, (H - im.height * k) / 2, im.width * k, im.height * k); }
    else block(ctx, "Elige una imagen", 0, H / 2 - 30 * u, W, 50 * u, { color: "#fff", align: "center", weight: 600 });
    return;
  }

  // Fondo y franja URJC
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = URJC_RED; ctx.fillRect(0, 0, Math.round(22 * u), H);
  const muted = "#5f5c58";

  // Ajuste de tamaño: si no cabe, se reduce todo y se vuelve a medir
  for (let k = 1; k > 0.45; k -= 0.07) {
    const s = v => v * u * k;
    const plan = [];   // [texto, tamaño, opciones, espacioDespués]
    let footH = 0;
    if (kind === "portada") {
      plan.push(["MATERIAL DOCENTE EN ABIERTO DE LA UNIVERSIDAD REY JUAN CARLOS", s(26), { weight: 700, color: URJC_RED, spacing: s(2) }, s(portrait ? 60 : 44)]);
      plan.push([titleFor(f, d), s(portrait ? 82 : 78), { weight: 800, maxLines: portrait ? 6 : 3, lh: 1.12 }, s(34)]);
      plan.push([d.autores.join(" · ") || "Autores", s(38), { weight: 600 }, s(30)]);
      if (d.asig) plan.push([`Asignatura: ${d.asig}`, s(32), { color: "#33312e" }, s(8)]);
      if (d.grados.length) plan.push([d.grados.join("\n"), s(28), { color: muted }, s(8)]);
      footH = s(118);
    } else if (kind === "ia") {
      plan.push(["DECLARACIÓN DE USO DE INTELIGENCIA ARTIFICIAL GENERATIVA", s(26), { weight: 700, color: URJC_RED, spacing: s(2) }, s(36)]);
      plan.push(["Este vídeo incluye contenidos creados con herramientas de inteligencia artificial generativa:", s(40), { weight: 700, lh: 1.2 }, s(24)]);
      (d.ia.length ? d.ia : ["(Escribe los usos en el paso 2)"]).forEach(x => plan.push(["•  " + x.replace(/\.$/, "") + ".", s(34), { color: "#33312e" }, s(10)]));
      plan.push([`Todo el contenido ha sido revisado, editado y validado por ${d.autores.length > 1 ? "los autores, que asumen" : "el autor o la autora, que asume"} la plena responsabilidad sobre la versión final.`, s(30), { color: muted }, 0]);
      plan[plan.length - 2][3] = s(24);
    } else {
      plan.push(["Material docente en abierto de la Universidad Rey Juan Carlos", s(40), { weight: 700 }, s(26)]);
      plan.push([`© ${d.anio} ${d.autoresTxt}`, s(36), { weight: 600 }, s(10)]);
      plan.push(["Algunos derechos reservados", s(32), { color: "#33312e" }, s(28)]);
      plan.push([`Este vídeo se distribuye bajo la licencia «${d.licName}» de Creative Commons, disponible en`, s(32), { color: "#33312e" }, s(6)]);
      plan.push([d.licUrl, s(30), { color: URJC_RED, weight: 600 }, s(36)]);
      plan.push([`Disponible en TV URJC: ${d.serie}`, s(28), { color: muted }, 0]);
      footH = s(110);
    }
    const total = plan.reduce((h, [t, sz, o, after]) => h + block(ctx, t, x0, 0, cw, sz, { ...o, draw: false }) + after, 0);
    if (total + footH > H - 2 * m && k > 0.5) continue;

    // Dibujar
    let y = kind === "portada" ? m + Math.max(0, H - 2 * m - footH - total) * 0.4 : Math.max(m, (H - total - footH) / 2);
    if (kind === "cierre" && img) {
      const bh = s(84), bw = bh * img.width / img.height;
      ctx.drawImage(img, x0, y, bw, bh); y += bh + s(36);
      footH = 0;
    }
    plan.forEach(([t, sz, o, after]) => { y += block(ctx, t, x0, y, cw, sz, o) + after; });

    if (kind === "portada") {
      const fy = H - m - s(70);
      ctx.fillStyle = "#e3e1dd"; ctx.fillRect(x0, fy - s(26), cw, Math.max(1, s(2)));
      let tx = x0, tw = cw;
      if (img) { const bh = s(70), bw = bh * img.width / img.height; ctx.drawImage(img, x0 + cw - bw, fy, bw, bh); tw = cw - bw - s(30); }
      const l1 = [d.fecha, `Licencia ${d.licShort}`].filter(Boolean).join(" · ");
      const h1 = block(ctx, l1, tx, fy, tw, s(26), { weight: 600, color: "#33312e", maxLines: 1 });
      block(ctx, `Disponible en TV URJC: ${d.serie}`, tx, fy + h1 + s(4), tw, s(24), { color: muted, maxLines: 2, lh: 1.2 });
    }
    return;
  }
}

async function slidePNG(kind, f, d, W, H) {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  await drawSlide(c, kind, f, d);
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

let prevTimer;
function renderPreview() {
  clearTimeout(prevTimer);
  prevTimer = setTimeout(async () => {
    if (S.kind !== "video") return;
    const d = data(), f = S.files[0] || { title: titleFromName("01 - Título del vídeo.mp4") };
    const c = $("#preview");
    if (S.prev === "ia" && !$("#v-ia").checked) {
      const ctx = c.getContext("2d"); ctx.fillStyle = "#f3f2f0"; ctx.fillRect(0, 0, c.width, c.height);
      block(ctx, "Sin declaración de IA (actívala a la izquierda)", 0, c.height / 2 - 30, c.width, 48, { color: "#5f5c58", align: "center", weight: 600 });
      return;
    }
    if (S.prev === "cierre" && $("#v-cierre").value === "no") {
      const ctx = c.getContext("2d"); ctx.fillStyle = "#f3f2f0"; ctx.fillRect(0, 0, c.width, c.height);
      block(ctx, "Sin créditos finales", 0, c.height / 2 - 30, c.width, 48, { color: "#5f5c58", align: "center", weight: 600 });
      return;
    }
    await drawSlide(c, S.prev, f, d);
    $("#preview-note").textContent = S.files[0] ? `Vista previa con «${S.files[0].file.name}». Cada vídeo lleva la portada a su tamaño.` : "Vista previa de ejemplo. Elige tus ficheros en el paso 4.";
  }, 120);
}

/* ---------- Descargas con caché ---------- */
async function fetchCached(url, onProgress) {
  let cache = null;
  try { cache = await caches.open("portadas-v1"); const hit = await cache.match(url); if (hit) return await hit.blob(); } catch (e) { cache = null; }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url} (error ${res.status})`);
  const total = +res.headers.get("content-length") || 0;
  let blob;
  if (res.body && res.body.getReader) {
    const rd = res.body.getReader(), chunks = []; let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); got += value.length; onProgress && onProgress(got, total); }
    blob = new Blob(chunks);
  } else blob = await res.blob();
  try { if (cache) await cache.put(url, new Response(blob)); } catch (e) {}
  return blob;
}
const loadScript = src => new Promise((res, rej) => {
  if ([...document.scripts].some(s => s.src === src)) return res();
  const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("No se pudo cargar " + src));
  document.head.appendChild(s);
});

/* ---------- ffmpeg ---------- */
let ff = null, ffLoad = null, logBuf = [];
function log(msg) {
  logBuf.push(msg); if (logBuf.length > 400) logBuf.splice(0, logBuf.length - 400);
  $("#log").textContent = logBuf.join("\n");
}
function getFF() {
  if (ffLoad) return ffLoad;
  ffLoad = (async () => {
    const st = $("#engine");
    const show = (got, total) => st.textContent = `Descargando el motor de vídeo… ${total ? Math.round(got / total * 100) + " %" : fmtSize(got)}`;
    st.textContent = "Preparando el motor de vídeo…";
    const [js, wasm] = await Promise.all([fetchCached(CORE + "ffmpeg-core.js"), fetchCached(CORE + "ffmpeg-core.wasm", show)]);
    const f = new FFmpeg();
    f.on("log", ({ message }) => log(message));
    await f.load({
      coreURL: URL.createObjectURL(new Blob([js], { type: "text/javascript" })),
      wasmURL: URL.createObjectURL(new Blob([wasm], { type: "application/wasm" })),
    });
    await f.createDir("/in");
    st.textContent = "";
    ff = f; return f;
  })();
  ffLoad.catch(() => { ffLoad = null; });
  return ffLoad;
}
class FFError extends Error {}
async function run(args) {
  log("$ ffmpeg " + args.map(a => /\s/.test(a) ? `"${a}"` : a).join(" "));
  const t = performance.now();
  const ret = await ff.exec(args);
  log(`(${((performance.now() - t) / 1000).toFixed(1)} s)`);
  if (S.cancel) throw new Error("Cancelado");
  if (ret !== 0) throw new FFError("ffmpeg terminó con error " + ret + " (mira el registro técnico)");
}
// Si el motor se cuelga (no un error normal de ffmpeg), se reinicia para el siguiente fichero
function resetFF() { try { ff && ff.terminate(); } catch (e) {} ff = null; ffLoad = null; }
async function probe(path) {
  await ff.ffprobe(["-v", "error", "-show_streams", "-show_format", "-of", "json", path, "-o", "/probe.json"]);
  const j = JSON.parse(await ff.readFile("/probe.json", "utf8"));
  await ff.deleteFile("/probe.json");
  return j;
}
async function rm(...paths) { for (const p of paths) { try { await ff.deleteFile(p); } catch (e) {} } }
async function withInput(file, fn) {
  await ff.mount("WORKERFS", { files: [file] }, "/in");
  try { return await fn("/in/" + file.name); } finally { try { await ff.unmount("/in"); } catch (e) {} }
}
const rate = r => { const [a, b] = String(r || "0/1").split("/").map(Number); return b ? a / b : a; };
const quote = p => "'" + p.replace(/'/g, "'\\''") + "'";

/* ---------- Vídeo ---------- */
function videoPlan(info) {
  const v = info.streams.find(s => s.codec_type === "video" && !(s.disposition && s.disposition.attached_pic));
  if (!v) throw new Error("No tiene pista de vídeo");
  const a = info.streams.find(s => s.codec_type === "audio");
  const rot = Math.abs(Math.round(+((v.side_data_list || []).find(x => x.rotation !== undefined) || {}).rotation || +(v.tags && v.tags.rotate) || 0)) % 360;
  let fps = v.avg_frame_rate && rate(v.avg_frame_rate) > 1 && rate(v.avg_frame_rate) <= 120 ? v.avg_frame_rate : v.r_frame_rate;
  if (!(rate(fps) > 1 && rate(fps) <= 120)) fps = "30";
  const pix = v.pix_fmt;
  const prof = { "High": "high", "Main": "main", "Constrained Baseline": "baseline", "Baseline": "baseline" }[v.profile];
  const aacOk = !a || (a.codec_name === "aac" && (a.profile || "LC") === "LC");
  let mode = "slow";
  // HEVC y VP9 no se pueden concatenar sin recodificar de forma fiable (y VP9 cuelga ffmpeg.wasm)
  if (!rot && v.codec_name === "h264" && prof && /^yuvj?420p$/.test(pix) && aacOk) mode = "mp4";
  return { v, a, rot, fps, prof, mode, dur: +info.format.duration || +v.duration || 0 };
}

async function slidesFor(f, d, W, H) {
  const pre = [{ kind: "portada", dur: +$("#v-d-portada").value || 5 }];
  if ($("#v-ia").checked) pre.push({ kind: "ia", dur: +$("#v-d-ia").value || 6 });
  const post = $("#v-cierre").value === "no" ? [] : [{ kind: "cierre", dur: +$("#v-d-cierre").value || 6 }];
  for (const s of [...pre, ...post]) {
    s.path = `/${s.kind}.png`;
    await ff.writeFile(s.path, await slidePNG(s.kind, f, d, W, H));
  }
  return { pre, post };
}

// Imagen fija: se convierte una sola vez y se repite (con -loop 1 se decodifica en cada fotograma, mucho más lento)
const still = (i, s, fps, convert) =>
  `[${i}:v]${convert},loop=loop=${Math.max(0, Math.round(s.dur * rate(fps)) - 1)}:size=1:start=0,setpts=N/(${fps})/TB`;

// Segmento (portada o créditos) codificado con los parámetros del original
async function encodeSegment(slides, P, out) {
  const { v, a, fps } = P;
  const args = ["-y"];
  slides.forEach(s => args.push("-i", s.path));
  const total = slides.reduce((t, s) => t + s.dur, 0);
  const matrix = v.color_space === "bt709" ? "bt709" : "bt601";
  const full = v.pix_fmt === "yuvj420p" || v.color_range === "pc";
  const sar = (v.sample_aspect_ratio && v.sample_aspect_ratio !== "0:1" ? v.sample_aspect_ratio : "1:1").replace(":", "/");
  let fc = slides.map((s, i) => still(i, s, fps, `scale=${v.width}:${v.height}:out_color_matrix=${matrix}:out_range=${full ? "pc" : "tv"},setsar=${sar},format=${v.pix_fmt}`) + `[s${i}]`).join(";");
  fc += `;${slides.map((s, i) => `[s${i}]`).join("")}concat=n=${slides.length}:v=1:a=0[v]`;
  if (a) {
    const sr = +a.sample_rate || 48000, ch = +a.channels || 2;
    const layout = a.channel_layout || (ch === 1 ? "mono" : ch === 2 ? "stereo" : ch + "c");
    args.push("-f", "lavfi", "-i", `anullsrc=r=${sr}:cl=${layout}`);
    // Múltiplo exacto de 1024 muestras (una trama AAC) para que no se solape con el original
    fc += `;[${slides.length}:a]atrim=end_sample=${Math.floor(total * sr / 1024) * 1024}[a]`;
  }
  args.push("-filter_complex", fc);
  const vFirst = !a || v.index < a.index;
  const maps = vFirst ? ["-map", "[v]", ...(a ? ["-map", "[a]"] : [])] : ["-map", "[a]", "-map", "[v]"];
  args.push(...maps, "-r", fps);
  {
    args.push("-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-crf", "18", "-profile:v", P.prof, "-pix_fmt", v.pix_fmt);
    if (v.color_space) args.push("-colorspace", v.color_space);
    if (v.color_primaries) args.push("-color_primaries", v.color_primaries);
    if (v.color_transfer) args.push("-color_trc", v.color_transfer);
    const tb = String(v.time_base || "").split("/")[1];
    if (tb) args.push("-video_track_timescale", tb);
    if (a) args.push("-c:a", "aac", "-b:a", "128k", "-ar", String(a.sample_rate), "-ac", String(a.channels));
  }
  args.push(out);
  await run(args);
}

function metaArgs(f, d) {
  return ["-metadata", `title=${titleFor(f, d)}`, "-metadata", `artist=${d.autores.join("; ")}`,
    "-metadata", `copyright=© ${d.anio} ${d.autoresTxt}. ${d.licShort} ${d.licUrl}`,
    "-metadata", `comment=Material docente en abierto de la Universidad Rey Juan Carlos. ${d.serie}`];
}

async function processVideo(f, d, setMsg) {
  return withInput(f.file, async src => {
    const P = videoPlan(await probe(src));
    const { v } = P;
    if (P.mode === "mp4") {
      setMsg("Generando portada…", 0.15);
      const ext = "mp4", { pre, post } = await slidesFor(f, d, v.width, v.height);
      await encodeSegment(pre, P, `/intro.${ext}`);
      if (post.length) await encodeSegment(post, P, `/outro.${ext}`);
      const list = ["ffconcat version 1.0", `file ${quote("/intro." + ext)}`, `file ${quote(src)}`];
      if (post.length) list.push(`file ${quote("/outro." + ext)}`);
      await ff.writeFile("/list.txt", list.join("\n") + "\n");
      setMsg("Uniendo…", 0.75);
      const out = `/out.${ext}`;
      await run(["-y", "-f", "concat", "-safe", "0", "-i", "/list.txt", "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", ...metaArgs(f, d), out]);
      const bytes = await ff.readFile(out);
      await rm("/list.txt", `/intro.${ext}`, `/outro.${ext}`, out, ...[...pre, ...post].map(s => s.path));
      return { bytes, name: baseOf(f.file.name) + ".mp4", type: "video/mp4", note: "rápido, sin recodificar el vídeo" };
    }
    // Recodificar todo a H.264/AAC
    let W = v.width, H = v.height;
    if (P.rot === 90 || P.rot === 270) [W, H] = [H, W];
    W -= W % 2; H -= H % 2;
    const fps = rate(P.fps) > 60 ? "30" : P.fps;
    const { pre, post } = await slidesFor(f, d, W, H);
    const segs = [...pre.map(s => ({ ...s, img: true })), { src: true, dur: P.dur }, ...post.map(s => ({ ...s, img: true }))];
    const args = ["-y"]; let idx = 0, fc = [];
    segs.forEach(s => { if (s.img) { args.push("-i", s.path); s.i = idx++; } });
    args.push("-i", src); const si = idx++;
    args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"); const ni = idx++;
    const silences = segs.filter(s => s.img || !P.a);
    fc.push(`[${ni}:a]asplit=${silences.length}${silences.map((s, k) => `[n${k}]`).join("")}`);
    let k = 0;
    segs.forEach((s, j) => {
      if (s.img) fc.push(still(s.i, s, fps, `scale=${W}:${H},setsar=1,format=yuv420p`) + `[v${j}]`);
      else fc.push(`[${si}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p[v${j}]`);
      if (s.img || !P.a) fc.push(`[n${k++}]atrim=duration=${s.dur},asetpts=PTS-STARTPTS[a${j}]`);
      else fc.push(`[${si}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${j}]`);
    });
    fc.push(`${segs.map((s, j) => `[v${j}][a${j}]`).join("")}concat=n=${segs.length}:v=1:a=1[v][a]`);
    args.push("-filter_complex", fc.join(";"), "-map", "[v]", "-map", "[a]", "-r", fps,
      "-c:v", "libx264", "-preset", "superfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
      "-movflags", "+faststart", ...metaArgs(f, d), "/out.mp4");
    const total = segs.reduce((t, s) => t + s.dur, 0);
    const t0 = Date.now();
    const onProg = ({ time }) => {
      const p = Math.min(1, Math.max(0, time / 1e6 / total));
      const el = (Date.now() - t0) / 1000;
      setMsg(`Recodificando (${v.codec_name.toUpperCase()}${P.rot ? ", girado" : ""}) ${Math.round(p * 100)} %${p > 0.03 ? " · quedan unos " + fmtTime(el / p - el) : ""}`, p);
    };
    ff.on("progress", onProg);
    try { await run(args); } finally { ff.off("progress", onProg); }
    const bytes = await ff.readFile("/out.mp4");
    await rm("/out.mp4", ...[...pre, ...post].map(s => s.path));
    return { bytes, name: baseOf(f.file.name) + ".mp4", type: "video/mp4", note: `recodificado desde ${v.codec_name.toUpperCase()}` };
  });
}

/* ---------- Voz: Piper ---------- */
const Piper = {
  sessions: {},
  async session(key, onProgress) {
    if (this.sessions[key]) return this.sessions[key];
    const p = (async () => {
      const [path, spk] = VOICES[key];
      await loadScript(ORT + "ort.min.js");
      await loadScript(PHON + "piper_phonemize.js");
      ort.env.wasm.wasmPaths = ORT; ort.env.wasm.numThreads = 1;
      const cfg = JSON.parse(await (await fetchCached(VOICES_BASE + path + ".json")).text());
      const model = await fetchCached(VOICES_BASE + path, onProgress);
      const sess = await ort.InferenceSession.create(await model.arrayBuffer());
      return { cfg, sess, sid: spk != null ? cfg.speaker_id_map[spk] : null };
    })();
    this.sessions[key] = p; p.catch(() => delete this.sessions[key]);
    return p;
  },
  async phonemes(sentences, voice) {
    const out = [];
    const mod = await createPiperPhonemize({
      print: data => out.push(JSON.parse(data).phoneme_ids),
      printErr: msg => log("piper: " + msg),
      locateFile: url => url.endsWith(".wasm") ? PHON + "piper_phonemize.wasm" : url.endsWith(".data") ? PHON + "piper_phonemize.data" : url,
    });
    sentences.forEach(t => mod.callMain(["-l", voice, "--input", JSON.stringify([{ text: t }]), "--espeak_data", "/espeak-ng-data"]));
    return out;
  },
  // Devuelve un WAV mono de 16 bits
  async speak(text, key, onProgress) {
    const { cfg, sess, sid } = await this.session(key, onProgress);
    // Siglas que la voz leería como palabras
    const said = text.replace(/\bTV\b/g, "te uve").replace(/\bURJC\b/g, "u erre jota ce").replace(/\bIA\b/g, "i a")
      .replace(/\bCC BY-SA\b/g, "ce ce, be i, ese a").replace(/\bCC BY\b/g, "ce ce, be i");
    const sentences = said.replace(/\s+/g, " ").split(/(?<=[.!?;:])\s+/).map(s => s.trim()).filter(Boolean);
    const ids = await this.phonemes(sentences, cfg.espeak.voice);
    const sr = cfg.audio.sample_rate, gap = new Float32Array(Math.round(sr * 0.32));
    const parts = [];
    for (const p of ids) {
      const feeds = {
        input: new ort.Tensor("int64", BigInt64Array.from(p.map(BigInt)), [1, p.length]),
        input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(p.length)]), [1]),
        scales: new ort.Tensor("float32", Float32Array.from([cfg.inference.noise_scale, cfg.inference.length_scale, cfg.inference.noise_w]), [3]),
      };
      if (sid != null) feeds.sid = new ort.Tensor("int64", BigInt64Array.from([BigInt(sid)]), [1]);
      const { output } = await sess.run(feeds);
      parts.push(output.data, gap);
    }
    return wav(parts, sr);
  },
};
function wav(parts, sr) {
  const n = parts.reduce((t, p) => t + p.length, 0);
  const buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, n * 2, true);
  let o = 44;
  parts.forEach(p => { for (let i = 0; i < p.length; i++, o += 2) dv.setInt16(o, Math.max(-1, Math.min(1, p[i])) * 32767, true); });
  return new Blob([buf], { type: "audio/wav" });
}
const voiceProgress = el => (got, total) => { el.textContent = `Descargando la voz… ${total ? Math.round(got / total * 100) + " %" : fmtSize(got)}`; };

/* ---------- Audio ---------- */
const AUDIO_OUT = {
  mp3: ["libmp3lame", "mp3", "audio/mpeg"], m4a: ["aac", "m4a", "audio/mp4"], aac: ["aac", "m4a", "audio/mp4"],
  wav: ["pcm_s16le", "wav", "audio/wav"], flac: ["flac", "flac", "audio/flac"], ogg: ["libvorbis", "ogg", "audio/ogg"],
  oga: ["libvorbis", "ogg", "audio/ogg"], opus: ["libopus", "opus", "audio/ogg"],
};
const blobExt = b => /wav/.test(b.type) ? "wav" : /ogg/.test(b.type) ? "ogg" : /mp4|m4a|aac/.test(b.type) ? "m4a" : /mpeg|mp3/.test(b.type) ? "mp3" : "webm";
const voiceCache = new Map();
async function voiceClip(kind, f, d, st) {
  if (S.voz === "mic") {
    const b = S.rec[kind];
    if (!b) throw new Error(`Falta grabar la locución de ${kind}`);
    return b;
  }
  const text = kind === "entrada" ? spokenEntrada(f, d) : $("#a-cierre").value.trim();
  const key = $("#a-voz").value + "|" + text;
  if (!voiceCache.has(key)) {
    voiceCache.set(key, Piper.speak(text, $("#a-voz").value, voiceProgress(st)));
    voiceCache.get(key).catch(() => voiceCache.delete(key));
  }
  return voiceCache.get(key);
}

async function processAudio(f, d, setMsg) {
  const withOutro = $("#a-concierre").checked;
  setMsg(S.voz === "sint" ? "Generando la voz…" : "Preparando…", 0.1);
  const msgEl = { set textContent(t) { setMsg(t); } };
  const vin = await voiceClip("entrada", f, d, msgEl);
  const vout = withOutro ? await voiceClip("cierre", f, d, msgEl) : null;
  setMsg("Uniendo…", 0.6);
  return withInput(f.file, async src => {
    const info = await probe(src);
    const a = info.streams.find(s => s.codec_type === "audio");
    if (!a) throw new Error("No tiene pista de audio");
    const [codec, ext, type] = AUDIO_OUT[extOf(f.file.name)] || AUDIO_OUT.mp3;
    let sr = +a.sample_rate || 44100;
    if (codec === "libopus") sr = 48000;
    if (codec === "libmp3lame" && ![32000, 44100, 48000, 22050, 24000, 16000].includes(sr)) sr = 44100;
    const layout = (+a.channels || 2) >= 2 ? "stereo" : "mono";
    const fmt = `aresample=${sr},aformat=sample_fmts=fltp:channel_layouts=${layout}`;
    const fin = "/vin." + blobExt(vin), fout = vout ? "/vout." + blobExt(vout) : null;
    await ff.writeFile(fin, new Uint8Array(await vin.arrayBuffer()));
    if (vout) await ff.writeFile(fout, new Uint8Array(await vout.arrayBuffer()));
    const voice = "loudnorm=I=-16:TP=-1.5:LRA=11," + fmt;
    const args = ["-y", "-i", fin, "-i", src];
    let fc = `[0:a]${voice},apad=pad_dur=0.7[i];[1:a:0]${fmt}${vout ? ",apad=pad_dur=0.7" : ""}[m]`;
    if (vout) { args.push("-i", fout); fc += `;[2:a]${voice}[o];[i][m][o]concat=n=3:v=0:a=1[out]`; }
    else fc += `;[i][m]concat=n=2:v=0:a=1[out]`;
    const br = Math.min(320, Math.max(128, Math.round((+a.bit_rate || +info.format.bit_rate || 128000) / 32000) * 32)) + "k";
    args.push("-filter_complex", fc, "-map", "[out]", "-c:a", codec);
    if (codec === "libmp3lame" || codec === "aac" || codec === "libopus" || codec === "libvorbis") args.push("-b:a", br);
    if (codec === "libmp3lame") args.push("-id3v2_version", "3");
    args.push(...metaArgs(f, d), "/out." + ext);
    await run(args);
    const bytes = await ff.readFile("/out." + ext);
    await rm(fin, fout, "/out." + ext);
    return { bytes, name: baseOf(f.file.name) + "." + ext, type, note: ext !== extOf(f.file.name) ? `guardado como ${ext.toUpperCase()}` : "" };
  });
}

/* ---------- Grabación ---------- */
function setupRecorders() {
  $$(".rec").forEach(box => {
    const kind = box.dataset.rec, st = $(".tool-status", box), au = $("audio", box);
    const recB = $('[data-act="rec"]', box), stopB = $('[data-act="stop"]', box);
    let mr = null, stream = null;
    recB.addEventListener("click", async () => {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (e) { st.textContent = "No hay acceso al micrófono. Revisa los permisos del navegador."; return; }
      const chunks = [];
      mr = new MediaRecorder(stream);
      mr.ondataavailable = e => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        setRec(kind, new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
        recB.disabled = false; stopB.disabled = true; recB.textContent = "● Volver a grabar";
      };
      mr.start(); recB.disabled = true; stopB.disabled = false; st.textContent = "Grabando… lee el texto y pulsa Parar.";
    });
    stopB.addEventListener("click", () => mr && mr.state === "recording" && mr.stop());
    $(`[data-upload="${kind}"]`).addEventListener("change", e => { const fl = e.target.files[0]; if (fl) setRec(kind, fl); });
  });
}
function setRec(kind, blob) {
  S.rec[kind] = blob;
  const box = $(`.rec[data-rec="${kind}"]`), au = $("audio", box);
  if (au.src) URL.revokeObjectURL(au.src);
  au.src = URL.createObjectURL(blob); au.hidden = false;
  $(".tool-status", box).textContent = "✓ Lista";
  updateGo();
}

/* ---------- Ficheros ---------- */
function addFiles(list) {
  const exts = S.kind === "video" ? VIDEO_EXT : AUDIO_EXT;
  const files = [...list].filter(fl => exts.includes(extOf(fl.name)) && !fl.name.startsWith("."));
  const skipped = list.length - files.length;
  files.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, "es", { numeric: true }));
  S.files = files.map(file => ({ file, title: titleFromName(file.name), state: "pend", msg: "" }));
  if (!S.running) clearResults();
  renderList(skipped);
  renderPreview(); renderSaid(); updateGo();
}
function renderList(skipped = 0) {
  const box = $("#f-lista");
  if (!S.files.length) {
    box.innerHTML = `<p class="tool-hint">${skipped ? `No hay ${S.kind === "video" ? "vídeos" : "audios"} en lo que has elegido (${skipped} ficheros de otro tipo).` : "Todavía no has elegido ficheros."}</p>`;
    return;
  }
  const d = data();
  box.innerHTML = `<p class="tool-hint">${S.files.length} ${S.kind === "video" ? "vídeos" : "audios"}${skipped ? ` (se ignoran ${skipped} ficheros de otro tipo)` : ""}.
    ${d.porTitulo ? "Revisa el título de cada uno: es el que sale en la portada." : "Todos llevan el título común del paso 2."}</p>
    <div class="table-wrap"><table class="tool-table"><thead><tr><th>#</th><th>Fichero</th><th>Título</th><th>Estado</th></tr></thead><tbody>
    ${S.files.map((f, i) => `<tr data-i="${i}"><td>${i + 1}</td><td class="tool-fname">${esc(f.file.name)}<small>${fmtSize(f.file.size)}</small></td>
      <td><input type="text" value="${esc(f.title)}" data-title="${i}" ${d.porTitulo ? "" : "disabled"} aria-label="Título de ${esc(f.file.name)}"></td>
      <td class="tool-state" data-state="${f.state}">${stateHTML(f)}</td></tr>`).join("")}
    </tbody></table></div>`;
}
function stateHTML(f) {
  const lbl = { pend: "Pendiente", run: "…", ok: "✓ Hecho", err: "✗ Error" }[f.state];
  return `<span>${lbl}</span>${f.msg ? `<small>${esc(f.msg)}</small>` : ""}${f.state === "run" ? `<div class="tool-bar"><div style="width:${Math.round((f.p || 0) * 100)}%"></div></div>` : ""}`;
}
function setState(i, state, msg, p) {
  const f = S.files[i]; f.state = state; if (msg !== undefined) f.msg = msg; f.p = p;
  const td = $(`tr[data-i="${i}"] .tool-state`);
  if (td) { td.dataset.state = state; td.innerHTML = stateHTML(f); }
}

/* ---------- Salida ---------- */
const canDir = "showDirectoryPicker" in window;
// ZIP sin compresión (los vídeos y audios ya van comprimidos)
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zip(entries) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const hdr = (sig, n) => { const b = new DataView(new ArrayBuffer(n)); b.setUint32(0, sig, true); return b; };
  for (const { name, bytes } of entries) {
    const nm = enc.encode(name), crc = crc32(bytes), h = hdr(0x04034b50, 30);
    h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint32(14, crc, true);
    h.setUint32(18, bytes.length, true); h.setUint32(22, bytes.length, true); h.setUint16(26, nm.length, true);
    parts.push(h, nm, bytes);
    const c = hdr(0x02014b50, 46);
    c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint32(16, crc, true);
    c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    central.push(c, nm);
    off += 30 + nm.length + bytes.length;
  }
  const size = central.reduce((t, x) => t + x.byteLength, 0), e = hdr(0x06054b50, 22);
  e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, e], { type: "application/zip" });
}
function download(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 120000);
}
const zipName = part => `${S.kind === "video" ? "videos-con-portada" : "audios-con-locucion"}${part > 1 ? "-parte-" + part : ""}.zip`;

// ¿Es la carpeta de los originales? Si hay un fichero con el mismo nombre, tamaño y fecha, sí.
async function isSourceDir(dir) {
  for (const f of S.files.slice(0, 20)) {
    try {
      const ex = await (await dir.getFileHandle(f.file.name)).getFile();
      if (ex.size === f.file.size && ex.lastModified === f.file.lastModified) return true;
    } catch (e) {}
  }
  return false;
}
async function pickDir() {
  for (;;) {
    let dir;
    try { dir = await window.showDirectoryPicker({ mode: "readwrite", id: "portadas-salida", startIn: "videos" }); }
    catch (e) { return null; }
    if (!(await isSourceDir(dir))) return dir;
    if (!confirm("Esa es la carpeta de los originales y se sobrescribirían. Elige otra carpeta (por ejemplo, crea una nueva dentro).")) return null;
  }
}
async function saveToDir(res) {
  const fh = await S.outDir.getFileHandle(res.name, { create: true });
  const w = await fh.createWritable(); await w.write(res.bytes); await w.close();
}

function updateGo() {
  const noAuthors = !lines($("#d-autores").value).length;
  const ready = S.files.length > 0 && !S.running && !noAuthors && !(S.kind === "audio" && S.voz === "mic" && (!S.rec.entrada || ($("#a-concierre").checked && !S.rec.cierre)));
  $("#go").disabled = !ready;
  const n = S.files.length, v = S.kind === "video";
  $("#go").textContent = !n ? "Generar" : v ? (n === 1 ? "Generar el vídeo con portada" : `Generar los ${n} vídeos con portada`)
    : (n === 1 ? "Generar el audio con locución" : `Generar los ${n} audios con locución`);
  $("#out-hint").innerHTML = canDir
    ? "Al pulsar el botón, elige la carpeta donde guardarlos (distinta de la de los originales). Se guardan con el mismo nombre que el original."
    : "Al terminar se descargará un ZIP con todos, con el mismo nombre que los originales.";
  if (noAuthors) $("#out-hint").innerHTML += " <strong>Faltan los autores (paso 2).</strong>";
  if (S.kind === "audio" && S.voz === "mic" && S.files.length && !S.rec.entrada) $("#out-hint").innerHTML += " <strong>Falta grabar la locución de entrada (paso 3).</strong>";
}

// Al cambiar de tipo o de ficheros, el progreso y el resumen de la tanda anterior ya no valen
function clearResults() { $("#prog").hidden = true; $("#summary").innerHTML = ""; }
function progress(i, p, msg) {
  const n = S.files.length, total = Math.min(1, (i + Math.min(1, Math.max(0, p || 0))) / n);
  $("#prog").hidden = false;
  $("#prog-bar").style.width = (total * 100).toFixed(1) + "%";
  $("#prog-pct").textContent = Math.floor(total * 100) + " %";
  $("#prog-txt").textContent = i < n ? `${i + 1} de ${n} · ${S.files[i].file.name}${msg ? " · " + msg : ""}` : msg;
}

async function go() {
  // La carpeta se pide antes de nada: el navegador solo deja abrir el diálogo justo al pulsar
  S.outDir = null;
  if (canDir) { S.outDir = await pickDir(); if (!S.outDir) return; }
  S.running = true; S.cancel = false; updateGo();
  $("#cancel").hidden = false; $("#summary").innerHTML = "";
  S.files.forEach((f, i) => setState(i, "pend", ""));
  const d = data(); saveData();
  const t0 = Date.now(); let ok = 0, bad = 0;
  let pending = [], pendingSize = 0, part = 1;
  const used = new Set();   // dos originales pueden dar el mismo nombre (subcarpetas, o clase.mov y clase.mp4)
  const flush = () => { if (pending.length) { download(zip(pending), zipName(part++)); pending = []; pendingSize = 0; } };
  progress(0, 0, "Preparando el motor…");
  try {
    await getFF();
    for (let i = 0; i < S.files.length && !S.cancel; i++) {
      const f = S.files[i];
      setState(i, "run", "Empezando…"); progress(i, 0, "Empezando…");
      $(`tr[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" });
      try {
        let lastP = 0;
        const setMsg = (m, p) => { if (p != null) lastP = p; setState(i, "run", m, lastP); progress(i, lastP, m); };
        const res = S.kind === "video" ? await processVideo(f, d, setMsg) : await processAudio(f, d, setMsg);
        let name = res.name;
        for (let n = 2; used.has(name.toLowerCase()); n++) name = `${baseOf(res.name)} (${n}).${extOf(res.name)}`;
        used.add(name.toLowerCase());
        if (name !== res.name) { res.name = name; res.note = [res.note, `guardado como «${name}»`].filter(Boolean).join(" · "); }
        f.outName = res.name;
        if (S.outDir) await saveToDir(res);
        else {
          // El ZIP se guarda en memoria: si crece demasiado, se descarga por partes
          pending.push({ name: res.name, bytes: res.bytes }); pendingSize += res.bytes.length;
          if (pendingSize > 1.2e9) flush();
        }
        setState(i, "ok", res.note); ok++; progress(i + 1, 0, "");
      } catch (e) {
        if (S.cancel) { setState(i, "err", "Cancelado"); break; }
        log("ERROR: " + (e && e.message || e)); setState(i, "err", e && e.message || String(e)); bad++;
        if (!(e instanceof FFError)) { resetFF(); await getFF(); }
      }
    }
  } catch (e) {
    $("#summary").innerHTML = `<div class="callout warn">No se pudo preparar el motor: ${esc(e.message || e)}. Comprueba la conexión y vuelve a intentarlo.</div>`;
  }
  flush();   // también al cancelar: los que ya estaban hechos se descargan
  S.running = false; $("#cancel").hidden = true; updateGo();
  progress(S.files.length, 0, S.cancel ? "Cancelado" : `Terminado: ${ok} de ${S.files.length}`);
  if (ok || bad) $("#summary").innerHTML = `<div class="callout ${bad ? "warn" : "ok"}"><strong>${ok} de ${S.files.length} listos</strong> en ${fmtTime((Date.now() - t0) / 1000)}.
    ${bad ? "Los que han fallado tienen el motivo en la lista; el registro técnico tiene los detalles." : ""}
    ${S.outDir ? `Están en la carpeta «${esc(S.outDir.name)}».` : part > 2 ? `Se han descargado en ${part - 1} ZIP.` : `Se ha descargado <strong>${zipName(1)}</strong>.`}
    Revisa un par antes de subirlos a <a href="tv-urjc.html#pasos">TV URJC</a>.</div>`;
}
function cancel() {
  S.cancel = true;
  resetFF();
  log("Cancelado por el usuario");
}

/* ---------- Interfaz ---------- */
function setKind(k) {
  if (S.running) return;
  if (k !== S.kind) clearResults();
  S.kind = k;
  $$("[data-kind]").forEach(b => b.setAttribute("aria-pressed", b.dataset.kind === k));
  $$("[data-show]").forEach(el => el.hidden = el.dataset.show !== k);
  $("#f-ficheros").accept = (k === "video" ? VIDEO_EXT : AUDIO_EXT).map(e => "." + e).join(",");
  if (S.files.length) addFiles(S.files.map(f => f.file)); else renderList();
  saveData(); updateGo(); renderPreview();
}
function setVoz(v) {
  S.voz = v;
  $$("[data-voz]").forEach(b => b.setAttribute("aria-pressed", b.dataset.voz === v));
  $$("[data-voz-show]").forEach(el => el.hidden = el.dataset.vozShow !== v);
  saveData(); renderSaid(); updateGo();
}
async function listen(kind) {
  const st = $("#a-voz-st"), pl = $("#a-player");
  const d = data(), f = S.files[0] || { title: d.coleccion };
  st.textContent = "Generando…";
  try {
    const b = await voiceClip(kind, f, d, st);
    if (pl.src) URL.revokeObjectURL(pl.src);
    pl.src = URL.createObjectURL(b); pl.hidden = false; st.textContent = "";
    pl.play().catch(() => {});
  } catch (e) { st.textContent = "No se pudo generar la voz: " + (e.message || e); log("voz: " + (e.stack || e)); }
}
function loadImg(kind, file) {
  if (!file) { S.imgs[kind] = null; renderPreview(); return; }
  const im = new Image();
  im.onload = () => { S.imgs[kind] = im; renderPreview(); };
  im.src = URL.createObjectURL(file);
}

function init() {
  loadData();
  refreshTexts(false);
  setupRecorders();
  $$("[data-kind]").forEach(b => b.addEventListener("click", () => setKind(b.dataset.kind)));
  $$("[data-voz]").forEach(b => b.addEventListener("click", () => setVoz(b.dataset.voz)));
  $$("[data-prev]").forEach(b => b.addEventListener("click", () => {
    S.prev = b.dataset.prev; $$("[data-prev]").forEach(x => x.setAttribute("aria-pressed", x === b)); renderPreview();
  }));
  // Al pasar de no tener IA a tenerla (o al revés), se marca o desmarca la diapositiva de declaración
  let hadIA = !!$("#d-ia").value.trim();
  const syncIA = () => { const has = !!$("#d-ia").value.trim(); if (has !== hadIA) $("#v-ia").checked = has; hadIA = has; };
  const syncSelects = () => {
    $("#v-portada-img-f").hidden = $("#v-portada").value !== "img";
    $("#v-cierre-img-f").hidden = $("#v-cierre").value !== "img";
  };
  $("#tool").addEventListener("input", e => {
    const id = e.target.id;
    if (id === "a-entrada" || id === "a-cierre") S.textsDirty[id.slice(2)] = true;
    else if (id && id.startsWith("d-")) refreshTexts(false);
    if (id === "d-portitulo") renderList();
    if (id === "d-ia") syncIA();
    if (e.target.dataset.title !== undefined) S.files[+e.target.dataset.title].title = e.target.value;
    syncSelects(); saveData(); renderPreview(); renderSaid(); updateGo();
  });
  $("#tool").addEventListener("change", e => { if (e.target.id === "d-portitulo" || e.target.id === "a-concierre") { renderList(); updateGo(); } });
  $("#v-portada-img").addEventListener("change", e => loadImg("portada", e.target.files[0]));
  $("#v-cierre-img").addEventListener("change", e => loadImg("cierre", e.target.files[0]));
  $("#f-carpeta").addEventListener("change", e => { addFiles(e.target.files); e.target.value = ""; });
  $("#f-ficheros").addEventListener("change", e => { addFiles(e.target.files); e.target.value = ""; });
  $("#a-regen").addEventListener("click", () => { refreshTexts(true); saveData(); renderSaid(); });
  $("#a-escuchar").addEventListener("click", () => listen("entrada"));
  $("#a-escuchar-c").addEventListener("click", () => listen("cierre"));
  $("#go").addEventListener("click", go);
  $("#cancel").addEventListener("click", cancel);
  window.addEventListener("beforeunload", e => { if (S.running) { e.preventDefault(); e.returnValue = ""; } });
  syncSelects();
  setVoz(S.voz);
  setKind(S.kind);
}
init();
// Para las pruebas automáticas
window.__portadas = { S, data, drawSlide, addFiles, go, setKind };

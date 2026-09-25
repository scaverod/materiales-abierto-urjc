/* Comportamiento común: cabecera, pie, tema, copiar, cuentas atrás */
(function () {
  // [href, texto, descripción (solo en submenús)]
  const NAV = [
    ["index.html", "Inicio"],
    ["pasos.html", "Checklist"],
    ["categorias.html", "Categorías"],
    ["Guías", [
      ["libro.html", "El libro de la asignatura", "Monta el único PDF del depósito"],
      ["tv-urjc.html", "Subir vídeos a TV URJC", "Serie, metadatos y licencia, paso a paso"],
      ["software.html", "Depositar el código", "GitHub → Software Heritage → BURJC"],
      ["textos.html", "Textos listos", "Copyright, metadatos, Anexo V, IA…"],
    ]],
    ["calendario.html", "Calendario"],
    ["mentores.html", "Mentores"],
    ["faq.html", "Dudas"],
  ];

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  window.store = { get: safeGet, set: safeSet };

  const saved = safeGet("theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);

  const here = (location.pathname.split("/").pop() || "index.html");

  const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#cb0017"/><path d="M11.5 15v-4a4.5 4.5 0 0 1 8.7-1.6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><rect x="8.5" y="15" width="15" height="11" rx="2.6" fill="#fff"/><circle cx="16" cy="19.6" r="1.7" fill="#cb0017"/><rect x="15.2" y="20" width="1.6" height="3.2" rx=".8" fill="#cb0017"/></svg>`;

  const header = document.getElementById("site-header");
  if (header) {
    header.className = "site-header";
    const item = ([h, t]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ""}>${t}</a>`;
    const links = NAV.map(n => {
      if (!Array.isArray(n[1])) return item(n);
      const active = n[1].some(([h]) => h === here);
      return `<div class="nav-group${active ? " active" : ""}">
        <button type="button" class="nav-group-btn" aria-expanded="false">${n[0]} <span aria-hidden="true">▾</span></button>
        <div class="nav-menu">${n[1].map(([h, t, d]) =>
          `<a href="${h}"${h === here ? ' aria-current="page"' : ""}><strong>${t}</strong><small>${d}</small></a>`).join("")}</div>
      </div>`;
    }).join("");
    header.innerHTML = `
      <div class="wrap">
        <a class="brand" href="index.html">${LOGO}
          <span>Materiales en Abierto<small>Convocatoria URJC 2026-27</small></span>
        </a>
        <nav class="nav" id="nav" aria-label="Principal">${links}</nav>
        <div class="header-actions">
          <button class="icon-btn theme-toggle" aria-label="Cambiar tema claro/oscuro" title="Tema claro/oscuro">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" fill="currentColor"/></svg>
          </button>
          <button class="icon-btn nav-toggle" aria-expanded="false" aria-controls="nav" aria-label="Menú">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>`;
    const nav = header.querySelector(".nav");
    const tog = header.querySelector(".nav-toggle");
    tog.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      tog.setAttribute("aria-expanded", open);
    });
    header.querySelectorAll(".nav-group-btn").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      const g = b.parentElement, open = !g.classList.contains("open");
      header.querySelectorAll(".nav-group").forEach(x => { x.classList.remove("open"); x.firstElementChild.setAttribute("aria-expanded", "false"); });
      g.classList.toggle("open", open); b.setAttribute("aria-expanded", open);
    }));
    document.addEventListener("click", () => header.querySelectorAll(".nav-group.open").forEach(g => {
      g.classList.remove("open"); g.firstElementChild.setAttribute("aria-expanded", "false");
    }));
    document.addEventListener("keydown", e => { if (e.key === "Escape") document.dispatchEvent(new Event("click")); });
    header.querySelector(".theme-toggle").addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") ||
        (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      safeSet("theme", next);
    });
  }

  const CLAUDIA = `<svg class="claudia" viewBox="0 0 24 24" aria-hidden="true"><g fill="#d97757">${
    [0, 45, 90, 135, 180, 225, 270, 315].map((a, i) =>
      `<rect x="11" y="${i % 2 ? 3.5 : 1.5}" width="2" height="${i % 2 ? 8.5 : 10.5}" rx="1" transform="rotate(${a} 12 12)"/>`).join("")
  }</g></svg>`;

  const footer = document.getElementById("site-footer");
  if (footer) {
    footer.className = "site-footer";
    footer.innerHTML = `
      <div class="wrap footer-grid">
        <div>
          <p><strong>Guía no oficial</strong> para el programa de mentoría de Materiales Docentes en Abierto de la URJC.
          Si algo no coincide con la <a href="https://sede.urjc.es/tablon-oficial/anuncio/16116/">convocatoria oficial</a>, manda la convocatoria.</p>
          <p>Dudas oficiales: <a href="mailto:ofilibre@urjc.es">ofilibre@urjc.es</a> ·
          <a href="https://ofilibre.urjc.es/guias/convocatoria-asignaturas-abierto/">Guía de OfiLibre</a> ·
          Contenido <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.es">CC BY-SA 4.0</a></p>
        </div>
        <p class="credits">Desarrollado por <a href="https://servicios.urjc.es/pdi/ver/sergio.cavero">Sergio Cavero</a>
          y <span class="claudia-name" title="Claudia = Claude 😉">${CLAUDIA}Claudia</span></p>
      </div>`;
  }

  // Toast
  const toast = document.createElement("div");
  toast.className = "toast"; toast.setAttribute("role", "status");
  document.body.appendChild(toast);
  let tt;
  window.showToast = function (msg) {
    toast.textContent = msg; toast.classList.add("show");
    clearTimeout(tt); tt = setTimeout(() => toast.classList.remove("show"), 1800);
  };

  // Copiar: <button data-copy="idDelElemento">
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    const el = document.getElementById(b.dataset.copy);
    const text = el ? (el.value !== undefined && el.tagName !== "PRE" ? el.value : el.innerText) : "";
    try { await navigator.clipboard.writeText(text); showToast("Copiado ✓"); }
    catch (err) {
      const r = document.createRange(); r.selectNodeContents(el);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      showToast("Selecciona y copia con Ctrl/Cmd+C");
    }
  });

  // Cuentas atrás: <span data-countdown="2027-01-15T23:59:00+01:00">
  function fmt(ms) {
    if (ms <= 0) return "plazo cerrado";
    const d = Math.floor(ms / 864e5);
    if (d >= 2) return `faltan ${d} días`;
    return `faltan ${Math.floor(ms / 36e5)} horas`;
  }
  function tick() {
    document.querySelectorAll("[data-countdown]").forEach((el) => {
      el.textContent = fmt(new Date(el.dataset.countdown) - Date.now());
    });
  }
  tick(); setInterval(tick, 60000);

  // Descarga de ficheros generados
  window.downloadFile = function (name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
})();

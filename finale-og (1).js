/* ===========================================================================
   finale-og.js — AFFICHE FINALE du PROJET OG
   À placer à côté de index.html (comme vault-og.js) et à charger tout en bas :
       <script src="finale-og.js?v=1"></script>        (juste avant </body>)
   Prérequis : cloture-livre-dor.sql exécuté une fois dans Supabase (SQL Editor).
   Admin  : bouton « CLÔTURER L’ÉVÉNEMENT » en haut du tableau de bord.
   Agents : dès la clôture, affiche finale = bilan (gagnant, podium, points),
            photos de tous (téléchargeables) et registre des agents.
   =========================================================================== */
(function (w, d) {
  "use strict";
  var P = w.OGPhoto;
  if (!P || typeof P.init !== "function") return;

  var cfg = null, booted = false, tm = null;
  var S = { closed: null, open: false, tab: "bilan", sig: "", gsig: "", gb: [], ph: null, i: 0, me: "" };
  var $ = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); };
  var say = function (e) { return e && e.message && e.name !== "TypeError" ? e.message : "Erreur de connexion au serveur."; };
  var isAdmin = function () { var c = cfg && cfg.getCreds(); return !!(c && c.admin); };
  var pub = function (p) { return cfg.url + "/storage/v1/object/public/photo-previews/" + String(p).split("/").map(encodeURIComponent).join("/"); };
  var fmt = function (i) { var x = new Date(i); return isNaN(x) ? "" : x.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).toUpperCase(); };

  function h(t, a, k) {
    var e = d.createElement(t), n;
    for (n in (a || {})) {
      if (n === "text") e.textContent = a[n];
      else if (n.slice(0, 2) === "on") e.addEventListener(n.slice(2), a[n]);
      else if (a[n] != null && a[n] !== false) e.setAttribute(n, a[n] === true ? "" : a[n]);
    }
    (k || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? d.createTextNode(c) : c); });
    return e;
  }
  function toast(m, k) {
    var t = $("#ogf-toast") || d.body.appendChild(h("div", { id: "ogf-toast", class: "ogf-toast", role: "status" }));
    t.textContent = m; t.className = "ogf-toast on " + (k || "");
    clearTimeout(tm); tm = setTimeout(function () { t.className = "ogf-toast"; }, 3500);
  }

  // ---------- Serveur (même clé publique et mêmes identifiants que le reste du site) ----------
  function rpc(fn, action, fields) {
    var c = cfg.getCreds();
    return fetch(cfg.url + "/rest/v1/rpc/" + fn, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: cfg.key },
      body: JSON.stringify({ p_identifier: c.identifier, p_password: c.password, p_action: action, p_fields: fields || {} })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j || j.error) throw new Error((j && (j.error || j.message)) || "Erreur du serveur");
        return j;
      });
    });
  }
  function edge(body) {
    var c = cfg.getCreds();
    body.identifier = c.identifier; body.password = c.password;
    return fetch(cfg.url + "/functions/v1/photo-sign", {
      method: "POST", headers: { "Content-Type": "application/json", apikey: cfg.key, Authorization: "Bearer " + cfg.key }, body: JSON.stringify(body)
    }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  // ---------- État de la clôture ----------
  function refresh() {
    if (!cfg || d.hidden) return Promise.resolve();
    return rpc("og_finale_call", "state").then(function (j) { apply(!!j.closed, j.me); }, function (e) { if (isAdmin()) drawBar(say(e)); });
  }
  function apply(closed, me) {
    var was = S.closed;
    S.closed = closed; if (me) S.me = me;
    drawBar();
    if (closed && !was && !isAdmin()) show("bilan");
    else if (!closed && was && S.open) hide();
    else if (S.open) tick();
  }

  // Bandeau en haut du tableau de bord : état + boutons (admin : clôturer / rouvrir)
  function drawBar(err) {
    var b = $("#ogf-bar"), a = isAdmin(), c = S.closed;
    if (!b) return;
    b.hidden = !(a || c); b.className = "ogf-bar" + (c ? " on" : ""); b.innerHTML = "";
    b.appendChild(h("div", {}, [
      h("strong", { text: err ? "CLÔTURE INDISPONIBLE" : c ? "ÉVÉNEMENT CLÔTURÉ" : "ÉVÉNEMENT EN COURS" }),
      h("span", { text: err || (c ? (a ? "L’affiche finale est visible des agents." : "Bilan, photos, podium et registre des agents sont ouverts.") : "Clôturer ouvre l’affiche finale à tous les agents.") })
    ]));
    if (err) return;
    var k = h("div", { class: "og-item-controls" });
    var add = function (t, x, f) { k.appendChild(h("button", { type: "button", class: "og-btn-small" + x, text: t, onclick: f })); };
    if (c || a) add(c ? "OUVRIR L’AFFICHE FINALE ▸" : "APERÇU DE L’AFFICHE", "", function () { show("bilan"); });
    if (a) add(c ? "ROUVRIR L’ÉVÉNEMENT" : "CLÔTURER L’ÉVÉNEMENT", c ? "" : " og-btn-danger", function () { closeEvent(!c); });
    b.appendChild(k);
  }

  function closeEvent(on) {
    var hid = $$("#og-teams-list .og-item-hidden").length, hep = $$("#og-epreuves-list .og-item-hidden").length;
    var m = on
      ? "Clôturer l’événement ?\n\nLes agents verront l’affiche finale : équipe gagnante, points, podium, photos de tous (téléchargeables) et registre des agents.\nLa galerie photo sera ouverte à tous (équipes et auteurs affichés) et les envois fermés." +
        (hid + hep ? "\n\n⚠ Encore cachés : " + hid + " équipe(s), " + hep + " épreuve(s). Ils ne comptent pas dans le classement." : "")
      : "Rouvrir l’événement ? L’affiche finale disparaît pour les agents.";
    if (!w.confirm(m)) return;
    rpc("og_finale_call", on ? "close" : "reopen").then(function (j) {
      apply(!!j.closed, j.me);
      if (!on) return;
      rpc("og_photo_call", "settings_set", { is_open: false })
        .then(function () { return rpc("og_photo_call", "settings_set", { gallery_visible: true }); })
        .then(function () { return rpc("og_photo_call", "settings_set", { show_team_names: true }); })
        .then(function () { return rpc("og_photo_call", "settings_set", { show_authors: true }); })
        .then(function () { if (P.refresh) P.refresh(); }, function () { toast("Clôture faite, mais la galerie photo n’a pas pu être ouverte (réglage à faire dans GESTION).", "no"); });
      show("bilan");
    }, function (e) { w.alert(say(e)); });
  }

  // ---------- Affiche finale ----------
  function show(tab) {
    build(); S.open = true; S.sig = ""; S.ph = null;
    $("#ogf").hidden = false; d.documentElement.classList.add("ogf-lock");
    go(tab || S.tab);
  }
  function hide() {
    S.open = false;
    var e = $("#ogf"), l = $("#ogf-lb");
    if (e) e.hidden = true;
    if (l) l.hidden = true;
    d.documentElement.classList.remove("ogf-lock");
  }
  function go(t) {
    S.tab = t;
    $$("#ogf [data-t]").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.t === t); });
    $$("#ogf [data-p]").forEach(function (p) { p.hidden = p.dataset.p !== t; });
    $("#ogf-body").scrollTop = 0;
    tick(true);
  }
  function tick(force) {
    if (!S.open) return;
    if (S.tab === "bilan") bilan(force);
    else if (S.tab === "photos") { if (!S.ph) photos(true); }
    else gbLoad();
  }

  // Classement lu dans la liste que le site tient déjà à jour (mêmes équipes et épreuves révélées)
  function cols() {
    var c = {};
    $$("#og-teams-list .og-item").forEach(function (e) { var s = $("strong", e); if (s) c[s.textContent.trim()] = (e.style.getPropertyValue("--team") || "").trim(); });
    return c;
  }
  function rows() {
    var C = cols();
    return $$("#og-rank-list .og-rk-team").map(function (e) {
      var b = $(".og-rk-th b", e), n = $(".og-rk-n", e), p = $(".og-rk-tp", e), m = $(".og-emblem img", e);
      if (!b || !n || !p) return null;
      var name = b.textContent.trim();
      return { rank: parseInt(n.textContent, 10) || 0, name: name, pts: parseInt(p.textContent, 10) || 0, col: C[name] || "", img: m ? m.src : "" };
    }).filter(Boolean);
  }
  function bilan(force) {
    var el = $("#ogf-bilan"), box = $("#og-rank-list"), src = box ? box.innerHTML : "";
    if (!force && src === S.sig) return;
    S.sig = src;
    var R = rows();
    if (!R.length) { el.innerHTML = '<div class="og-empty">Aucun résultat à afficher pour l’instant.</div>'; return; }
    var top = R.filter(function (r) { return r.rank === 1; });
    if (top.length && top[0].pts <= 0) top = [];   // aucun point attribué : pas de gagnant à annoncer
    var bd = $("#og-teams-list .og-badge-mine"), mt = bd && $("strong", bd.closest(".og-item")), mn = mt ? mt.textContent.trim() : "";
    var mine = R.filter(function (r) { return r.name === mn; })[0];
    var im = function (r) { return r.img ? '<img src="' + esc(r.img) + '" alt="">' : ""; };
    var col = function (r) { return esc(r.col || "var(--amber)"); };
    el.innerHTML =
      '<section class="ogf-hero"><div class="ogf-stamp">MISSION ACCOMPLIE</div>' +
      '<div class="ogf-lab">OBER’GAMES 2027 · RAPPORT FINAL</div>' +
      '<div class="ogf-lab">' + (!top.length ? "RÉSULTATS NON VALIDÉS POUR L’INSTANT" : top.length > 1 ? "ÉQUIPES VICTORIEUSES (EX ÆQUO)" : "ÉQUIPE VICTORIEUSE") + "</div>" +
      top.map(function (r) { return '<div class="ogf-win" style="--c:' + col(r) + '">' + im(r) + "<b>" + esc(r.name) + "</b><span>" + r.pts + " PTS</span></div>"; }).join("") +
      "</section>" +
      (mine ? '<p class="ogf-me">VOTRE ÉQUIPE · <b>' + esc(mine.name) + "</b> · RANG " + mine.rank + " SUR " + R.length + " · " + mine.pts + " PTS</p>" : "") +
      '<div class="ogf-lab ogf-l">PODIUM</div><div class="ogf-pod">' +
      (top.length ? [R[1], R[0], R[2]] : []).filter(Boolean).map(function (r) {
        return '<div class="ogf-step k' + Math.min(r.rank, 3) + '" style="--c:' + col(r) + '">' + im(r) + "<b>" + esc(r.name) + "</b><span>" + r.pts + ' PTS</span><div class="ogf-blk">' + r.rank + "</div></div>";
      }).join("") +
      '</div><div class="ogf-c"><button type="button" class="og-btn-small" id="ogf-anim">▶ PODIUM ANIMÉ</button></div>' +
      '<div class="ogf-lab ogf-l">LES POINTS, ÉQUIPE PAR ÉQUIPE</div><div id="ogf-rank">' + src + "</div>";
    $$("#ogf-rank .og-shut").forEach(function (e) { e.classList.remove("og-shut"); });
    $$("#ogf-rank [style]").forEach(function (e) { e.style.transition = ""; e.style.transform = ""; });
  }

  // ---------- Photos de tous + téléchargement ----------
  function save(url, name) {
    var a = h("a", { href: url, download: name || "", rel: "noopener", style: "display:none" });
    d.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 1500);
  }
  function download(p) {
    toast("Préparation du téléchargement…");
    return edge({ action: "download", photo_id: p.id, mode: "download" }).catch(function () { return null; }).then(function (r) {
      if (r && r.ok && r.url) { save(r.url, r.filename); toast("Téléchargement lancé ✓", "ok"); return; }
      var path = p.display_path || p.thumb_path;   // sinon : version affichée (2048 px)
      if (!path) throw 0;
      return fetch(pub(path)).then(function (x) { if (!x.ok) throw 0; return x.blob(); }).then(function (b) {
        var name = "OG-photo-" + String(p.id).slice(0, 8) + ".jpg", f = null;
        var ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
        var file = function () {
          var u = URL.createObjectURL(b);
          save(u, name);
          setTimeout(function () { URL.revokeObjectURL(u); }, 8000);
          toast("Photo téléchargée ✓", "ok");
        };
        try { f = new File([b], name, { type: b.type || "image/jpeg" }); } catch (e) {}
        // iPhone / iPad : la feuille de partage propose « Enregistrer l’image » dans Photos
        if (ios && f && navigator.canShare && navigator.canShare({ files: [f] })) {
          return navigator.share({ files: [f] }).then(function () { toast("Photo partagée ✓", "ok"); }, function (e) { if (!e || e.name !== "AbortError") file(); });
        }
        file();
      });
    }).catch(function () { toast("Téléchargement impossible.", "no"); });
  }
  function photos(first) {
    if (first) { S.ph = { items: [], more: false, next: null, busy: false }; $("#ogf-grid").innerHTML = ""; $("#ogf-ph-st").textContent = "Chargement des photos…"; }
    var s = S.ph;
    if (!s || s.busy) return;
    s.busy = true;
    var f = { limit: 36 };
    if (s.next) { f.before_ts = s.next.before_ts; f.before_id = s.next.before_id; }
    return rpc("og_photo_call", "gallery", f).then(function (j) {
      (j.photos || []).forEach(function (p) { s.items.push(p); cell(p, s.items.length - 1); });
      s.more = !!j.more; s.next = j.next || null; s.busy = false;
      $("#ogf-ph-st").textContent = s.items.length ? s.items.length + " photo" + (s.items.length > 1 ? "s" : "") + (s.more ? " ou plus" : "") + " · touche une photo pour l’agrandir, ⬇ pour la télécharger" : "Aucune photo à afficher pour l’instant.";
      $("#ogf-more").hidden = !s.more;
    }, function (e) { s.busy = false; $("#ogf-ph-st").textContent = "Galerie indisponible : " + say(e); });
  }
  function cell(p, i) {
    var c = h("div", { class: "ogf-ph" }), b = h("button", { type: "button", class: "im", "aria-label": "Agrandir la photo " + (i + 1), onclick: function () { lb(i); } });
    b.innerHTML = p.thumb_path ? '<img loading="lazy" decoding="async" alt="" src="' + esc(pub(p.thumb_path)) + '">' : '<span class="ogf-no">APERÇU INDISPONIBLE</span>';
    c.appendChild(b);
    c.appendChild(h("button", { type: "button", class: "dl", "aria-label": "Télécharger la photo " + (i + 1), text: "⬇", onclick: function () { download(p); } }));
    $("#ogf-grid").appendChild(c);
  }
  function lb(i) {
    var s = S.ph, p = s && s.items[i];
    if (!p) return;
    S.i = i;
    $("#ogf-lb").hidden = false;
    $("#ogf-lb-n").textContent = (i + 1) + " / " + s.items.length + (s.more ? "+" : "");
    var im = $("#ogf-lb-i"), src = p.display_path || p.thumb_path;
    im.src = src ? pub(src) : ""; im.alt = p.title || "Photo du concours";
    $("#ogf-lb-pv").disabled = i <= 0;
    $("#ogf-lb-nx").disabled = i >= s.items.length - 1 && !s.more;
    var c = $("#ogf-lb-c");
    c.innerHTML = "";
    c.appendChild(h("div", { class: "ogf-lab ogf-l", text: p.team_name ? String(p.team_name).toUpperCase() : "ÉQUIPE NON RÉVÉLÉE" }));
    if (p.title) c.appendChild(h("h3", { text: p.title }));
    if (p.author) c.appendChild(h("p", { text: "Photo de " + p.author }));
    if (p.description) c.appendChild(h("p", { text: p.description }));
    c.appendChild(h("button", { type: "button", class: "og-btn-small ogf-pri", text: "⬇ TÉLÉCHARGER", onclick: function () { download(p); } }));
  }
  function lbGo(x) {
    var s = S.ph, n = S.i + x;
    if (!s || n < 0) return;
    if (n < s.items.length) return lb(n);
    if (s.more) { var b = s.items.length, p = photos(); if (p) p.then(function () { if (s.items.length > b) lb(b); }); }
  }

  // ---------- Registre des agents ----------
  function gbLoad() {
    $("#ogf-sign").textContent = "SIGNÉ : " + (S.me || "AGENT");
    return rpc("og_finale_call", "gb_list").then(function (j) { S.gb = j.messages || []; gbDraw(); }, function (e) { gbDraw(say(e)); });
  }
  function gbDraw(err) {
    var L = $("#ogf-gl"), sg = JSON.stringify(S.gb) + "|" + (err || "");
    if (!L || sg === S.gsig) return;
    S.gsig = sg;
    if (err) { L.innerHTML = '<div class="og-empty">' + esc(err) + "</div>"; return; }
    if (!S.gb.length) { L.innerHTML = '<div class="og-empty">Registre vide pour l’instant. Sois le premier à signer.</div>'; return; }
    var C = cols(), a = isAdmin();
    L.innerHTML = S.gb.map(function (m) {
      return '<article class="ogf-msg" style="--c:' + esc(C[m.team_name] || "var(--amber)") + '"><div class="ogf-mh"><b>' + esc(m.author) + "</b>" +
        (m.team_name ? "<span>" + esc(String(m.team_name).toUpperCase()) + "</span>" : "") + "<time>" + esc(fmt(m.created_at)) + '</time></div><p class="ogf-mt">' + esc(m.message) + "</p>" +
        (a || m.mine ? '<button type="button" class="og-btn-small og-btn-danger" data-del="' + esc(m.id) + '">SUPPRIMER</button>' : "") + "</article>";
    }).join("");
  }
  function gbSend() {
    var t = $("#ogf-gt"), b = $("#ogf-gs"), st = $("#ogf-gst"), v = t.value.trim();
    if (!v) { st.textContent = "Écris ton rapport avant de le transmettre."; st.className = "ogf-st no"; return; }
    b.disabled = true; st.textContent = "TRANSMISSION EN COURS…"; st.className = "ogf-st";
    rpc("og_finale_call", "gb_post", { message: v }).then(function (j) {
      t.value = ""; $("#ogf-gc").textContent = "0 / 500";
      S.gb = j.messages || []; gbDraw();
      st.textContent = "✓ RAPPORT ENREGISTRÉ DANS LE REGISTRE"; st.className = "ogf-st ok";
    }, function (e) { st.textContent = say(e); st.className = "ogf-st no"; }).then(function () { b.disabled = false; });
  }

  // ---------- Construction de l’interface ----------
  function build() {
    if ($("#ogf")) return;
    css();
    var o = h("div", { id: "ogf", class: "ogf", role: "dialog", "aria-modal": "true", "aria-label": "Affiche finale", hidden: true });
    o.innerHTML =
      '<header class="ogf-head"><div><b>PROJET OG</b><small>DOSSIER CLÔTURÉ · DÉBRIEFING FINAL</small></div><button type="button" class="og-btn-small" id="ogf-x">✕ FERMER</button></header>' +
      '<nav class="ogf-tabs" role="tablist"><button type="button" role="tab" data-t="bilan">BILAN</button><button type="button" role="tab" data-t="photos">PHOTOS</button><button type="button" role="tab" data-t="gb">REGISTRE DES AGENTS</button></nav>' +
      '<main class="ogf-body" id="ogf-body">' +
      '<div class="ogf-pane" data-p="bilan" id="ogf-bilan"></div>' +
      '<div class="ogf-pane" data-p="photos" hidden><div class="ogf-lab ogf-l">PHOTOS DE TOUS LES AGENTS</div><p class="ogf-st" id="ogf-ph-st"></p><div class="ogf-grid" id="ogf-grid"></div>' +
      '<button type="button" class="og-btn-small ogf-more" id="ogf-more" hidden>AFFICHER PLUS</button>' +
      '<div class="ogf-c"><button type="button" class="og-btn-small" id="ogf-verdict">VOIR LE VERDICT DU CONCOURS PHOTO ▸</button></div></div>' +
      '<div class="ogf-pane" data-p="gb" hidden><div class="ogf-lab ogf-l">REGISTRE DES AGENTS</div>' +
      '<p class="ogf-intro">Dernier rapport de mission : souvenir, remerciement, fait d’armes… Laisse ta trace dans le dossier.</p>' +
      '<div class="og-form ogf-form"><div class="og-form-title" id="ogf-sign"></div><textarea id="ogf-gt" maxlength="500" placeholder="Rapport de fin de mission…" aria-label="Message du registre des agents"></textarea>' +
      '<div class="ogf-row"><small id="ogf-gc">0 / 500</small></div><button type="button" class="og-submit" id="ogf-gs">TRANSMETTRE AU DOSSIER</button><div class="ogf-st" id="ogf-gst" aria-live="polite"></div></div>' +
      '<div id="ogf-gl"></div></div></main>';
    d.body.appendChild(o);
    var l = h("div", { id: "ogf-lb", class: "ogf-lb", role: "dialog", "aria-modal": "true", "aria-label": "Photo agrandie", hidden: true });
    l.innerHTML =
      '<div class="top"><span id="ogf-lb-n"></span><button type="button" class="og-btn-small" id="ogf-lb-x">✕ FERMER</button></div>' +
      '<div class="stage"><button type="button" class="nav pv" id="ogf-lb-pv" aria-label="Photo précédente">‹</button><img id="ogf-lb-i" alt="">' +
      '<button type="button" class="nav nx" id="ogf-lb-nx" aria-label="Photo suivante">›</button></div><div class="cap" id="ogf-lb-c"></div>';
    d.body.appendChild(l);
    $("#ogf-x").onclick = hide;
    $$("#ogf [data-t]").forEach(function (b) { b.onclick = function () { go(b.dataset.t); }; });
    $("#ogf-bilan").addEventListener("click", function (e) {
      var t = e.target.closest(".og-rk-th");
      if (t) t.parentNode.classList.toggle("og-shut");
      else if (e.target.closest("#ogf-anim")) { var r = $("#og-rank-open"); if (r) r.click(); }   // podium animé du site
    });
    $("#ogf-verdict").onclick = function () { P.open("verdict"); };
    $("#ogf-more").onclick = function () { photos(); };
    if (w.IntersectionObserver) new IntersectionObserver(function (es) { if (es[0].isIntersecting && S.ph && S.ph.more) photos(); }, { root: $("#ogf-body"), rootMargin: "600px" }).observe($("#ogf-more"));
    var ta = $("#ogf-gt");
    ta.addEventListener("input", function () { $("#ogf-gc").textContent = ta.value.length + " / 500"; });
    $("#ogf-gs").onclick = gbSend;
    $("#ogf-gl").addEventListener("click", function (e) {
      var b = e.target.closest("[data-del]");
      if (b && w.confirm("Supprimer ce message du registre ?")) {
        rpc("og_finale_call", "gb_delete", { id: b.dataset.del }).then(function (j) { S.gb = j.messages || []; gbDraw(); }, function (x) { toast(say(x), "no"); });
      }
    });
    $("#ogf-lb-x").onclick = function () { l.hidden = true; };
    $("#ogf-lb-pv").onclick = function () { lbGo(-1); };
    $("#ogf-lb-nx").onclick = function () { lbGo(1); };
  }
  d.addEventListener("keydown", function (e) {
    if (!S.open || e.cancelBubble) return;   // cancelBubble : un autre panneau (emblème agrandi…) a déjà pris la touche
    var l = $("#ogf-lb"), pod = $("#og-podium"), po = $(".ogp");
    if ((pod && !pod.hidden) || (po && !po.hidden)) return;   // podium animé ou galerie du concours au-dessus : ils gèrent leur Échap
    if (l && !l.hidden) {
      if (e.key === "Escape") { e.stopPropagation(); l.hidden = true; }
      else if (e.key === "ArrowLeft") lbGo(-1);
      else if (e.key === "ArrowRight") lbGo(1);
    } else if (e.key === "Escape") hide();
  }, true);

  function css() {
    if ($("#ogf-css")) return;
    var s = h("style", { id: "ogf-css" });
    s.textContent = `
html.ogf-lock{overflow:hidden}
.ogf-bar{display:flex;align-items:center;justify-content:space-between;gap:10px 16px;flex-wrap:wrap;margin-bottom:18px;padding:12px 16px;background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--muted)}
.ogf-bar.on{border-color:var(--amber)}
.ogf-bar strong{display:block;font:700 15px var(--sans);letter-spacing:.18em}
.ogf-bar.on strong{color:var(--amber)}
.ogf-bar span{font-size:12px;color:var(--muted)}
.ogf-bar .og-item-controls{margin-top:0}
.ogf{position:fixed;inset:0;z-index:7000;display:flex;flex-direction:column;background-color:var(--bg);background-image:var(--grid);background-size:40px 40px;color:var(--text);font-family:var(--mono);color-scheme:dark}
.ogf[hidden],.ogf-bar[hidden],.ogf-pane[hidden],.ogf-lb[hidden],.ogf-more[hidden]{display:none!important}
.ogf *,.ogf-lb *{box-sizing:border-box}
.ogf-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;padding-top:calc(10px + env(safe-area-inset-top,0px));background:var(--panel);border-bottom:1px solid var(--line)}
.ogf-head b{display:block;font:700 17px var(--sans);letter-spacing:.2em}
.ogf-head small{display:block;margin-top:3px;font-size:10px;letter-spacing:.16em;color:var(--amber)}
.ogf-tabs{display:flex;background:var(--panel);border-bottom:1px solid var(--line);overflow-x:auto}
.ogf-tabs button{flex:1 0 auto;min-height:46px;padding:0 16px;background:transparent;border:0;border-bottom:2px solid transparent;color:var(--muted);font:600 12px var(--mono);letter-spacing:.12em;cursor:pointer}
.ogf-tabs button[aria-selected=true]{color:var(--amber);border-bottom-color:var(--amber)}
.ogf-tabs button:focus-visible{outline:2px solid var(--amber);outline-offset:-2px}
@media (max-width:420px){.ogf-tabs button{padding:0 10px;letter-spacing:.08em}}
.ogf-body{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;padding:18px 14px calc(40px + env(safe-area-inset-bottom,0px))}
.ogf-pane{max-width:900px;margin:0 auto}
.ogf-lab{margin:6px 0;font-size:11px;letter-spacing:.22em;color:var(--muted);text-align:center}
.ogf-lab.ogf-l{margin:24px 0 10px;text-align:left;color:var(--amber)}
.ogf-hero{text-align:center;padding:28px 14px 24px;background:var(--surface);border:1px solid var(--line);border-top:2px solid var(--amber)}
.ogf-stamp{display:inline-block;margin-bottom:12px;padding:5px 16px;border:2px solid var(--granted);color:var(--granted);font:700 13px var(--mono);letter-spacing:.3em;transform:rotate(-3deg);animation:ogf-stamp .7s cubic-bezier(.2,.9,.3,1.3) .2s both}
@keyframes ogf-stamp{from{opacity:0;transform:scale(2.6) rotate(-14deg)}to{opacity:1;transform:rotate(-3deg)}}
.ogf-win{display:flex;flex-direction:column;align-items:center;gap:8px;margin:14px 0 4px}
.ogf-win img{width:104px;height:104px;object-fit:contain;border:1px solid var(--c);background:var(--bg)}
.ogf-win b{max-width:100%;overflow-wrap:break-word;font:700 clamp(26px,8vw,44px)/1.1 var(--sans);letter-spacing:.1em;color:var(--c)}
.ogf-win span{font:600 16px var(--mono);letter-spacing:.14em;color:var(--gold)}
.ogf-me{margin:14px 0 0;padding:10px 12px;border:1px dashed var(--line);text-align:center;font-size:12px;letter-spacing:.1em;color:var(--muted)}
.ogf-me b{color:var(--text)}
.ogf-pod{display:flex;align-items:flex-end;justify-content:center;gap:8px;max-width:640px;margin:0 auto}
.ogf-step{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.ogf-step img{width:52px;height:52px;object-fit:contain;border:1px solid var(--c);background:var(--bg)}
.ogf-step b{max-width:100%;overflow-wrap:break-word;font:700 14px/1.2 var(--sans);letter-spacing:.06em}
.ogf-step span{font-size:11px;letter-spacing:.1em;color:var(--muted)}
.ogf-blk{width:100%;display:flex;align-items:center;justify-content:center;background:var(--raised);border:1px solid var(--line);border-top:3px solid var(--c);font:700 34px var(--sans)}
.ogf-step.k1 .ogf-blk{height:128px;color:var(--gold)}
.ogf-step.k2 .ogf-blk{height:92px;color:var(--silver)}
.ogf-step.k3 .ogf-blk{height:66px;color:var(--bronze)}
.ogf-c{margin:14px 0;text-align:center}
.ogf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px}
.ogf-ph{position:relative;border:1px solid var(--line);background:var(--surface)}
.ogf-ph .im{display:block;width:100%;padding:0;border:0;background:var(--raised);cursor:pointer}
.ogf-ph img{display:block;width:100%;aspect-ratio:1;object-fit:cover}
.ogf-no{display:flex;align-items:center;justify-content:center;aspect-ratio:1;font-size:10px;color:var(--muted);text-align:center}
.ogf-ph .dl{position:absolute;right:4px;bottom:4px;min-width:38px;min-height:38px;background:rgba(13,15,12,.86);border:1px solid var(--line);color:var(--text);font-size:17px;cursor:pointer}
.ogf-ph .dl:hover{border-color:var(--amber);color:var(--amber)}
.ogf-more{display:block;margin:14px auto 0;min-height:44px}
.ogf-st{margin:0 0 10px;font-size:12px;line-height:1.5;color:var(--muted)}
.ogf-st.ok{color:var(--granted)}
.ogf-st.no{color:#e0715f}
.ogf-intro{margin:0 0 10px;font:400 15px/1.5 var(--sans);color:var(--muted)}
.ogf-form{margin-bottom:18px}
.ogf-form textarea{min-height:104px;resize:vertical}
.ogf-row{display:flex;justify-content:flex-end;margin-top:4px;font-size:11px;color:var(--muted)}
.ogf-msg{margin-bottom:10px;padding:12px 14px;background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--c,var(--amber))}
.ogf-mh{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;margin-bottom:6px;font-size:11px;letter-spacing:.1em;color:var(--muted)}
.ogf-mh b{font:700 14px var(--sans);letter-spacing:.1em;color:var(--text)}
.ogf-mt{margin:0;font:400 15px/1.55 var(--sans);white-space:pre-wrap;overflow-wrap:anywhere}
.ogf-msg .og-btn-small{margin-top:8px}
.ogf-lb{position:fixed;inset:0;z-index:7500;display:flex;flex-direction:column;background:#050604;color:var(--text);font-family:var(--mono)}
.ogf-lb .top{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;padding-top:calc(10px + env(safe-area-inset-top,0px));font-size:12px;color:var(--muted)}
.ogf-lb .stage{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center}
.ogf-lb img{max-width:100%;max-height:100%;object-fit:contain}
.ogf-lb .nav{position:absolute;top:50%;transform:translateY(-50%);width:46px;height:64px;background:rgba(20,23,15,.78);border:1px solid var(--line);color:var(--text);font-size:22px;cursor:pointer}
.ogf-lb .pv{left:6px}
.ogf-lb .nx{right:6px}
.ogf-lb .nav:disabled{opacity:.3;cursor:default}
.ogf-lb .cap{padding:10px 14px calc(14px + env(safe-area-inset-bottom,0px));max-height:36vh;overflow:auto;border-top:1px solid var(--line);background:var(--panel)}
.ogf-lb h3{margin:4px 0;font:700 17px/1.25 var(--sans)}
.ogf-lb p{margin:4px 0;font:400 14px/1.5 var(--sans);color:var(--muted)}
.ogf-lb .og-btn-small{margin-top:8px}
.ogf-pri{background:var(--amber)!important;border-color:var(--amber)!important;color:var(--bg)!important}
.ogf-toast{position:fixed;left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:9600;margin:0 auto;max-width:460px;padding:12px 14px;background:var(--raised);border:1px solid var(--line);color:var(--text);font:13px/1.4 var(--mono);opacity:0;pointer-events:none;transform:translateY(8px);transition:opacity .2s,transform .2s}
.ogf-toast.on{opacity:1;transform:none}
.ogf-toast.ok{border-color:var(--granted)}
.ogf-toast.no{border-color:var(--denied)}
@media (prefers-reduced-motion:reduce){.ogf-stamp{animation:none}}
`;
    d.head.appendChild(s);
  }

  // ---------- Branchement sur le site : démarre quand le tableau de bord est prêt (après connexion) ----------
  var init = P.init;
  P.init = function (c) {
    cfg = c;
    var r = init.apply(P, arguments);
    boot();
    return r;
  };
  function boot() {
    if (booted) return;
    booted = true;
    css();
    var dash = $("#og-dashboard"), after = $("#og-dashboard-reveal");
    if (dash) dash.insertBefore(h("div", { id: "ogf-bar", class: "ogf-bar", hidden: true }), after ? after.nextSibling : dash.firstChild);
    refresh();
    setInterval(refresh, 8000);
    d.addEventListener("visibilitychange", refresh);
  }
  w.OGFinale = { show: show, refresh: refresh };
})(window, document);

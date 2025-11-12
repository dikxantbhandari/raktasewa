/* =========================
   Base config (frontend -> backend)
   ========================= */
const API_BASE =
  (location.hostname === "localhost" && (location.port === "3000" || location.port === ""))
    ? "http://localhost:5000" // backend port
    : "";

/* =========================
   Small utilities
   ========================= */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const escapeHTML = (s = "") =>
  s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const qs = (obj) => {
  const sp = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") sp.append(k, v);
  });
  const str = sp.toString();
  return str ? `?${str}` : "";
};
// Fallback phone mask (if API didn't send phone_masked)
const maskLocal = (p) => {
  if (!p) return "hidden";
  const digits = p.replace(/^\+\d{1,3}/, "");
  if (digits.length < 3) return "hidden";
  return `98${"*".repeat(digits.length - 3)}${digits.slice(-1)}`;
};
// Mobile detector
const isMobileUA = /iphone|ipad|ipod|android/i.test(navigator.userAgent);

/* =========================
   Intro / Audio
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  const intro   = $("#intro-screen");
  const start   = $("#startBtn");
  const appRoot = $("#appRoot");
  const audio   = $("#bgAudio");
  const muteBtn = $("#muteBtn");

  if (intro) intro.style.display = "flex";
  if (appRoot) appRoot.style.visibility = "hidden";

  const renderIcon = () => {
    if (!muteBtn || !audio) return;
    muteBtn.textContent = audio.muted ? "🔇" : "🔊";
  };

  if (start && intro) {
    start.addEventListener("click", async () => {
      intro.classList.add("fade-out");
      setTimeout(() => {
        intro.remove();
        appRoot.style.visibility = "visible";
      }, 600);

      if (audio) {
        try { audio.muted = true; audio.currentTime = 0; await audio.play(); } catch {}
      }
      renderIcon();
    });
  }

  if (muteBtn && audio) {
    renderIcon();
    muteBtn.addEventListener("click", async () => {
      audio.muted = !audio.muted;
      if (!audio.muted) { try { await audio.play(); } catch {} }
      renderIcon();
    });
  }
});

/* =========================
   Donor list (load & render)
   ========================= */
async function load(params = {}) {
  try {
    const r = await fetch(`${API_BASE}/api/donors` + qs(params));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    renderList(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error("Load donors failed:", e);
    renderList([]);
  }
}

function renderList(list) {
  const wrap  = $("#list");
  const count = $("#countPill");
  const empty = $("#empty");

  wrap.innerHTML = "";
  count.textContent = `${list.length} donor${list.length === 1 ? "" : "s"}`;

  if (!list.length) { empty.style.display = "flex"; return; }
  empty.style.display = "none";

  list.forEach((d) => {
    const card = document.createElement("div");
    card.className = "item";

    // Prefer backend phone; if hidden, this will be null and we’ll fall back to modal
    const realPhone   = (typeof d.phone === "string" && /^\+?\d+/.test(d.phone)) ? d.phone : null;
    const phoneMasked = d.phone_masked || maskLocal(d.phone);

    const smsBody = encodeURIComponent(
      `Hello ${d.name || "donor"}, I need ${d.blood_group} blood via RaktaSewa.`
    );
    const smsLink = realPhone ? `sms:${realPhone}?body=${smsBody}` : null;
    const telLink = realPhone ? `tel:${realPhone}` : null;

    card.innerHTML = `
      <div class="item__left">
        <div class="item__name">${escapeHTML(d.name)}</div>
        <div class="item__meta">
          ${escapeHTML(d.municipality || "")}${d.municipality ? ", " : ""}${escapeHTML(d.district)}${d.ward ? ", " + escapeHTML(d.ward) : ""}
        </div>
        <div class="tags">
          <span class="tag">${escapeHTML(d.blood_group)}</span>
          <span class="tag">${escapeHTML(phoneMasked)}</span>
        </div>
      </div>
      <div class="item__actions">
        <button class="btn btn--blue act-message">Message</button>
        <button class="btn btn--red act-call">Call</button>
        <button class="btn btn--ghost act-del">Delete</button>
      </div>
    `;

    // Message -> SMS app on mobile if number available, else fallback to modal
    card.querySelector(".act-message").addEventListener("click", () => {
      if (isMobileUA && smsLink) {
        location.href = smsLink;
      } else if (!realPhone) {
        // privacy mode: number hidden, use your existing private relay modal
        openMessageModal(d);
      } else {
        // desktop: still try opening default handler, or copy to clipboard if blocked
        try {
          location.href = smsLink;
        } catch {
          navigator.clipboard?.writeText(realPhone);
          alert(`SMS number copied: ${realPhone}`);
        }
      }
    });

    // Call -> phone dialer on mobile if number available, else fallback to modal
    card.querySelector(".act-call").addEventListener("click", () => {
      if (isMobileUA && telLink) {
        location.href = telLink;
      } else if (!realPhone) {
        alert("Phone is hidden for privacy. Use Message to contact privately.");
        openMessageModal(d);
      } else {
        try {
          location.href = telLink;
        } catch {
          navigator.clipboard?.writeText(realPhone);
          alert(`Phone copied: ${realPhone}`);
        }
      }
    });

    // Delete donor (simple)
    card.querySelector(".act-del").addEventListener("click", async () => {
      if (!confirm(`Delete donor "${d.name}"?`)) return;
      try {
        const r = await fetch(`${API_BASE}/api/donors/${d._id}`, { method: "DELETE" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        load();
      } catch (err) {
        alert(err?.message || "Failed to delete");
      }
    });

    wrap.appendChild(card);
  });
}

/* =========================
   Register donor
   ========================= */
$("#addBtn")?.addEventListener("click", async () => {
  const name = $("#name").value.trim();
  const blood_group = $("#blood").value;

  let code = $("#countryCode").value;
  const customCodeEl = $("#customCode");
  if (code === "custom") code = (customCodeEl.value || "").trim();
  let phoneLocal = $("#phone").value.trim();
  if (!code.startsWith("+")) code = `+${code}`;
  const phone = `${code}${phoneLocal}`;

  const district = $("#district").value.trim();
  const municipality = $("#municipality").value.trim();
  const ward = $("#ward").value.trim();

  if (!name || !blood_group || !district || !phoneLocal) {
    alert("Please fill name, blood group, district and phone."); return;
  }
  if (!/^\+\d{7,15}$/.test(phone)) {
    alert("Phone must include country code, e.g. +9779812345670"); return;
  }

  try {
    const r = await fetch(`${API_BASE}/api/donors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, blood_group, phone, district, municipality, ward }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Failed to register");

    alert("Registration successful!");

    ["name","blood","phone","district","municipality","ward"].forEach(id => { const el = $("#"+id); if (el) el.value = ""; });
    $("#countryCode").value = "+977";
    if (customCodeEl) { customCodeEl.value = ""; customCodeEl.style.display = "none"; }
    load();
  } catch (err) {
    alert(err.message || "Could not register donor");
  }
});

// show/hide custom code box
$("#countryCode")?.addEventListener("change", (e) => {
  const cc = $("#customCode"); if (!cc) return;
  cc.style.display = (e.target.value === "custom") ? "block" : "none";
  if (e.target.value !== "custom") cc.value = "";
});

/* =========================
   Search / Reset
   ========================= */
$("#searchBtn")?.addEventListener("click", (e) => {
  e.preventDefault();
  const params = {
    blood_group: $("#s_blood").value,
    district: $("#s_district").value.trim(),
    municipality: $("#s_muni").value.trim(),
    ward: $("#s_ward").value.trim(),
  };
  if (!params.blood_group || params.blood_group === "All Blood Groups") delete params.blood_group;
  load(params);
});
$("#resetBtn")?.addEventListener("click", () => {
  ["s_blood","s_district","s_muni","s_ward"].forEach(id => { const el = $("#"+id); if (el) el.value = ""; });
  load();
});

/* =========================
   Message modal (private relay fallback)
   ========================= */
const msgModal = $("#msgModal");
const msgForm  = $("#msgForm");
$("#msgCancel")?.addEventListener("click", () => msgModal.classList.add("hidden"));

function openMessageModal(donor) {
  msgForm.reset();
  msgForm.querySelector("[name=donorId]").value = donor._id;
  msgModal.classList.remove("hidden");
}

msgForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(msgForm).entries());

  try {
    const r = await fetch(`${API_BASE}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    let data = {};
    try { data = JSON.parse(text); } catch {}

    if (!r.ok) {
      alert(data?.error || text || `HTTP ${r.status}`);
      return;
    }

    if (data.relay || data.relayed) {
      alert("Your request was sent privately. The donor will reply to your phone.");
    } else {
      alert("Request saved. (Server not relaying SMS — opening your SMS app if possible.)");
      if (isMobileUA && (data.smsLink || data.smstoLink)) {
        location.href = /iphone|ipad|ipod/i.test(navigator.userAgent) ? (data.smstoLink || data.smsLink) : (data.smsLink || data.smstoLink);
      }
    }
    msgModal.classList.add("hidden");
  } catch (err) {
    alert(err?.message || "Network error");
  }
});

/* =========================
   First render
   ========================= */
document.addEventListener("DOMContentLoaded", () => load());

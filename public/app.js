
(function initIntro(){
  function showApp() {
    const app = document.getElementById("appRoot");
    const intro = document.getElementById("intro-screen");
    if (!app || !intro) return;
    app.style.visibility = "visible";
    intro.classList.add("fade-out");
    setTimeout(() => { intro.style.display = "none"; }, 650);
  }
  window.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("startBtn");
    if (btn) btn.addEventListener("click", showApp);
  });
})();


window.addEventListener("DOMContentLoaded", () => {
  const audio = document.getElementById("bgAudio");
  const muteBtn = document.getElementById("muteBtn");
  if (!audio || !muteBtn) return;

  const saved = localStorage.getItem("bg_muted");
  if (saved !== null) audio.muted = saved === "true";

  const updateIcon = () => {
    muteBtn.textContent = audio.muted ? "🔇" : "🔊";
    muteBtn.setAttribute("aria-label", audio.muted ? "Unmute" : "Mute");
  };
  updateIcon();

 
  const tryPlay = () => { audio.play().catch(()=>{}); };
  document.addEventListener("click", tryPlay, { once:true, capture:true });
  document.addEventListener("touchstart", tryPlay, { once:true, capture:true });

  muteBtn.addEventListener("click", () => {
    audio.muted = !audio.muted;
    localStorage.setItem("bg_muted", String(audio.muted));
    updateIcon();
    if (!audio.muted) audio.play().catch(()=>{});
  });
});


const api = (path, opts = {}) =>
  fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });

// Phone helpers
function getFullPhone() {
  const ccSelect = document.getElementById("countryCode");
  const custom = document.getElementById("customCode");
  const local = document.getElementById("phone");
  let code = ccSelect.value === "custom" ? (custom.value || "").trim() : ccSelect.value;
  let num = (local.value || "").trim();
  code = code.replace(/\s+/g, "");
  num = num.replace(/[\s-]/g, "");
  if (code && !code.startsWith("+")) code = "+" + code;
  return { full: code + num, code, num };
}

// Rendering 
function renderList(items) {
  const list = document.getElementById("list");
  const empty = document.getElementById("empty");
  const pill = document.getElementById("countPill");
  pill.textContent = `${items.length} donor${items.length === 1 ? "" : "s"}`;
  list.innerHTML = "";
  if (!items.length) { empty.style.display = "flex"; return; }
  empty.style.display = "none";

  items.forEach((d) => {
    const row = document.createElement("div");
    row.className = "item";

    const left = document.createElement("div");
    left.className = "item__left";

    const name = document.createElement("div");
    name.className = "item__name";
    name.textContent = d.name;

    const meta = document.createElement("div");
    meta.className = "item__meta";
    const place = [d.district, d.municipality, d.ward].filter(Boolean).join(", ");
    meta.textContent = place || d.district;

    const tags = document.createElement("div");
    tags.className = "tags";
    const t1 = document.createElement("span"); t1.className = "tag"; t1.textContent = d.blood_group;
    const t2 = document.createElement("span"); t2.className = "tag"; t2.textContent = d.phone;
    tags.append(t1, t2);

    left.append(name, meta, tags);

    const actions = document.createElement("div");
    actions.className = "item__actions";

    const call = document.createElement("a");
    call.href = `tel:${d.phone}`;
    call.className = "btn btn--red";
    call.textContent = "Call";

    const sms = document.createElement("a");
    sms.href = `sms:${d.phone}`;
    sms.className = "btn btn--blue";
    sms.textContent = "Message";

   
    actions.append(call, sms);

    row.append(left, actions);
    list.append(row);
  });
}

// Data fetchers 
async function load(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await api("/api/donors" + (qs ? `?${qs}` : ""));
  const data = await res.json();
  renderList(data);
}

function search() {
  const params = {};
  const blood = document.getElementById("s_blood").value;
  const district = document.getElementById("s_district").value.trim();
  const muni = document.getElementById("s_muni").value.trim();
  const ward = document.getElementById("s_ward").value.trim();
  if (blood) params.blood_group = blood;
  if (district) params.district = district;
  const q = [muni, ward].filter(Boolean).join(" ");
  if (q) params.q = q;
  load(params);
}

//  Create donor
async function add() {
  const { full, code } = getFullPhone();

  const payload = {
    name: document.getElementById("name").value.trim(),
    blood_group: document.getElementById("blood").value,
    phone: full,
    district: document.getElementById("district").value.trim(),
    municipality: document.getElementById("municipality").value.trim(),
    ward: document.getElementById("ward").value.trim(),
  };

  if (!payload.name || !payload.blood_group || !payload.phone || !payload.district) {
    alert("Please fill name, blood group, phone (with code), and district.");
    return;
  }
  if (!/^\+\d{7,15}$/.test(payload.phone)) {
    alert("Please enter a valid international phone (e.g., +9779801234567).");
    return;
  }
  if (code === "+977" && !/^\+9779[78]\d{8}$/.test(payload.phone)) {
    alert("Nepal mobile should look like +97798XXXXXXXX or +97797XXXXXXXX.");
    return;
  }

  const res = await api("/api/donors", { method: "POST", body: JSON.stringify(payload) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.error || "Failed to register donor");
    return;
  }

  document.getElementById("name").value = "";
  document.getElementById("blood").value = "";
  document.getElementById("phone").value = "";
  document.getElementById("municipality").value = "";
  document.getElementById("ward").value = "";
  document.getElementById("countryCode").value = "+977";
  const custom = document.getElementById("customCode");
  custom.value = ""; custom.style.display = "none";

  search();
}
//  Events 
document.getElementById("addBtn").addEventListener("click", add);
document.getElementById("searchBtn").addEventListener("click", search);

// Reset button
const resetBtn = document.getElementById("resetBtn");
if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    document.getElementById("s_blood").value = "";
    document.getElementById("s_district").value = "";
    document.getElementById("s_muni").value = "";
    document.getElementById("s_ward").value = "";
    load();
  });
}

// Toggle custom code field
const ccSel = document.getElementById("countryCode");
if (ccSel) {
  ccSel.addEventListener("change", (e) => {
    const show = e.target.value === "custom";
    const custom = document.getElementById("customCode");
    custom.style.display = show ? "block" : "none";
    if (show) custom.focus(); else custom.value = "";
  });
}


load();

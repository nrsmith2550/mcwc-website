/* Mountain Cat Wrestling Club — site script
 * Modes:
 *   demo     – no Firebase config: sample posts, "Preview as" menu, nothing saved.
 *   firebase – staff sign in with Google; posts live in Cloud Firestore.
 */
(function () {
"use strict";
const CFG = window.MCWC_CONFIG || {};
const FIREBASE_VERSION = "10.12.2";
const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
};
const money = n => "$" + n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2800); }

/* Text with clickable links; never injects HTML. */
function richText(node, text) {
  node.replaceChildren();
  const re = /https?:\/\/[^\s<>"]+/g; let last = 0, m;
  while ((m = re.exec(text))) {
    const url = m[0].replace(/[.,!?;:)\]]+$/, "");
    node.append(text.slice(last, m.index));
    node.append(el("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: url }));
    last = m.index + url.length; re.lastIndex = last;
  }
  node.append(text.slice(last));
}

/* ---------- modal ---------- */
function showModal(title, content, buttons) {
  const body = typeof content === "string" ? el("p", { class: "muted", text: content }) : content;
  $("#modalBox").replaceChildren(el("h3", { text: title }), body,
    el("div", { style: "display:flex;gap:10px;justify-content:flex-end;margin-top:8px" },
      ...buttons.map(([t, fn], i) => el("button", { class: "btn " + (i === 0 ? "primary" : "ghost"), text: t, onclick: fn }))));
  $("#modal").classList.add("open");
}
function closeModal() { $("#modal").classList.remove("open"); }
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });

/* ================= STATE ================= */
let mode = "demo";            // demo | firebase
let role = "visitor";         // visitor | member | staff (what this viewer can see)
let tier = null;
let user = null;              // firebase user
let staffChecked = false;     // firebase: have we looked the user up in the staff list?
let posts = [], feedState = "loading", feedCat = "All", expanded = new Set();
let editingId = null;
let staffList = [], staffState = "idle";
let backend = null;
const isStaff = () => role === "staff";

/* ================= MEMBERSHIP LEVELS ================= */
// Membership levels and their Stripe payment links (same checkouts as mcatwc.org).
const LEVELS = [
  { name: "Tom Cat", annual: 60, monthly: 5, perks: "Admission to home matches + newsletter",
    annualUrl: "https://buy.stripe.com/14k173cYm6K1gY87st", monthlyUrl: "https://buy.stripe.com/aEUg1Xgay1pH23eeV2" },
  { name: "Blue Cat", annual: 120, monthly: 10, perks: "Tom Cat Level + MCWC T-Shirt",
    annualUrl: "https://buy.stripe.com/aEU5nj3nM0lD9vGdQS", monthlyUrl: "https://buy.stripe.com/cN2bLH5vU9Wd8rC8wF" },
  { name: "Bronze Cat", annual: 250, monthly: 21, perks: "Blue Cat Level + MCWC Hooded Sweatshirt",
    annualUrl: "https://buy.stripe.com/eVa2b75vU9WdfU47sx", monthlyUrl: "https://buy.stripe.com/28o3fb2jI8S923e9AK" },
  { name: "Silver Cat", annual: 600, monthly: 50, perks: "Bronze Cat + MCWC Hat + MCWC Tumbler",
    annualUrl: "https://buy.stripe.com/eVadTP9Mad8p5fq9AD", monthlyUrl: "https://buy.stripe.com/3cs3fbgay7O5dLW00b" },
  { name: "Gold Cat", annual: 1000, perks: "Silver Cat + MCWC 1/4 Zip Jacket",
    annualUrl: "https://buy.stripe.com/28o173bUi6K1dLW4gk" },
  { name: "Platinum Cat", annual: 2000, perks: "Gold Cat + Hotel voucher for the alumni match",
    annualUrl: "https://buy.stripe.com/fZebLH8I69Wd6ju9AG" },
  { name: "Mountain Cat", annual: 3500, perks: "Platinum Cat + ½ day (4hr) clinic of your choice",
    annualUrl: "https://buy.stripe.com/fZe02Zgayfgx23e14b", featured: true }
];
function tierCards() {
  const ext = { target: "_blank", rel: "noopener" };
  return el("div", { class: "tiers" }, ...LEVELS.map(l => {
    const t = el("div", { class: "tier" + (l.featured ? " feat" : "") },
      el("div", { class: "lvl", text: l.name }),
      el("div", { class: "amt" }, document.createTextNode(money(l.annual)), el("span", { class: "per", text: " / year" })),
      el("div", { class: "muted mo", text: l.monthly ? "or " + money(l.monthly) + " a month" : "Annual only" }),
      el("p", { class: "perks", text: l.perks }));
    const btns = el("div", { class: "tier-btns" },
      el("a", { class: "btn " + (l.featured ? "primary" : "navy"), href: l.annualUrl, ...ext, text: money(l.annual) + " yearly" }));
    if (l.monthlyUrl) btns.append(el("a", { class: "btn ghost", href: l.monthlyUrl, ...ext, text: money(l.monthly) + " monthly" }));
    t.append(btns);
    return t;
  }));
}
function joinFlow(lvl) {
  if (CFG.joinUrl) { window.open(CFG.joinUrl, "_blank", "noopener"); return; }
  if (mode === "firebase") { showModal("Membership sign-up", "Online membership sign-up is coming soon. Contact the club to join.", [["OK", closeModal]]); return; }
  showModal("Join as " + lvl + " (prototype)", "On the live site this step takes the annual dues payment and creates the member's login. In this preview, continuing unlocks the Member Feed.",
    [["Continue", () => { tier = lvl; role = "member"; $("#roleSel").value = "member"; closeModal(); location.hash = "#alumni"; renderAll(); toast("Welcome to the club, " + lvl + "!"); }], ["Cancel", closeModal]]);
}
function renderJoinPage() {
  $("#tiersA").replaceChildren(tierCards(),
    el("p", { class: "muted", style: "font-size:.9rem;margin-top:18px" }, document.createTextNode("Checkout is handled securely by Stripe and opens in a new tab. Questions? Call 412-337-5879 or email "), el("a", { href: "mailto:Mcatwc22@gmail.com", text: "Mcatwc22@gmail.com" }), document.createTextNode(".")));
}
function renderGate() {
  const g = $("#tiersB"); const kids = [];
  kids.push(el("h2", { text: "Members only" }), el("p", { class: "muted", text: "The Member Feed is for paid club members. Pick a level to join." }), tierCards());
  if (mode === "demo") kids.push(el("p", { class: "muted", style: "font-size:.88rem;margin-top:14px" }, document.createTextNode("Already a member? "), el("button", { class: "linkbtn", text: "Sign in", onclick: () => joinFlow("Tom Cat") })));
  g.replaceChildren(...kids);
}

/* ================= STAFF LOGIN PAGE (#staff, unlisted) ================= */
let signingIn = false;
function renderStaffLogin() {
  const c = $("#staffLoginCard"); const kids = [];
  const btn = (cls, text, fn) => el("button", { class: "btn " + cls, text, onclick: fn, style: "justify-content:center;width:100%;margin-top:10px" });
  const link = (cls, text, href) => el("a", { class: "btn " + cls, text, href, style: "justify-content:center;width:100%;margin-top:10px" });
  if (mode === "demo") {
    kids.push(el("h3", { text: "Demo mode" }), el("p", { class: "muted", text: "Firebase isn't connected, so there's nothing to sign in to. Use the “Preview as” menu at the top to try the staff tools." }));
  } else if (!user) {
    kids.push(el("h3", { text: "Sign in" }), el("p", { class: "muted", text: "Use the Google account the club added to the staff list." }),
      btn("navy", signingIn ? "Opening Google…" : "Sign in with Google", signIn));
  } else if (!staffChecked) {
    kids.push(el("h3", { text: "Checking access…" }), el("p", { class: "muted", text: user.email || "" }));
  } else if (isStaff()) {
    kids.push(el("h3", { text: "You're signed in" }), el("p", { class: "muted", text: user.email || "" }),
      link("primary", "+ New post", "#alumni-post"), link("navy", "Go to the Member Feed", "#alumni"), link("ghost", "Staff access", "#admin"),
      el("p", { style: "margin:16px 0 0" }, el("button", { class: "linkbtn", text: "Sign out", onclick: signOut })));
  } else {
    kids.push(el("h3", { text: "Not on the staff list" }),
      el("p", { class: "muted", text: (user.email || "This account") + " isn't on the club's staff list. Ask a club admin to add it, or sign in with a different Google account." }),
      btn("navy", "Use a different account", async () => { await signOut(); signIn(); }),
      el("p", { style: "margin:16px 0 0" }, el("button", { class: "linkbtn", text: "Sign out", onclick: signOut })));
  }
  c.replaceChildren(...kids);
}

/* ================= STORE (unchanged) ================= */
const N = "#13254b", G = "#ffb81c", W = "#ffffff", GR = "#9aa3b5";
function mark(cx, cy, s, col, acc) { return `<g transform="translate(${cx} ${cy}) scale(${s})"><path d="M-22 10l10-15 6 8 7-13 21 20z" fill="${acc}"/><text x="0" y="28" text-anchor="middle" font-family="Barlow Condensed,Impact,sans-serif" font-weight="800" font-size="15" fill="${col}" letter-spacing="1">MCWC</text></g>`; }
const ART = {
  tee: (bg, fg, ac) => `<svg viewBox="0 0 200 200" width="70%"><path d="M60 40l20-10h40l20 10 30 22-16 22-14-8v94H60V76l-14 8-16-22z" fill="${bg}"/>${mark(100, 92, 1.25, fg, ac)}</svg>`,
  hoodie: (bg, fg, ac) => `<svg viewBox="0 0 200 200" width="70%"><path d="M70 36q30-22 60 0l32 22 14 70-18 6-10-50v90H52V84l-10 50-18-6 14-70z" fill="${bg}"/><path d="M78 38q22 26 44 0" fill="none" stroke="${fg}" stroke-opacity=".4" stroke-width="3"/><rect x="72" y="140" width="56" height="22" rx="6" fill="none" stroke="${fg}" stroke-opacity=".3" stroke-width="2"/>${mark(100, 98, 1.1, fg, ac)}</svg>`,
  qzip: (bg, fg, ac) => `<svg viewBox="0 0 200 200" width="70%"><path d="M72 34h56l34 22 14 72-18 6-10-50v90H52V84l-10 50-18-6 14-72z" fill="${bg}"/><path d="M100 34v40" stroke="${ac}" stroke-width="3"/><path d="M84 34l16 10 16-10" fill="none" stroke="${fg}" stroke-opacity=".5" stroke-width="3"/>${mark(130, 100, .7, fg, ac)}</svg>`,
  cap: (bg, fg, ac) => `<svg viewBox="0 0 200 200" width="70%"><path d="M40 122q0-66 60-66t60 66z" fill="${bg}"/><path d="M40 122q70 6 130-4l10 10q-80 14-150 4z" fill="${bg}" opacity=".85"/>${mark(100, 88, 1, fg, ac)}</svg>`,
  beanie: (bg, fg, ac) => `<svg viewBox="0 0 200 200" width="62%"><circle cx="100" cy="42" r="14" fill="${ac}"/><path d="M50 130q0-80 50-80t50 80z" fill="${bg}"/><rect x="46" y="124" width="108" height="34" rx="6" fill="${bg}" stroke="${ac}" stroke-width="3"/>${mark(100, 92, .85, fg, ac)}</svg>`,
  tumbler: (bg, fg, ac) => `<svg viewBox="0 0 200 200" width="52%"><rect x="66" y="28" width="68" height="14" rx="4" fill="${GR}"/><path d="M64 42h72l-8 132H72z" fill="${bg}"/>${mark(100, 100, 1, fg, ac)}</svg>`,
  decal: (bg, fg, ac) => `<svg viewBox="0 0 200 200" width="58%"><rect x="30" y="56" width="140" height="88" rx="10" fill="${bg}" stroke="${W}" stroke-width="5"/>${mark(100, 92, 1.3, fg, ac)}</svg>`,
  polo: (bg, fg, ac) => `<svg viewBox="0 0 200 200" width="70%"><path d="M60 40l22-10h36l22 10 30 22-16 22-14-8v94H60V76l-14 8-16-22z" fill="${bg}"/><path d="M82 30l18 18 18-18" fill="${W}" opacity=".9"/><path d="M100 48v22" stroke="${fg}" stroke-width="2"/>${mark(128, 92, .65, fg, ac)}</svg>`
};
const PRODUCTS = [
  { id: "tee-navy", name: "Club Logo Tee", cat: "Apparel", price: 25, art: "tee", bg: N, fg: W, ac: G, tile: "#e7ebf3", sizes: ["S", "M", "L", "XL", "2XL", "3XL"] },
  { id: "tee-gold", name: "Gold Mountain Tee", cat: "Apparel", price: 25, art: "tee", bg: G, fg: N, ac: N, tile: "#fff3d6", sizes: ["S", "M", "L", "XL", "2XL", "3XL"] },
  { id: "hoodie", name: "Mat Room Hoodie", cat: "Apparel", price: 50, art: "hoodie", bg: "#4a5368", fg: W, ac: G, tile: "#e7ebf3", sizes: ["S", "M", "L", "XL", "2XL", "3XL"] },
  { id: "qzip", name: "Club Quarter-Zip", cat: "Apparel", price: 60, art: "qzip", bg: N, fg: W, ac: G, tile: "#fff3d6", sizes: ["S", "M", "L", "XL", "2XL"] },
  { id: "polo", name: "Golf Outing Polo", cat: "Apparel", price: 45, art: "polo", bg: "#ffffff", fg: N, ac: G, tile: "#e1e6f0", sizes: ["S", "M", "L", "XL", "2XL"] },
  { id: "cap", name: "Snapback Cap", cat: "Headwear", price: 28, art: "cap", bg: N, fg: W, ac: G, tile: "#fff3d6" },
  { id: "beanie", name: "Knit Beanie", cat: "Headwear", price: 22, art: "beanie", bg: N, fg: W, ac: G, tile: "#e7ebf3" },
  { id: "tumbler", name: "Insulated Tumbler", cat: "Accessories", price: 30, art: "tumbler", bg: N, fg: W, ac: G, tile: "#fff3d6" },
  { id: "decal", name: "Car Decal", cat: "Accessories", price: 6, art: "decal", bg: N, fg: W, ac: G, tile: "#e7ebf3" }
];
const CATS = ["All", "Apparel", "Headwear", "Accessories"];
let storeCat = "All";
function renderFilters() { $("#filters").replaceChildren(...CATS.map(c => el("button", { class: "chip" + (c === storeCat ? " on" : ""), text: c, onclick: () => { storeCat = c; renderFilters(); renderProducts(); } }))); }
function artEl(p, cls) { const a = el("div", { class: cls }); a.style.background = p.tile; a.innerHTML = ART[p.art](p.bg, p.fg, p.ac); return a; }
function renderProducts() {
  $("#products").replaceChildren(...PRODUCTS.filter(p => storeCat === "All" || p.cat === storeCat).map(p => {
    const sel = p.sizes ? el("select", { "aria-label": "Size" }, ...p.sizes.map(s => el("option", { value: s, text: s }))) : null;
    return el("div", { class: "product" }, artEl(p, "art"), el("div", { class: "body" },
      el("span", { class: "tag", text: p.cat }),
      el("div", { class: "row" }, el("h3", { text: p.name }), el("span", { class: "price", text: money(p.price) })),
      sel, el("button", { class: "btn navy add", text: "Add to cart", onclick: () => addToCart(p, sel ? sel.value : null) })));
  }));
}
let cart = [];
function addToCart(p, opt) { const key = p.id + "|" + (opt || ""); const f = cart.find(i => i.key === key); if (f) f.qty++; else cart.push({ key, p, opt, qty: 1 }); renderCart(); toast(p.name + " added to cart"); }
function renderCart() {
  $("#cartCount").textContent = cart.reduce((a, i) => a + i.qty, 0);
  const box = $("#cartItems");
  if (!cart.length) box.replaceChildren(el("div", { class: "empty", style: "margin-top:20px", text: "Your cart is empty." }));
  else box.replaceChildren(...cart.map(i => el("div", { class: "line-item" }, artEl(i.p, "thumb"),
    el("div", { class: "grow" }, el("div", { style: "font-weight:600", text: i.p.name }), el("div", { class: "muted", style: "font-size:.85rem", text: (i.opt ? i.opt + " · " : "") + money(i.p.price) })),
    el("div", { class: "qty" }, el("button", { text: "−", "aria-label": "Decrease", onclick: () => { i.qty--; if (i.qty <= 0) cart = cart.filter(x => x !== i); renderCart(); } }), el("span", { text: String(i.qty) }), el("button", { text: "+", "aria-label": "Increase", onclick: () => { i.qty++; renderCart(); } })))));
  const sub = cart.reduce((a, i) => a + i.qty * i.p.price, 0), isMember = role !== "visitor", disc = isMember ? Math.round(sub * 10) / 100 : 0;
  $("#subtotal").textContent = money(sub - disc);
  $("#discountLine").textContent = isMember && sub ? `Member discount −${money(disc)} applied. Shipping and tax at checkout.` : "Shipping and tax calculated at checkout.";
  $("#checkoutBtn").disabled = !cart.length;
}
function openCart(o) { $("#drawer").classList.toggle("open", o); $("#scrim").classList.toggle("open", o); }
$("#cartBtn").onclick = () => openCart(true); $("#closeCart").onclick = () => openCart(false); $("#scrim").onclick = () => openCart(false);
$("#checkoutBtn").onclick = () => { openCart(false); showModal("Checkout (prototype)", "On the live site this hands off to a secure payment processor for card details, shipping and tax. No payment is taken in this prototype.", [["Got it", closeModal]]); };

/* ================= BACKENDS ================= */
const DEMO_POSTS = [
  { id: "d1", title: "Welcome to the new Member Feed", category: "Club news", author: "MCWC Board", status: "published", pinned: true, createdAt: Date.parse("2026-10-30T15:00:00Z"), body: "[Sample post]\n\nThis is where members will get club news first: event announcements, team updates, fundraising progress and notes from the program. Thanks for supporting Mountain Cat wrestling." },
  { id: "d2", title: "Alumni Night — save the date", category: "Events", author: "MCWC Board", status: "published", pinned: false, createdAt: Date.parse("2026-10-22T15:00:00Z"), body: "[Sample post]\n\nAlumni Night at the Sports Center is coming up this season. We'll post the date, opponent and pre-match gathering details here as soon as they're set." },
  { id: "d3", title: "Wrestling room entrance project", category: "Fundraising", author: "MCWC Board", status: "published", pinned: false, createdAt: Date.parse("2026-10-10T15:00:00Z"), body: "[Sample post]\n\nOne of the club's goals is a separate entrance to the wrestling room in the Sports Center, possibly with a lobby and study area. Watch here for progress updates." },
  { id: "d4", title: "Golf outing sponsors (draft)", category: "Fundraising", author: "MCWC Board", status: "draft", pinned: false, createdAt: Date.parse("2026-10-31T12:00:00Z"), body: "[Sample draft — only staff can see drafts]\n\nThank-you list for this year's golf outing sponsors. Finish before publishing." }
];
const DemoBackend = {
  start() { posts = DEMO_POSTS.map(p => ({ ...p })); feedState = "ready"; staffList = [{ id: "you@example.com", name: "You (demo)" }, { id: "coach@example.com", name: "Sample Coach" }]; staffState = "ready"; renderAll(); },
  async create(d) { posts.push({ ...d, id: "local" + Date.now(), createdAt: Date.now() }); renderAll(); },
  async update(id, d) { const p = posts.find(x => x.id === id); if (p) Object.assign(p, d); renderAll(); },
  async remove(id) { posts = posts.filter(x => x.id !== id); renderAll(); },
  async addStaff(email, name) { if (!staffList.some(s => s.id === email)) staffList.push({ id: email, name }); renderAll(); },
  async removeStaff(email) { staffList = staffList.filter(s => s.id !== email); renderAll(); }
};

let FB = null; // firebase modules + handles
const FirebaseBackend = {
  unsubPosts: null, unsubStaff: null,
  async start() {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
    const [app, auth, fs] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
    const fbApp = app.initializeApp(CFG.firebase);
    FB = { auth, fs, authInst: auth.getAuth(fbApp), db: fs.getFirestore(fbApp) };
    auth.onAuthStateChanged(FB.authInst, u => this.onUser(u));
  },
  async onUser(u) {
    user = u; staffChecked = false; role = "visitor";
    this.stopListeners(); posts = []; staffList = [];
    renderAll();
    if (!u) { staffChecked = true; renderAll(); return; }
    try {
      const snap = await FB.fs.getDoc(FB.fs.doc(FB.db, "staff", (u.email || "").toLowerCase()));
      role = snap.exists() ? "staff" : "visitor";
    } catch (e) { role = "visitor"; console.warn("staff check failed", e); }
    staffChecked = true;
    if (isStaff()) this.listen();
    renderAll();
    if (isStaff()) { toast("Signed in as staff"); if (location.hash === "#staff") location.hash = "#alumni"; }
  },
  listen() {
    const { fs } = FB;
    feedState = "loading";
    const timer = setTimeout(() => { if (feedState === "loading") { feedState = "slow"; renderAll(); } }, 10000);
    this.unsubPosts = fs.onSnapshot(fs.query(fs.collection(FB.db, "posts"), fs.orderBy("createdAt", "desc"), fs.limit(300)), snap => {
      clearTimeout(timer);
      posts = snap.docs.map(d => { const x = d.data({ serverTimestamps: "estimate" }); return { id: d.id, title: x.title, body: x.body, category: x.category, author: x.author, status: x.status || "published", pinned: !!x.pinned, createdAt: x.createdAt ? x.createdAt.toMillis() : Date.now(), createdBy: x.createdBy }; });
      feedState = "ready"; renderAll();
    }, err => { clearTimeout(timer); console.error(err); feedState = "error"; renderAll(); });
    staffState = "loading";
    this.unsubStaff = fs.onSnapshot(fs.collection(FB.db, "staff"), snap => {
      staffList = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id)); staffState = "ready"; renderAll();
    }, err => { console.error(err); staffState = "error"; renderAll(); });
  },
  stopListeners() { if (this.unsubPosts) this.unsubPosts(); if (this.unsubStaff) this.unsubStaff(); this.unsubPosts = this.unsubStaff = null; },
  async create(d) {
    const { fs } = FB; const now = fs.serverTimestamp();
    await fs.addDoc(fs.collection(FB.db, "posts"), { ...d, createdAt: now, updatedAt: now, createdBy: user.email.toLowerCase() });
  },
  async update(id, d) {
    const { fs } = FB;
    await fs.updateDoc(fs.doc(FB.db, "posts", id), { ...d, updatedAt: fs.serverTimestamp() });
  },
  async remove(id) { const { fs } = FB; await fs.deleteDoc(fs.doc(FB.db, "posts", id)); },
  async addStaff(email, name) {
    const { fs } = FB;
    await fs.setDoc(fs.doc(FB.db, "staff", email), { name: name || "", addedBy: user.email.toLowerCase(), addedAt: fs.serverTimestamp() });
  },
  async removeStaff(email) { const { fs } = FB; await fs.deleteDoc(fs.doc(FB.db, "staff", email)); }
};

async function signIn() {
  if (mode !== "firebase") return;
  const { auth } = FB; const provider = new auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  signingIn = true; renderAll();
  try { await auth.signInWithPopup(FB.authInst, provider); }
  catch (e) {
    signingIn = false; renderAll();
    if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) { await auth.signInWithRedirect(FB.authInst, provider); return; }
    if (e && e.code === "auth/popup-closed-by-user") return;
    if (e && e.code === "auth/unauthorized-domain") { showModal("Sign-in not set up for this address", "Add this website's domain under Firebase → Authentication → Settings → Authorized domains.", [["OK", closeModal]]); return; }
    toast("Couldn't sign in: " + ((e && e.code) || "error"));
    return;
  }
  signingIn = false; renderAll();
}
async function signOut() {
  if (mode !== "firebase") return;
  await FB.auth.signOut(FB.authInst); toast("Signed out");
  if (["#alumni-post", "#admin"].includes(location.hash)) location.hash = "#home";
}
$("#acctBtn").onclick = () => signOut();

function friendlyError(e) {
  const c = e && e.code || "";
  if (c.includes("permission-denied")) return "You don't have permission to do that. Is your account on the staff list?";
  if (c.includes("unavailable")) return "Can't reach the database. Check your connection and try again.";
  if (c.includes("resource-exhausted")) return "The free daily limit was reached. Try again tomorrow.";
  return "Something went wrong" + (c ? " (" + c + ")" : "") + ". Try again.";
}

/* ================= FEED ================= */
const PCATS = ["Club news", "Events", "Team update", "Alumni", "Fundraising"];
const fmtDate = ms => ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
function visiblePosts() {
  return posts.filter(p => isStaff() || p.status === "published")
    .slice().sort((a, b) => (b.pinned - a.pinned) || (b.createdAt - a.createdAt));
}
function renderFeed() {
  $("#catFilters").replaceChildren(...["All", ...PCATS].map(c => el("button", { class: "chip" + (c === feedCat ? " on" : ""), text: c, onclick: () => { feedCat = c; renderFeed(); } })));
  const st = $("#feedStatus"); st.replaceChildren();
  if (mode === "demo") st.append(el("div", { class: "notice", text: "Demo mode: sample posts. Changes you make here aren't saved and only show in this browser." }));
  if (feedState === "slow") st.append(el("div", { class: "notice", text: "The feed can't be reached yet — still trying." }));
  if (feedState === "error") st.append(el("div", { class: "notice", text: "Couldn't load the feed. Refresh the page to try again." }));
  const all = visiblePosts(), list = all.filter(p => feedCat === "All" || p.category === feedCat), fl = $("#feedList");
  if (feedState === "loading" && !posts.length) { fl.replaceChildren(el("div", { class: "empty", text: "Loading posts…" })); return; }
  if (!list.length) { fl.replaceChildren(el("div", { class: "empty", text: all.length ? "No posts in this category yet." : (isStaff() ? "No posts yet. Click “+ New post” to write the first one." : "No posts yet.") })); return; }
  fl.replaceChildren(...list.map(postCard));
}
function postCard(p) {
  const long = (p.body || "").length > 520, open = expanded.has(p.id);
  const text = el("div", { class: "text" + (long && !open ? " clamp" : "") }); richText(text, p.body || "");
  const meta = el("div", { class: "meta" }, el("span", { class: "cat", text: p.category || "Club news" }));
  if (p.pinned) meta.append(el("span", { class: "badge pin", text: "Pinned" }));
  if (p.status === "draft") meta.append(el("span", { class: "badge draft", text: "Draft" }));
  meta.append(el("span", { text: (p.author || "MCWC") + " · " + fmtDate(p.createdAt) }));
  const art = el("article", { class: "post" + (p.status === "draft" ? " is-draft" : "") + (p.pinned ? " is-pinned" : "") }, meta, el("h3", { text: p.title || "Untitled" }), text);
  const actions = el("div", { class: "actions" });
  if (long) actions.append(el("button", { class: "linkbtn", text: open ? "Show less" : "Read more", onclick: () => { open ? expanded.delete(p.id) : expanded.add(p.id); renderFeed(); } }));
  if (isStaff()) {
    actions.append(el("button", { class: "linkbtn", text: "Edit", onclick: () => startEdit(p) }));
    if (p.status === "draft") actions.append(el("button", { class: "linkbtn", text: "Publish", onclick: () => quickUpdate(p, { status: "published" }, "Published") }));
    actions.append(el("button", { class: "linkbtn", text: p.pinned ? "Unpin" : "Pin to top", onclick: () => quickUpdate(p, { pinned: !p.pinned }, p.pinned ? "Unpinned" : "Pinned to top") }));
    actions.append(el("button", { class: "linkbtn", style: "color:#b42318", text: "Delete", onclick: () => confirmDelete(p) }));
  }
  if (actions.childNodes.length) art.append(actions);
  return art;
}
async function quickUpdate(p, patch, msg) {
  try { await backend.update(p.id, { title: p.title, body: p.body, category: p.category, author: p.author, status: p.status, pinned: p.pinned, ...patch }); toast(msg); }
  catch (e) { toast(friendlyError(e)); }
}
function confirmDelete(p) {
  showModal("Delete this post?", "“" + (p.title || "Untitled") + "” will be removed from the Member Feed. This can't be undone.",
    [["Delete", async () => { closeModal(); try { await backend.remove(p.id); if (editingId === p.id) resetComposer(); toast("Post deleted"); } catch (e) { toast(friendlyError(e)); } }], ["Cancel", closeModal]]);
}
function renderHomeLatest() {
  const b = $("#homeLatestBody"); const vis = visiblePosts().filter(p => p.status === "published");
  if (!vis.length) { b.textContent = role === "visitor" ? "Members see the latest club posts here." : "Club posts will show here."; return; }
  const p = vis[0];
  b.replaceChildren(el("div", { class: "meta", style: "font-size:.85rem;margin-bottom:6px;display:flex;gap:8px;align-items:center" }, el("span", { class: "cat", text: p.category || "Club news" }), el("span", { text: fmtDate(p.createdAt) })),
    el("h3", { style: "margin:.3em 0;color:var(--ink)", text: p.title || "Untitled" }),
    el("p", { style: "margin:0" }, el("a", { href: "#alumni", text: "Read it on the Member Feed →" })));
}

/* ================= COMPOSER ================= */
$("#pCat").replaceChildren(...PCATS.map(c => el("option", { value: c, text: c })));
function updatePreview() {
  const t = $("#pTitle").value.trim(), b = $("#pBody").value, a = $("#pAuthor").value.trim() || "MCWC";
  $("#pvTitle").textContent = t || "Your title"; $("#pvTitle").classList.toggle("muted", !t);
  if (b) richText($("#pvBody"), b); else $("#pvBody").textContent = "Your post will look like this on the feed.";
  $("#pvBody").classList.toggle("muted", !b);
  $("#pvCat").textContent = $("#pCat").value; $("#pvMeta").textContent = a + " · " + (editingId ? "edited just now" : "just now");
  $("#pvBadges").replaceChildren(...($("#pPin").checked ? [el("span", { class: "badge pin", text: "Pinned" })] : []));
  $("#pCount").textContent = b.length + " / 20000";
}
["pTitle", "pBody", "pAuthor", "pCat", "pPin"].forEach(id => { $("#" + id).addEventListener("input", updatePreview); $("#" + id).addEventListener("change", updatePreview); });
function resetComposer() { editingId = null; $("#postForm").reset(); try { $("#pAuthor").value = localStorage.getItem("mcwc.author") || ""; } catch (_) {} renderEditBar(); updatePreview(); }
function renderEditBar() {
  const p = editingId && posts.find(x => x.id === editingId);
  $("#editingBar").hidden = !editingId; $("#editingTitle").textContent = p ? "“" + p.title + "”" : "";
  $("#publishBtn").textContent = editingId ? (p && p.status === "draft" ? "Publish" : "Save changes") : "Publish to feed";
  $("#draftBtn").textContent = editingId && p && p.status === "published" ? "Move to drafts" : "Save as draft";
}
function startEdit(p) {
  editingId = p.id;
  $("#pTitle").value = p.title || ""; $("#pBody").value = p.body || ""; $("#pAuthor").value = p.author || "";
  $("#pCat").value = PCATS.includes(p.category) ? p.category : PCATS[0]; $("#pPin").checked = !!p.pinned;
  renderEditBar(); updatePreview(); location.hash = "#alumni-post";
}
$("#cancelEdit").onclick = () => { resetComposer(); location.hash = "#alumni"; };
$("#clearBtn").onclick = () => { if (editingId) resetComposer(); else { $("#postForm").reset(); updatePreview(); } };
let saving = false;
async function savePost(status) {
  if (saving) return;
  const title = $("#pTitle").value.trim(), body = $("#pBody").value.trim();
  if (!title) { toast("Add a title first"); $("#pTitle").focus(); return; }
  if (!body) { toast("Write something in the post first"); $("#pBody").focus(); return; }
  if (!isStaff()) { toast("Only staff can post"); return; }
  const author = $("#pAuthor").value.trim() || "MCWC";
  try { localStorage.setItem("mcwc.author", $("#pAuthor").value.trim()); } catch (_) {}
  const data = { title, body, category: $("#pCat").value, author, status, pinned: $("#pPin").checked };
  saving = true; $("#publishBtn").disabled = $("#draftBtn").disabled = true;
  try {
    const wasEditing = !!editingId;
    if (wasEditing) await backend.update(editingId, data); else await backend.create(data);
    resetComposer();
    toast(status === "draft" ? "Saved to drafts" : wasEditing ? "Changes saved" : "Published to the Member Feed");
    feedCat = "All"; location.hash = "#alumni";
  } catch (e) { toast(friendlyError(e)); }
  finally { saving = false; $("#publishBtn").disabled = $("#draftBtn").disabled = false; }
}
$("#postForm").addEventListener("submit", e => { e.preventDefault(); savePost("published"); });
$("#draftBtn").onclick = () => savePost("draft");

/* ================= STAFF ADMIN ================= */
function renderAdmin() {
  const n = $("#adminNotice"); n.replaceChildren();
  if (mode === "demo") n.append(el("div", { class: "notice", text: "Demo mode: this list isn't saved. Once Firebase is connected, the people listed here can sign in with Google and post." }));
  if (staffState === "error") n.append(el("div", { class: "notice", text: "Couldn't load the staff list. Refresh to try again." }));
  const me = user && user.email ? user.email.toLowerCase() : (mode === "demo" ? "you@example.com" : "");
  $("#adminRows").replaceChildren(...(staffList.length ? staffList.map(s => el("tr", {},
    el("td", { text: (s.name || "—") + (s.id === me ? " (you)" : "") }),
    el("td", { text: s.id }),
    el("td", { style: "text-align:right" }, s.id === me ? el("span", { class: "muted", style: "font-size:.85rem", text: "—" }) :
      el("button", { class: "linkbtn", style: "color:#b42318", text: "Remove", onclick: () => confirmRemoveStaff(s) }))))
    : [el("tr", {}, el("td", { colspan: "3", class: "muted", text: staffState === "loading" ? "Loading…" : "No staff yet." }))]));
}
function confirmRemoveStaff(s) {
  showModal("Remove staff access?", (s.name ? s.name + " (" + s.id + ")" : s.id) + " will no longer be able to post or see the feed.",
    [["Remove", async () => { closeModal(); try { await backend.removeStaff(s.id); toast("Removed " + s.id); } catch (e) { toast(friendlyError(e)); } }], ["Cancel", closeModal]]);
}
$("#staffForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#staffEmail").value.trim().toLowerCase(), name = $("#staffName").value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast("Enter a valid email address"); return; }
  if (staffList.some(s => s.id === email)) { toast("Already on the staff list"); return; }
  $("#staffAddBtn").disabled = true;
  try { await backend.addStaff(email, name); $("#staffForm").reset(); toast("Added " + email); }
  catch (err) { toast(friendlyError(err)); }
  finally { $("#staffAddBtn").disabled = false; }
});

/* ================= ROUTER & RENDER ================= */
const VIEWS = ["home", "about", "join", "store", "alumni", "alumni-post", "admin", "staff", "donate"];
function route() {
  let v = (location.hash || "#home").slice(1); if (!VIEWS.includes(v)) v = "home";
  document.querySelectorAll("[data-view]").forEach(s => s.hidden = s.dataset.view !== v);
  document.querySelectorAll("nav.main a").forEach(a => a.classList.toggle("on", a.dataset.r === v || (v === "alumni-post" && a.dataset.r === "alumni")));
  setMenu(false); window.scrollTo(0, 0);
  if (v === "alumni-post") setTimeout(() => { if (isStaff() && !$("#pTitle").value) $("#pTitle").focus(); }, 50);
  renderAll();
}
function renderAll() {
  const member = role !== "visitor", staff = isStaff();
  $("#protoBar").hidden = mode !== "demo";
  $("#acctBtn").hidden = !(mode === "firebase" && user && staffChecked && staff);
  $("#acctBtn").textContent = "Sign out";
  $("#adminLink").hidden = !staff;
  $("#gate").hidden = member; $("#feedWrap").hidden = !member; $("#newPostBtn").hidden = !staff;
  $("#notStaff").hidden = staff; $("#composer").hidden = !staff;
  $("#adminNotStaff").hidden = staff; $("#adminBody").hidden = !staff;
  const n = $("#composeNotice"); n.replaceChildren();
  if (staff && mode === "demo") n.append(el("div", { class: "notice", text: "Demo mode: posts you publish here aren't saved. Connect Firebase to make them live for everyone." }));
  if (staff && mode === "firebase" && user) n.append(el("div", { class: "muted", style: "font-size:.88rem;margin-bottom:14px", text: "Signed in as " + user.email }));
  $("#memberLine").textContent = staff ? "Club staff — full access, can post" : (tier || "Tom Cat") + " member · renews annually";
  if (!member) renderGate();
  renderStaffLogin();
  renderFeed(); renderHomeLatest(); renderCart(); renderEditBar(); if (staff) renderAdmin();
}
window.addEventListener("hashchange", route);
function setMenu(open) {
  $("#nav").classList.toggle("open", open);
  const t = $("#menuToggle"); t.setAttribute("aria-expanded", String(open)); t.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}
$("#menuToggle").onclick = e => { e.stopPropagation(); setMenu(!$("#nav").classList.contains("open")); };
$("#nav").addEventListener("click", e => { if (e.target.closest("a,button")) setMenu(false); });
document.addEventListener("click", e => { if ($("#nav").classList.contains("open") && !e.target.closest("header.site")) setMenu(false); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#nav").classList.contains("open")) { setMenu(false); $("#menuToggle").focus(); } });
$("#roleSel").onchange = e => { role = e.target.value; if (role === "member" && !tier) tier = "Tom Cat"; if (!isStaff() && location.hash === "#admin") location.hash = "#alumni"; renderAll(); };

/* ================= START ================= */
renderJoinPage(); renderFilters(); renderProducts(); resetComposer();
async function start() {
  if (CFG.firebase && CFG.firebase.apiKey && CFG.firebase.projectId) {
    mode = "firebase"; backend = FirebaseBackend; feedState = "loading"; route();
    try { await FirebaseBackend.start(); return; }
    catch (e) { console.error(e); toast("Couldn't connect to the club database — showing demo."); }
  }
  mode = "demo"; backend = DemoBackend; route(); DemoBackend.start();
}
start();
window.__mcwc = { get state() { return { mode, role, posts, staffList, editingId }; } }; // for testing/debugging
})();

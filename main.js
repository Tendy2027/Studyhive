import "@fontsource/bricolage-grotesque/500.css";
import "@fontsource/bricolage-grotesque/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "./style.css";
import privacyMd from "./legal/privacy.md?raw";
import rulesMd from "./legal/rules.md?raw";
import { createClient } from "@supabase/supabase-js";

const URL_ = import.meta.env.VITE_SUPABASE_URL, KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const KINDS = ["Summary", "Past paper", "Guide", "Notes", "Video"];
const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "text/plain"];
const $ = (id) => document.getElementById(id);
const v = (id) => ($(id)?.value ?? "").trim();
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ago = (t) => { const m = Math.round((Date.now() - new Date(t)) / 6e4); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
const when = (t) => new Date(t).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const ok = async (p) => { const { data, error } = await p; if (error) throw error; return data; };
let toastT; const toast = (m) => { const e = $("toast"); e.textContent = m; e.className = "show"; clearTimeout(toastT); toastT = setTimeout(() => (e.className = ""), 4000); };

if (!URL_ || !KEY) {
  $("root").innerHTML = '<div class="signin"><h1>Setup needed</h1><p class="sub">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example), then restart.</p></div>';
  throw new Error("Missing Supabase environment variables");
}
const sb = createClient(URL_, KEY);
let chan = null, pt, user = null, profile = null, mine = new Set(), cache = {};
const R = { p: "home", g: null, tab: "Forum", q: "", f: "All", lf: "All" };
const T = { run: false, mode: "Focus", len: 25, left: 1500, iv: null };
const inv = () => (cache = {});

// ---------- auth ----------
async function start() {
  const { data: { session } } = await sb.auth.getSession();
  user = session?.user ?? null;
  sb.auth.onAuthStateChange((_e, s) => { const u = s?.user ?? null; if (u?.id !== user?.id) { user = u; load(); } });
  await load();
}
async function load() {
  if (legalRoute()) return;
  if (!user && chan) { sb.removeChannel(chan); chan = null; }
  if (!user) { $("root").innerHTML = '<div class="signin"><div class="brand"><mark>Study</mark> Table</div><p class="sub">Study with others preparing for the same exam. Sign in to join a group.</p><p><button class="btn" id="signin">Continue with Google</button></p><p class="meta">By continuing you agree to the <a href="#rules">Community Rules</a> and have read the <a href="#privacy">Privacy Notice</a>.</p></div>'; return; }
  try {
    profile = await ok(sb.from("profiles").select("*").eq("id", user.id).single());
    mine = new Set((await ok(sb.from("group_members").select("group_id").eq("user_id", user.id))).map((x) => x.group_id));
    $("root").innerHTML = '<div class="app"><nav id="nav"></nav><main id="main"></main></div>';
    live(); route();
  } catch (e) { toast(e.message); }
}

// ---------- live updates ----------
function live() {
  if (chan) return;
  chan = sb.channel("live");
  for (const table of ["posts", "replies", "reports", "post_likes"]) chan.on("postgres_changes", { event: "*", schema: "public", table }, ping);
  chan.subscribe();
}
function ping() {
  clearTimeout(pt);
  pt = setTimeout(() => {
    if (R.p !== "group" || !["Forum", "Moderation"].includes(R.tab)) return;
    const a = document.activeElement;
    if (a && a.closest("main") && a.matches("input,textarea") && a.value) return toast("New activity in this group. Finish typing, then switch tabs to refresh.");
    render();
  }, 400);
}

// ---------- legal pages (edit src/legal/*.md) ----------
let inLegal = false;
function md(src) {
  const inl = (t) => t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  let out = "", list = false;
  for (const raw of esc(src).split("\n")) {
    const l = raw.trim();
    if (list && !l.startsWith("- ")) { out += "</ul>"; list = false; }
    if (!l) continue;
    if (l.startsWith("- ")) { if (!list) { out += "<ul>"; list = true; } out += `<li>${inl(l.slice(2))}</li>`; }
    else if (l.startsWith("## ")) out += `<h2>${inl(l.slice(3))}</h2>`;
    else if (l.startsWith("# ")) out += `<h1>${inl(l.slice(2))}</h1>`;
    else out += `<p>${inl(l)}</p>`;
  }
  return out + (list ? "</ul>" : "");
}
function legalRoute() {
  const src = { privacy: privacyMd, rules: rulesMd }[location.hash.slice(1)];
  if (!src) return false;
  if (/\[[^\]]+\]/.test(src)) console.warn("Legal text still contains [placeholders]. Fill them in before launch.");
  $("root").innerHTML = `<div class="legal"><a href="#home">Back to Study Table</a>${md(src)}</div>`;
  inLegal = true; window.scrollTo(0, 0); return true;
}

// ---------- routing ----------
function route() {
  const h = location.hash.slice(1), m = /^g-([0-9a-f-]{36})$/.exec(h);
  if (m) { R.p = "group"; R.g = m[1]; R.tab = "Forum"; } else R.p = ["home", "groups", "library", "tools", "profile"].includes(h) ? h : "home";
  R.q = ""; render();
}
window.addEventListener("hashchange", () => { if (legalRoute()) return; if (inLegal) { inLegal = false; load(); } else if (user) route(); });
function navr() {
  const it = [["home", "Home"], ["groups", "Study Groups"], ["library", "Library"], ["tools", "Study Tools"], ["profile", "Profile"]], cur = R.p === "group" ? "groups" : R.p;
  $("nav").innerHTML = '<div class="brand"><mark>Study</mark> Table</div>' + it.map((i) => `<button class="nl" data-nav="${i[0]}"${i[0] === cur ? ' aria-current="page"' : ""}>${i[1]}</button>`).join("") + '<div class="grow"></div><a class="nl" href="#privacy">Privacy notice</a><a class="nl" href="#rules">Community rules</a><button class="nl" data-t="out">Sign out</button>';
}
async function render() {
  if (!user) return;
  navr();
  const views = { home: homeView, groups: groupsView, group: groupView, library: libraryView, tools: toolsView, profile: profileView };
  let h; try { h = await views[R.p](); } catch (e) { h = `<div class="empty">Could not load this page: ${esc(e.message)}</div>`; }
  $("main").innerHTML = h;
}

// ---------- views ----------
const head = (t, s) => `<h1>${t}</h1>${s ? `<p class="sub">${s}</p>` : ""}`;
const groupsData = async () => (cache.groups ??= await ok(sb.from("groups_with_counts").select("*").order("created_at", { ascending: false })));
const nm = (pr) => pr?.display_name || "Deleted user";
const liked = (p) => p.post_likes.some((l) => l.user_id === user.id);
const gcard = (g) => `<div class="card"><div class="row sp"><h3>${esc(g.name)}</h3><span class="tag">${esc(g.subject)}</span></div><div>${esc(g.description)}</div><div class="meta">Preparing for: ${esc(g.exam || "an upcoming exam")} · ${Number(g.member_count)} members</div><div class="row"><button class="btn sm" data-open="${esc(g.id)}">Open</button><button class="btn ghost sm" data-join="${esc(g.id)}">${mine.has(g.id) ? "Leave" : "Join"}</button></div></div>`;
async function groupsView() {
  const q = R.q.toLowerCase(), l = (await groupsData()).filter((g) => (R.f === "All" || mine.has(g.id)) && (g.name + g.subject + g.description + g.exam).toLowerCase().includes(q));
  return head("Study groups", "Find people preparing for the same exam, or start your own group.") +
    `<div class="row mt"><input id="q" placeholder="Search groups" value="${esc(R.q)}" aria-label="Search groups"><select id="f" aria-label="Show"><option${R.f === "All" ? " selected" : ""}>All</option><option value="Mine"${R.f === "Mine" ? " selected" : ""}>My groups</option></select></div>` +
    '<details class="card mt"><summary>Start a new group</summary><label class="small" for="gn">Group name</label><input id="gn" maxlength="40"><label class="small" for="gs">Subject</label><input id="gs" maxlength="40"><label class="small" for="gx">Exam you are preparing for</label><input id="gx" maxlength="80"><label class="small" for="gd">What will the group do?</label><textarea id="gd" maxlength="300"></textarea><div class="mt"><button class="btn" id="mkg">Create group</button></div></details>' +
    (l.length ? `<div class="grid">${l.map(gcard).join("")}</div>` : '<div class="empty">No groups match. Start one above.</div>');
}
async function homeView() {
  const ids = [...mine], now = new Date().toISOString();
  const [gs, ss, ps, rs] = await Promise.all([
    groupsData(),
    ids.length ? ok(sb.from("sessions").select("id,title,starts_at,groups(name)").in("group_id", ids).gte("starts_at", now).order("starts_at").limit(5)) : [],
    ids.length ? ok(sb.from("posts").select("id,body,created_at,group_id,profiles(display_name),groups(name)").in("group_id", ids).order("created_at", { ascending: false }).limit(5)) : [],
    ok(sb.from("session_rsvps").select("session_id,sessions!inner(starts_at)").eq("user_id", user.id).gte("sessions.starts_at", now)),
  ]);
  const mg = gs.filter((g) => mine.has(g.id));
  return head("Hello, " + esc(profile.display_name), "Your study groups, sessions and recent discussions in one place.") +
    `<div class="stats"><div class="card"><b>${mine.size}</b>groups joined</div><div class="card"><b>${profile.focus_minutes}</b>minutes studied</div><div class="card"><b>${rs.length}</b>sessions booked</div></div>` +
    "<h2>Your groups</h2>" + (mg.length ? `<div class="grid">${mg.map(gcard).join("")}</div>` : '<div class="empty">You have not joined a group yet. <a href="#groups">Find a group for your subject</a>.</div>') +
    "<h2>Upcoming sessions</h2>" + (ss.map((s) => `<div class="card"><b>${esc(s.title)}</b><div class="meta">${when(s.starts_at)} · ${esc(s.groups?.name)}</div></div>`).join("") || '<div class="empty">No upcoming sessions in your groups.</div>') +
    "<h2>Recent discussions</h2>" + (ps.map((p) => `<div class="card"><div class="meta"><b>${esc(nm(p.profiles))}</b> · <a href="#g-${esc(p.group_id)}">${esc(p.groups?.name)}</a> · ${ago(p.created_at)}</div><p>${esc(p.body.length > 200 ? p.body.slice(0, 200) + "…" : p.body)}</p></div>`).join("") || '<div class="empty">No discussions yet.</div>');
}
const matForm = async (gid) => `<details class="card"><summary>Share study material</summary><label class="small" for="mt">Title</label><input id="mt" maxlength="120">${gid ? "" : `<label class="small" for="mg">Group</label><select id="mg">${(await groupsData()).filter((g) => mine.has(g.id)).map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("")}</select>`}<label class="small" for="mk">Type</label><select id="mk">${KINDS.map((k) => `<option>${k}</option>`).join("")}</select><label class="small" for="md">What does it cover?</label><textarea id="md" maxlength="500"></textarea><label class="small" for="mf">File (PDF, PNG, JPEG or text, up to 10 MB, optional)</label><input id="mf" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt"><div class="mt"><button class="btn" data-addmat="${gid ? esc(gid) : ""}">Share</button></div></details>`;
const mat = (m, showG) => `<div class="card"><div class="row sp"><b>${esc(m.title)}</b><span class="tag">${esc(m.kind)}</span></div><div>${esc(m.description)}</div><div class="row sp"><span class="meta">Shared by ${esc(nm(m.profiles))}${showG && m.groups ? " · " + esc(m.groups.name) : ""} · ${ago(m.created_at)}</span>${m.file_path ? `<button class="btn ghost sm" data-dl="${esc(m.file_path)}">Download</button>` : ""}</div></div>`;
async function groupView() {
  const g = (await groupsData()).find((x) => x.id === R.g);
  if (!g) return '<div class="empty">Group not found. <a href="#groups">Back to study groups</a></div>';
  const j = mine.has(g.id); let h = "";
  const mem = await ok(sb.from("group_members").select("user_id,role,profiles(display_name)").eq("group_id", g.id));
  const adm = mem.some((m) => m.user_id === user.id && m.role === "admin");
  if (R.tab === "Moderation" && !adm) R.tab = "Forum";
  if (R.tab === "Forum") {
    const ps = await ok(sb.from("posts").select("id,body,created_at,author_id,profiles(display_name),replies(id,body,created_at,author_id,profiles(display_name)),post_likes(user_id)").eq("group_id", g.id).order("created_at", { ascending: false }).order("created_at", { referencedTable: "replies", ascending: true }));
    h = (j ? '<div class="card"><label class="small" for="np">Ask a question or share a tip</label><textarea id="np" maxlength="5000"></textarea><div class="mt"><button class="btn" id="post">Post to the group</button></div></div>' : '<div class="empty">Join this group to post and reply.</div>') +
      (ps.map((p) => `<article class="card"><div class="meta"><b>${esc(nm(p.profiles))}</b> · ${ago(p.created_at)}</div><p>${esc(p.body)}</p>${p.replies.map((r) => `<div class="reply"><div class="meta"><b>${esc(nm(r.profiles))}</b> · ${ago(r.created_at)}</div>${esc(r.body)}<div class="row">${r.author_id === user.id || adm ? `<button class="btn ghost sm" data-delreply="${esc(r.id)}">Delete</button>` : ""}${r.author_id !== user.id ? `<button class="btn ghost sm" data-report-reply="${esc(r.id)}">Report</button>` : ""}</div></div>`).join("")}${j ? `<div class="row mt"><input aria-label="Reply" placeholder="Write a reply" maxlength="2000" data-ri="${esc(p.id)}"><button class="btn ghost sm" data-reply="${esc(p.id)}">Reply</button></div>` : ""}<div class="row mt"><button class="btn ghost sm" data-like="${esc(p.id)}" data-on="${liked(p) ? 1 : 0}"${j ? "" : " disabled"}>${liked(p) ? "Liked" : "Like"} · ${p.post_likes.length}</button>${p.author_id === user.id || adm ? `<button class="btn ghost sm" data-delpost="${esc(p.id)}">Delete</button>` : ""}${p.author_id !== user.id ? `<button class="btn ghost sm" data-report-post="${esc(p.id)}">Report</button>` : ""}</div></article>`).join("") || '<div class="empty">No posts yet. Start the first discussion.</div>');
  } else if (R.tab === "Materials") {
    const ms = await ok(sb.from("materials").select("*,profiles(display_name)").eq("group_id", g.id).order("created_at", { ascending: false }));
    h = (j ? await matForm(g.id) : "") + (ms.map((m) => mat(m)).join("") || '<div class="empty">Nothing shared yet.</div>');
  } else if (R.tab === "Moderation") {
    const rp = await ok(sb.from("reports").select("id,reason,created_at,profiles(display_name),posts(id,body),replies(id,body)").eq("group_id", g.id).eq("status", "open").order("created_at"));
    h = "<h2>Open reports</h2>" + (rp.map((x) => { const c = x.posts || x.replies; return `<div class="card"><div class="meta">Reported by ${esc(nm(x.profiles))} · ${ago(x.created_at)}</div><p><b>Reason:</b> ${esc(x.reason)}</p><p>${esc(c?.body)}</p><div class="row"><button class="btn ghost sm" data-resolve="${esc(x.id)}">Dismiss report</button><button class="btn sm" data-rmcontent="${x.posts ? "posts" : "replies"}:${esc(c?.id)}">Remove content</button></div></div>`; }).join("") || '<div class="empty">No open reports.</div>') +
      "<h2>Members</h2>" + mem.map((m) => `<div class="card row sp"><span>${esc(nm(m.profiles))} <span class="tag">${esc(m.role)}</span></span>${m.user_id !== user.id ? `<button class="btn ghost sm" data-rmmember="${esc(m.user_id)}">Remove</button>` : ""}</div>`).join("");
  } else {
    const ss = await ok(sb.from("sessions").select("id,title,starts_at,profiles(display_name)").eq("group_id", g.id).gte("starts_at", new Date().toISOString()).order("starts_at"));
    const going = new Set((await ok(sb.from("session_rsvps").select("session_id").eq("user_id", user.id))).map((x) => x.session_id));
    h = (j ? '<details class="card"><summary>Schedule a session</summary><label class="small" for="st">Topic</label><input id="st" maxlength="120"><label class="small" for="sw">Date and time</label><input id="sw" type="datetime-local"><div class="mt"><button class="btn" id="mks">Schedule</button></div></details>' : "") +
      (ss.map((s) => `<div class="card"><div class="row sp"><div><b>${esc(s.title)}</b><div class="meta">${when(s.starts_at)} · hosted by ${esc(nm(s.profiles))}</div></div>${j ? `<button class="btn${going.has(s.id) ? " ghost" : ""} sm" data-rsvp="${esc(s.id)}" data-on="${going.has(s.id) ? 1 : 0}">${going.has(s.id) ? "Going" : "I’ll attend"}</button>` : ""}</div></div>`).join("") || '<div class="empty">No upcoming sessions.</div>');
  }
  return `<a href="#groups" class="meta">Back to study groups</a><div class="row sp mt"><div>${head(esc(g.name), esc(g.description) + (g.exam ? " Preparing for " + esc(g.exam) + "." : ""))}</div><button class="btn${j ? " ghost" : ""}" data-join="${esc(g.id)}">${j ? "Leave group" : "Join group"}</button></div><div class="tabs" role="tablist">${["Forum", "Materials", "Sessions", ...(adm ? ["Moderation"] : [])].map((t) => `<button class="tab" role="tab" data-tab="${t}" aria-selected="${t === R.tab}">${t}</button>`).join("")}</div>${h}`;
}
async function libraryView() {
  cache.mats ??= await ok(sb.from("materials").select("*,profiles(display_name),groups(name)").order("created_at", { ascending: false }).limit(200));
  const q = R.q.toLowerCase(), l = cache.mats.filter((m) => (R.lf === "All" || m.kind === R.lf) && (m.title + m.description).toLowerCase().includes(q));
  return head("Study library", "Summaries, past papers and guides shared by every group.") +
    `<div class="row mt"><input id="q" placeholder="Search materials" value="${esc(R.q)}" aria-label="Search materials"><select id="lf" aria-label="Filter by type">${["All", ...KINDS].map((k) => `<option${k === R.lf ? " selected" : ""}>${k}</option>`).join("")}</select></div><div class="mt">${mine.size ? await matForm("") : ""}</div>` +
    (l.map((m) => mat(m, true)).join("") || '<div class="empty">No materials match.</div>');
}
const fmt = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
function tick() {
  T.left--;
  if (T.left <= 0) {
    if (T.mode === "Focus") { profile.focus_minutes += T.len; sb.from("profiles").update({ focus_minutes: profile.focus_minutes }).eq("id", user.id).then(() => {}); T.mode = "Break"; T.left = 300; }
    else { T.mode = "Focus"; T.left = T.len * 60; }
  }
  if ($("tt")) { $("tt").textContent = fmt(T.left); $("tm").textContent = T.mode + " session"; }
}
function toolsView() {
  return head("Study tools", "Run a focus session alongside your group.") + `<div class="card mt center"><div class="meta" id="tm">${T.mode} session</div><div class="time" id="tt">${fmt(T.left)}</div><div class="row center"><button class="btn" data-t="go">${T.run ? "Pause" : "Start"}</button><button class="btn ghost" data-t="rs">Reset</button><select id="tl" aria-label="Focus length">${[15, 25, 50].map((m) => `<option value="${m}"${m === T.len ? " selected" : ""}>${m} min focus</option>`).join("")}</select></div><p class="meta">Finished focus sessions are added to your minutes studied.</p></div>`;
}
function profileView() {
  return head("Your profile") + `<div class="card mt"><label class="small" for="pn">Display name</label><input id="pn" maxlength="24" value="${esc(profile.display_name)}"><label class="small" for="pg">Study goal</label><input id="pg" maxlength="140" value="${esc(profile.goal)}"><div class="mt"><button class="btn" data-t="save">Save profile</button></div></div><div class="stats"><div class="card"><b>${mine.size}</b>groups joined</div><div class="card"><b>${profile.focus_minutes}</b>minutes studied</div></div><h2>Delete account</h2><div class="card"><p>This removes your profile, replies, files and group memberships. Posts that others have replied to stay, shown as "Deleted user". It cannot be undone.</p><button class="btn ghost" data-t="del">Delete my account</button></div>`;
}

// ---------- actions ----------
document.addEventListener("click", async (e) => {
  const t = e.target.closest("button"); if (!t) return; const d = t.dataset;
  try {
    if (t.id === "signin") await ok(sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin } }));
    else if (d.nav) location.hash = d.nav;
    else if (d.open) location.hash = "g-" + d.open;
    else if (d.tab) { R.tab = d.tab; render(); }
    else if (d.join) {
      if (mine.has(d.join)) { await ok(sb.from("group_members").delete().eq("group_id", d.join).eq("user_id", user.id)); mine.delete(d.join); }
      else { await ok(sb.from("group_members").insert({ group_id: d.join })); mine.add(d.join); }
      inv(); render();
    }
    else if (t.id === "mkg") {
      if (!v("gn") || !v("gs")) return toast("Add a group name and subject");
      const g = await ok(sb.from("groups").insert({ name: v("gn"), subject: v("gs"), exam: v("gx"), description: v("gd"), created_by: user.id }).select().single());
      mine.add(g.id); inv(); location.hash = "g-" + g.id;
    }
    else if (t.id === "post") { if (!v("np")) return; await ok(sb.from("posts").insert({ group_id: R.g, body: v("np") })); render(); }
    else if (d.reply) { const i = document.querySelector(`[data-ri="${CSS.escape(d.reply)}"]`); if (!i.value.trim()) return; await ok(sb.from("replies").insert({ post_id: d.reply, body: i.value.trim() })); render(); }
    else if (d.delpost) { if (confirm("Delete this post and its replies?")) { await ok(sb.from("posts").delete().eq("id", d.delpost)); render(); } }
    else if (d.addmat !== undefined) {
      const gid = d.addmat || v("mg"); if (!gid || !v("mt")) return toast("Add a title");
      let file_path = null; const f = $("mf")?.files[0];
      if (f) {
        if (f.size > 10485760) return toast("File is larger than 10 MB");
        if (!ALLOWED.includes(f.type)) return toast("Use a PDF, PNG, JPEG or text file");
        file_path = `${gid}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
        await ok(sb.storage.from("materials").upload(file_path, f, { contentType: f.type }));
      }
      await ok(sb.from("materials").insert({ group_id: gid, title: v("mt"), kind: v("mk"), description: v("md"), file_path }));
      inv(); render();
    }
    else if (d.dl) { const r = await ok(sb.storage.from("materials").createSignedUrl(d.dl, 60)); const a = document.createElement("a"); a.href = r.signedUrl; a.target = "_blank"; a.rel = "noopener"; a.click(); }
    else if (t.id === "mks") {
      const w = new Date($("sw").value); if (!v("st") || isNaN(w)) return toast("Add a topic and a date");
      await ok(sb.from("sessions").insert({ group_id: R.g, title: v("st"), starts_at: w.toISOString() })); render();
    }
    else if (d.rsvp) {
      if (d.on === "1") await ok(sb.from("session_rsvps").delete().eq("session_id", d.rsvp).eq("user_id", user.id));
      else await ok(sb.from("session_rsvps").insert({ session_id: d.rsvp }));
      render();
    }
    else if (d.reportPost || d.reportReply) {
      const why = prompt("Why are you reporting this? (for example spam, abuse, off-topic)"); if (!why || !why.trim()) return;
      await ok(sb.from("reports").insert({ group_id: R.g, reason: why.trim().slice(0, 300), post_id: d.reportPost || null, reply_id: d.reportReply || null })); toast("Report sent to the group admins");
    }
    else if (d.like) {
      if (d.on === "1") await ok(sb.from("post_likes").delete().eq("post_id", d.like).eq("user_id", user.id));
      else await ok(sb.from("post_likes").insert({ post_id: d.like }));
      render();
    }
    else if (d.delreply) { if (confirm("Delete this reply?")) { await ok(sb.from("replies").delete().eq("id", d.delreply)); render(); } }
    else if (d.resolve) { await ok(sb.from("reports").update({ status: "resolved" }).eq("id", d.resolve)); render(); }
    else if (d.rmcontent) { const [tb, id] = d.rmcontent.split(":"); if (!["posts", "replies"].includes(tb)) return; if (confirm("Remove this content for everyone?")) { await ok(sb.from(tb).delete().eq("id", id)); render(); } }
    else if (d.rmmember) { if (confirm("Remove this member from the group?")) { await ok(sb.from("group_members").delete().eq("group_id", R.g).eq("user_id", d.rmmember)); render(); } }
    else if (d.t === "go") { if (T.run) { clearInterval(T.iv); T.run = false; } else { T.run = true; T.iv = setInterval(tick, 1000); } render(); }
    else if (d.t === "rs") { clearInterval(T.iv); T.run = false; T.mode = "Focus"; T.left = T.len * 60; render(); }
    else if (d.t === "save") { profile = await ok(sb.from("profiles").update({ display_name: v("pn") || "Student", goal: v("pg") || null }).eq("id", user.id).select().single()); toast("Profile saved"); }
    else if (d.t === "del") {
      if (prompt("This permanently deletes your account. Type DELETE to confirm.") !== "DELETE") return;
      const fs = await ok(sb.from("materials").select("file_path").eq("uploader_id", user.id).not("file_path", "is", null));
      if (fs.length) await ok(sb.storage.from("materials").remove(fs.map((x) => x.file_path)));
      await ok(sb.rpc("delete_my_account"));
      await sb.auth.signOut({ scope: "local" }); toast("Your account has been deleted");
    }
    else if (d.t === "out") await sb.auth.signOut();
  } catch (err) { toast(err.code === "23505" ? "You have already done that" : err.message || "Something went wrong"); }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "q") { R.q = e.target.value; const p = e.target.selectionStart; render().then(() => { const n = $("q"); n.focus(); n.setSelectionRange(p, p); }); }
});
document.addEventListener("change", (e) => {
  const i = e.target.id;
  if (i === "f") { R.f = e.target.value; render(); } else if (i === "lf") { R.lf = e.target.value; render(); }
  else if (i === "tl") { T.len = +e.target.value; if (!T.run && T.mode === "Focus") T.left = T.len * 60; render(); }
});
start();

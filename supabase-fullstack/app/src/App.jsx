import { useEffect, useState } from "react";
import { supabase, configured, SUPABASE_URL } from "./supabase.js";

export default function App() {
  const [session, setSession] = useState(null);
  const [health, setHealth] = useState("checking…");

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => setHealth(`ok (${j.name || "auth"} ${j.version || ""})`))
      .catch((e) => setHealth(`unreachable (${e})`));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return (
      <main className="wrap">
        <h1>Supabase Notes</h1>
        <p className="err">
          VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are not set. Add them in
          Openship → Project → Environment and redeploy.
        </p>
      </main>
    );
  }

  return (
    <main className="wrap">
      <h1>Supabase Notes</h1>
      <p className="muted">
        Supabase: <code>{SUPABASE_URL}</code> · Auth: <b>{health}</b>
      </p>
      {session ? <Notes session={session} /> : <Auth />}
    </main>
  );
}

function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function go(kind) {
    setMsg("");
    const fn = kind === "up" ? supabase.auth.signUp : supabase.auth.signInWithPassword;
    const { data, error } = await fn.call(supabase.auth, { email, password });
    if (error) return setMsg(error.message);
    if (kind === "up" && !data.session) setMsg("Check your email to confirm (or enable ENABLE_EMAIL_AUTOCONFIRM).");
  }

  return (
    <section className="card">
      <h2>Sign in</h2>
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="password (min 6)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <div className="row">
        <button onClick={() => go("in")}>Sign in</button>
        <button className="ghost" onClick={() => go("up")}>Create account</button>
      </div>
      {msg && <p className="err">{msg}</p>}
    </section>
  );
}

function Notes({ session }) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    const { data, error } = await supabase.from("notes").select("*").order("created_at", { ascending: false });
    if (error) setErr(`${error.message} — did you run the migration?`);
    else { setErr(""); setNotes(data); }
  }
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const { error } = await supabase.from("notes").insert({ content: text.trim() });
    if (error) return setErr(error.message);
    setText(""); load();
  }
  async function toggle(n) { await supabase.from("notes").update({ done: !n.done }).eq("id", n.id); load(); }
  async function remove(n) { await supabase.from("notes").delete().eq("id", n.id); load(); }

  return (
    <section className="card">
      <div className="row between">
        <h2>My notes</h2>
        <span className="muted">{session.user.email} · <a href="#" onClick={() => supabase.auth.signOut()}>sign out</a></span>
      </div>
      <form className="row" onSubmit={add}>
        <input placeholder="New note…" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit">Add</button>
      </form>
      {err && <p className="err">{err}</p>}
      <ul className="notes">
        {notes.map((n) => (
          <li key={n.id}>
            <label><input type="checkbox" checked={n.done} onChange={() => toggle(n)} />
              <span className={n.done ? "done" : ""}>{n.content}</span></label>
            <button className="ghost" onClick={() => remove(n)}>✕</button>
          </li>
        ))}
        {!notes.length && !err && <li className="muted">No notes yet — RLS shows only your own rows.</li>}
      </ul>
    </section>
  );
}

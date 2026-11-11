import { useCallback, useEffect, useState } from "react";
import { MODERATION_ROUTE, PEOPLE_ROUTE, Reasons, isModerator, send, useMe } from "./auth";
import { Avatar, TierBadge, type Tier } from "./avatar";
import { Link, navigate } from "./router";

interface QueuedPost {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  author: string;
  status: string;
  reject_reason: string | null;
  created_at: string;
  image_count: number;
  account_handle: string | null;
  account_role: string | null;
}

interface ModAccount {
  id: string;
  role: Tier;
  suspended_at: string | null;
  created_at: string;
  email_verified: number;
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  website: string | null;
  public: number | null;
  avatar: string | null;
  post_count: number;
}

interface LogEntry {
  action: string;
  target: string;
  reason: string | null;
  at: string;
  actor_handle: string | null;
  target_handle: string | null;
}

const RANK: Record<Tier, number> = { member: 0, moderator: 1, admin: 2 };
type Result = Awaited<ReturnType<typeof send>>;

function useList<T>(url: string): [T[] | null, () => void] {
  const [rows, setRows] = useState<T[] | null>(null);
  const load = useCallback(() => {
    fetch(url)
      .then((res) => (res.ok ? (res.json() as Promise<T[]>) : []))
      .then(setRows)
      .catch(() => setRows([]));
  }, [url]);
  useEffect(load, [load]);
  return [rows, load];
}

function Posts() {
  const [status, setStatus] = useState("pending");
  const [rows, reload] = useList<QueuedPost>(`/api/mod/posts?status=${status}`);
  const [open, setOpen] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function act(post: QueuedPost, action: "approve" | "reject") {
    const reason = action === "reject" ? window.prompt(post.status === "published" ? "Why is it coming down?" : "Why is it rejected?") : null;
    if (action === "reject" && reason === null) return;
    setResult(await send(`/api/mod/posts/${post.id}/${action}`, { reason }));
    reload();
  }

  return (
    <section className="pf-section">
      <div className="pf-mod-tabs" role="tablist">
        {["pending", "published", "rejected"].map((s) => (
          <button key={s} type="button" role="tab" aria-selected={status === s} className={status === s ? "pf-btn" : "pf-link-btn"} onClick={() => setStatus(s)}>
            {s}
          </button>
        ))}
      </div>
      {result && !result.ok ? <Reasons reasons={result.reasons} /> : null}
      {rows === null ? <p className="pf-muted">Loading…</p> : rows.length === 0 ? <p className="pf-muted">Nothing here.</p> : null}
      <ul className="pf-mod-list">
        {(rows ?? []).map((post) => (
          <li key={post.id} className="pf-card">
            <h3>{post.status === "published" ? <Link to={`/skills/posts/${post.slug}`}>{post.title}</Link> : post.title}</h3>
            <p>{post.summary}</p>
            <p className="pf-muted pf-skill-meta">
              {post.account_handle ? <Link to={`${PEOPLE_ROUTE}/${post.account_handle}`}>@{post.account_handle}</Link> : post.author}
              {post.account_role ? <> <TierBadge tier={post.account_role} /></> : null} · {post.created_at.slice(0, 10)} · {post.image_count} images
              {post.reject_reason ? ` · ${post.reject_reason}` : ""}
            </p>
            <button type="button" className="pf-link-btn" onClick={() => setOpen(open === post.id ? null : post.id)}>
              {open === post.id ? "Hide text" : "Read text"}
            </button>
            {open === post.id ? <pre className="pf-post-code pf-mod-body">{post.body}</pre> : null}
            <p className="pf-mod-actions">
              {post.status === "pending" ? (
                <button type="button" className="pf-btn" onClick={() => void act(post, "approve")}>Approve</button>
              ) : null}
              {post.status !== "rejected" ? (
                <button type="button" className="pf-btn pf-btn-danger" onClick={() => void act(post, "reject")}>
                  {post.status === "published" ? "Take down" : "Reject"}
                </button>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AccountRow({ account, viewer, reload }: { account: ModAccount; viewer: Tier; reload: () => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const canAct = RANK[viewer] > RANK[account.role];
  const name = account.display_name || account.handle || "(no name)";

  async function run(path: string, body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    const reason = window.prompt("Reason (kept in the moderation log)") ?? "";
    setResult(await send(`/api/mod/accounts/${account.id}/${path}`, { ...body, reason }));
    reload();
  }

  return (
    <li className="pf-card pf-mod-account">
      <div className="pf-person-head">
        <Avatar src={account.avatar} name={name} size="md" />
        <div>
          <strong>{name}</strong> <TierBadge tier={account.role} />
          {account.suspended_at ? <span className="pf-tier pf-tier-suspended">Suspended</span> : null}
          <p className="pf-muted pf-skill-meta">
            {account.handle ? (account.public ? <Link to={`${PEOPLE_ROUTE}/${account.handle}`}>@{account.handle}</Link> : `@${account.handle} (private)`) : "no handle"}
            {" · "}joined {account.created_at.slice(0, 10)} · {account.post_count} posts{account.email_verified ? "" : " · email not confirmed"}
          </p>
        </div>
      </div>
      {account.bio ? <p>{account.bio}</p> : null}
      {account.website ? <p className="pf-muted">{account.website}</p> : null}
      {result && !result.ok ? <Reasons reasons={result.reasons} /> : null}
      {canAct ? (
        <p className="pf-mod-actions">
          {account.avatar ? <button type="button" className="pf-link-btn" onClick={() => void run("reset", { fields: ["avatar"] })}>Remove picture</button> : null}
          {account.display_name ? <button type="button" className="pf-link-btn" onClick={() => void run("reset", { fields: ["displayName"] })}>Clear name</button> : null}
          {account.bio ? <button type="button" className="pf-link-btn" onClick={() => void run("reset", { fields: ["bio", "website"] })}>Clear bio</button> : null}
          {account.handle ? <button type="button" className="pf-link-btn" onClick={() => void run("reset", { fields: ["handle"] })}>Clear handle</button> : null}
          <button type="button" className="pf-link-btn"
            onClick={() => void run("suspend", { suspended: !account.suspended_at }, account.suspended_at ? undefined : `Suspend ${name}? They're signed out and can't sign in.`)}>
            {account.suspended_at ? "Restore" : "Suspend"}
          </button>
          {viewer === "admin" ? (
            <button type="button" className="pf-link-btn"
              onClick={() => void run("role", { role: account.role === "moderator" ? "member" : "moderator" })}>
              {account.role === "moderator" ? "Make member" : "Make moderator"}
            </button>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}

function Accounts({ viewer }: { viewer: Tier }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [rows, reload] = useList<ModAccount>(`/api/mod/accounts?q=${encodeURIComponent(query)}`);
  return (
    <section className="pf-section">
      <form className="pf-mod-search" onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Handle or name" aria-label="Search accounts" />
        <button type="submit" className="pf-btn">Search</button>
      </form>
      {rows === null ? <p className="pf-muted">Loading…</p> : rows.length === 0 ? <p className="pf-muted">No accounts match.</p> : null}
      <ul className="pf-mod-list">
        {(rows ?? []).map((account) => (
          <AccountRow key={account.id} account={account} viewer={viewer} reload={reload} />
        ))}
      </ul>
    </section>
  );
}

function Log() {
  const [rows] = useList<LogEntry>("/api/mod/log");
  if (rows === null) return <p className="pf-muted">Loading…</p>;
  if (rows.length === 0) return <p className="pf-muted">No actions yet.</p>;
  return (
    <table className="pf-mod-log">
      <thead>
        <tr><th>When</th><th>Who</th><th>Action</th><th>On</th><th>Reason</th></tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td>{row.at.slice(0, 16).replace("T", " ")}</td>
            <td>{row.actor_handle ? `@${row.actor_handle}` : "operator"}</td>
            <td>{row.action}</td>
            <td>{row.target_handle ? `@${row.target_handle}` : row.target.slice(0, 8)}</td>
            <td>{row.reason ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** /moderation: for moderators and admins. Everyone else is sent to sign in or back home. */
export function ModerationPage() {
  const me = useMe();
  const [tab, setTab] = useState<"posts" | "accounts" | "log">("posts");
  useEffect(() => {
    if (me === null) navigate(`/login?next=${encodeURIComponent(MODERATION_ROUTE)}`);
    else if (me && !isModerator(me)) navigate("/");
  }, [me]);
  if (!me || !isModerator(me)) return <article className="pf-page" aria-busy="true" />;
  return (
    <article className="pf-page">
      <header className="pf-page-head">
        <h1>Moderation</h1>
        <p className="pf-sub">
          Signed in as <TierBadge tier={me.account.role} />. You can act on accounts below your tier, and every action is logged.
        </p>
      </header>
      <div className="pf-mod-tabs" role="tablist">
        {(["posts", "accounts", "log"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "pf-btn" : "pf-link-btn"} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === "posts" ? <Posts /> : tab === "accounts" ? <Accounts viewer={me.account.role} /> : <Log />}
    </article>
  );
}

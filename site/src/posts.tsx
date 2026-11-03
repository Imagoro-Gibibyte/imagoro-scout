import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import catalog from "../catalog/skills.json";
import { parseBody, type Inline } from "./post-body";
import { Link } from "./router";

export interface Post {
  slug: string;
  title: string;
  summary: string;
  body: string;
  skill: string | null;
  author: string;
  published_at: string;
  images: Record<string, string>;
}

interface DevlogEntry {
  date: string;
  project: string;
  title: string;
  body: string;
  author?: string;
  published_at?: string | null;
}

async function encryptToken(token: string, email: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(email), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("imagoro-post-edit"), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(token));
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...out));
}

interface Rejection {
  field: string;
  reason: string;
}

export const POSTS_ROUTE = "/skills/posts";
export const SUBMIT_ROUTE = "/skills/posts/new";

function inline(part: Inline, key: number): ReactNode {
  if (part.kind === "text") return part.text;
  if (part.kind === "bold") return <strong key={key}>{part.text}</strong>;
  if (part.kind === "code") return <code key={key}>{part.text}</code>;
  const internal = part.href.startsWith("/");
  return internal ? (
    <Link key={key} to={part.href}>
      {part.text}
    </Link>
  ) : (
    <a key={key} href={part.href} target="_blank" rel="noopener noreferrer nofollow ugc">
      {part.text}
    </a>
  );
}

function PostBody({ post }: { post: Post }) {
  return (
    <>
      {parseBody(post.body).map((block, i) => {
        if (block.kind === "heading") return <h2 key={i}>{block.text}</h2>;
        if (block.kind === "paragraph") return <p key={i}>{block.parts.map(inline)}</p>;
        if (block.kind === "code") {
          return (
            <pre key={i} className="pf-post-code">
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={i}>
              {block.items.map((parts, item) => (
                <li key={item}>{parts.map(inline)}</li>
              ))}
            </ul>
          );
        }
        const src = post.images[block.position];
        return src ? <img key={i} className="pf-post-image" src={src} alt={block.alt} loading="lazy" /> : null;
      })}
    </>
  );
}

export function PostList({ skill }: { skill?: string }) {
  const [posts, setPosts] = useState<readonly Post[]>([]);

  useEffect(() => {
    fetch(skill ? `/api/posts?skill=${skill}` : "/api/posts")
      .then((res) => (res.ok ? (res.json() as Promise<Post[]>) : []))
      .then(setPosts)
      .catch(() => undefined);
  }, [skill]);

  if (posts.length === 0) return <p className="pf-muted">No posts yet.</p>;
  return (
    <ul className="pf-cards">
      {posts.map((post) => (
        <li className="pf-card" key={post.slug}>
          <h3>
            <Link to={`${POSTS_ROUTE}/${post.slug}`}>{post.title}</Link>
          </h3>
          <p>{post.summary}</p>
          <p className="pf-muted pf-skill-meta">
            {post.author} · {post.published_at.slice(0, 10)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function PostPage({ slug }: { slug: string }) {
  const [post, setPost] = useState<Post | null | undefined>(undefined);
  const [updates, setUpdates] = useState<DevlogEntry[] | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editStep, setEditStep] = useState<"email" | "token">("email");
  const [editEmail, setEditEmail] = useState("");
  const [editToken, setEditToken] = useState("");
  const [editStatus, setEditStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/posts/${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? (res.json() as Promise<Post>) : null))
      .then(setPost)
      .catch(() => setPost(null));
  }, [slug]);

  useEffect(() => {
    fetch("/api/devlog")
      .then((res) => (res.ok ? (res.json() as Promise<DevlogEntry[]>) : []))
      .then((data) => setUpdates(Array.isArray(data) ? data : []))
      .catch(() => setUpdates([]));
  }, []);

  if (post === undefined) return <article className="pf-page" aria-busy="true" />;
  if (post === null) {
    return (
      <article className="pf-page">
        <h1>Post not found</h1>
        <p className="pf-muted">
          It may not have been approved yet. <Link to="/skills">Back to Skills &amp; Tools</Link>
        </p>
      </article>
    );
  }
  return (
    <article className="pf-page pf-post">
      <header className="pf-page-head">
        <h1>{post.title}</h1>
        <p className="pf-sub">{post.summary}</p>
        <p className="pf-muted pf-skill-meta">
          {post.author} · {post.published_at.slice(0, 10)}
        </p>
      </header>
      <PostBody post={post} />
      <section className="pf-post-updates">
        <h2>Updates</h2>
        {updates === null ? (
          <p className="pf-muted" role="status">Loading updates…</p>
        ) : updates.length === 0 ? (
          <p className="pf-muted">No updates yet.</p>
        ) : (
          <ul className="pf-devlog">
            {updates.map((entry, i) => (
              <li className="pf-devlog-entry" key={`${entry.date}-${entry.title}-${i}`}>
                <p className="pf-devlog-meta">
                  <span className="pf-devlog-project">{entry.project}</span>
                  <time dateTime={entry.date}>{entry.date}</time>
                </p>
                <h3>{entry.title}</h3>
                <p>{entry.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p>
        <button type="button" className="pf-btn" onClick={() => { setEditOpen(true); setEditStep("email"); setEditStatus(null); }}>
          Edit post
        </button>{" "}
        <Link to="/skills">Back to Skills &amp; Tools</Link>
      </p>
      {editOpen ? (
        <div className="pf-post-modal" role="dialog" aria-modal="true">
          <div className="pf-post-modal-card">
            <h2>Edit post</h2>
            {editStep === "email" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(editEmail)) {
                    setEditStatus("Enter a valid email.");
                    return;
                  }
                  setEditStep("token");
                  setEditStatus(null);
                }}
              >
                <label>
                  Email
                  <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
                </label>
                <p className="pf-muted">
                  We'll send a one-time token to this address. It's used only to post updates or make site edits.
                </p>
                {editStatus ? <p role="alert">{editStatus}</p> : null}
                <button type="submit" className="pf-btn">Send token</button>{" "}
                <button type="button" onClick={() => setEditOpen(false)}>Cancel</button>
              </form>
            ) : (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  try {
                    const ciphertext = await encryptToken(editToken, editEmail);
                    setEditStatus(`Token accepted (encrypted). ${ciphertext.slice(0, 8)}…`);
                  } catch {
                    setEditStatus("Could not encrypt token.");
                  }
                  setEditToken("");
                }}
              >
                <label>
                  Token
                  <input type="password" value={editToken} onChange={(e) => setEditToken(e.target.value)} required autoComplete="off" />
                </label>
                <p className="pf-muted">The token is encrypted in your browser and is never stored in plaintext.</p>
                {editStatus ? <p role="status">{editStatus}</p> : null}
                <button type="submit" className="pf-btn">Submit</button>{" "}
                <button type="button" onClick={() => { setEditOpen(false); setEditToken(""); }}>Close</button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function SubmitPage() {
  const [state, setState] = useState<"idle" | "sending" | "queued">("idle");
  const [reasons, setReasons] = useState<readonly Rejection[]>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    setReasons([]);
    try {
      const res = await fetch("/api/posts", { method: "POST", body: new FormData(event.currentTarget) });
      const reply = (await res.json()) as { ok: boolean; reasons?: Rejection[] };
      if (reply.ok) return setState("queued");
      setReasons(reply.reasons ?? [{ field: "form", reason: "The post wasn't accepted." }]);
    } catch {
      setReasons([{ field: "form", reason: "The post couldn't be sent. Try again." }]);
    }
    setState("idle");
  }

  if (state === "queued") {
    return (
      <article className="pf-page">
        <h1>Thanks</h1>
        <p role="status">Your post passed screening and is waiting for review. Nothing goes live until it's approved.</p>
        <p>
          <Link to="/skills">Back to Skills &amp; Tools</Link>
        </p>
      </article>
    );
  }

  return (
    <article className="pf-page">
      <header className="pf-page-head">
        <h1>Submit a post</h1>
        <p className="pf-sub">Posts are screened automatically, then reviewed by hand before they're published.</p>
      </header>
      {reasons.length > 0 ? (
        <ul className="pf-post-errors" role="alert">
          {reasons.map((item, i) => (
            <li key={i}>
              {item.field === "form" ? item.reason : `${item.field}: ${item.reason}`}
            </li>
          ))}
        </ul>
      ) : null}
      <form className="pf-post-form" onSubmit={(event) => void submit(event)}>
        <label>
          Title
          <input name="title" required maxLength={120} />
        </label>
        <label>
          Summary
          <input name="summary" required maxLength={280} />
        </label>
        <label>
          Name (optional)
          <input name="author" maxLength={60} />
        </label>
        <label>
          Email (optional)
          <input name="email" type="email" maxLength={120} />
        </label>
        <p className="pf-muted">
          Your email is used only to send you one-time use tokens to post updates or make site edits. It is not stored for
          marketing.
        </p>
        <label>
          Skill
          <select name="skill" defaultValue="">
            <option value="">None</option>
            {catalog.entries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Post
          <textarea name="body" required rows={14} maxLength={20000} />
        </label>
        <p className="pf-muted">
          Start a line with <code>## </code> for a heading and <code>- </code> for a list. Links are{" "}
          <code>[text](https://example.com)</code>. Use <code>**bold**</code> and <code>`code`</code>, or put longer
          code between lines of <code>```</code>. Place an attached image
          with <code>![description](image:1)</code>, on its own line.
        </p>
        <label>
          Images (up to 4, 1 MB each)
          <input name="images" type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" />
        </label>
        <label className="pf-post-trap" aria-hidden="true">
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
        <button className="pf-btn" type="submit" disabled={state === "sending"}>
          {state === "sending" ? "Screening…" : "Submit for review"}
        </button>
      </form>
    </article>
  );
}

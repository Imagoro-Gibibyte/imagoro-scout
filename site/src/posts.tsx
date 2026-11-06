import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import catalog from "../catalog/skills.json";
import { LOGIN_ROUTE, REGISTER_ROUTE, displayName, useMe, type OwnPost } from "./auth";
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
  post?: string | null;
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
  const [editStep, setEditStep] = useState<"email" | "token" | "edit">("email");
  const [editEmail, setEditEmail] = useState("");
  const [editToken, setEditToken] = useState("");
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editBody, setEditBody] = useState("");
  const [removeImages, setRemoveImages] = useState<Set<number>>(new Set());
  const me = useMe();
  const [owned, setOwned] = useState(false);

  // The owner edits with their session; everyone else goes through the emailed token.
  useEffect(() => {
    if (!me) return setOwned(false);
    fetch("/api/auth/posts")
      .then((res) => (res.ok ? (res.json() as Promise<OwnPost[]>) : []))
      .then((own) => setOwned(own.some((item) => item.slug === slug)))
      .catch(() => setOwned(false));
  }, [me, slug]);

  useEffect(() => {
    fetch(`/api/posts/${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? (res.json() as Promise<Post>) : null))
      .then(setPost)
      .catch(() => setPost(null));
  }, [slug]);

  useEffect(() => {
    fetch(`/api/devlog?post=${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? (res.json() as Promise<DevlogEntry[]>) : []))
      .then((data) => setUpdates(Array.isArray(data) ? data : []))
      .catch(() => setUpdates([]));
  }, [slug]);

  useEffect(() => {
    if (!post) return;
    setEditTitle(post.title);
    setEditSummary(post.summary);
    setEditBody(post.body);
  }, [post]);

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
        <button type="button" className="pf-btn" onClick={() => { setEditOpen(true); setEditStep(owned ? "edit" : "email"); setEditStatus(null); }}>
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
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(editEmail)) {
                    setEditStatus("Enter a valid email.");
                    return;
                  }
                  try {
                    const res = await fetch(`/api/posts/${encodeURIComponent(slug)}/edit-request`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email: editEmail })
                    });
                    if (res.ok) {
                      setEditStep("token");
                      setEditStatus(null);
                    } else {
                      setEditStatus("Could not send token.");
                    }
                  } catch {
                    setEditStatus("Could not send token.");
                  }
                }}
              >
                <label>
                  Email
                  <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
                </label>
                <p className="pf-muted">
                  If this is the email the post was submitted with, we'll send a one-time token to it.{" "}
                  {me ? null : (
                    <>
                      Posts submitted while <Link to={LOGIN_ROUTE}>signed in</Link> can be edited without one.
                    </>
                  )}
                </p>
                {editStatus ? <p role="alert">{editStatus}</p> : null}
                <button type="submit" className="pf-btn">Send token</button>{" "}
                <button type="button" onClick={() => setEditOpen(false)}>Cancel</button>
              </form>
            ) : editStep === "token" ? (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  try {
                    const res = await fetch(`/api/posts/${encodeURIComponent(slug)}/edit-verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: editEmail, token: editToken }) });
                    const reply = (await res.json()) as { ok?: boolean; reason?: string };
                    if (reply.ok) {
                      setEditStep("edit");
                      setEditStatus(null);
                    } else {
                      setEditStatus(reply.reason ?? "Invalid token.");
                    }
                  } catch {
                    setEditStatus("Could not verify token.");
                  }
                }}
              >
                <label>
                  Token
                  <input type="password" value={editToken} onChange={(e) => setEditToken(e.target.value)} required autoComplete="off" />
                </label>
                <p className="pf-muted">
                  The token travels over HTTPS and is checked on the server, which stores only its hash. It's spent when you save.
                </p>
                {editStatus ? <p role="status">{editStatus}</p> : null}
                <button type="submit" className="pf-btn">Submit</button>{" "}
                <button type="button" onClick={() => { setEditOpen(false); setEditToken(""); }}>Close</button>
              </form>
            ) : (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  try {
                    const res = await fetch(`/api/posts/${encodeURIComponent(slug)}/edit-apply`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        ...(owned ? {} : { email: editEmail, token: editToken }),
                        title: editTitle,
                        summary: editSummary,
                        body: editBody,
                        removeImages: Array.from(removeImages)
                      })
                    });
                    const reply = (await res.json()) as { ok?: boolean; reason?: string; reasons?: { field: string; reason: string }[] };
                    if (reply.ok) {
                      setEditStatus("Post updated.");
                      setEditToken("");
                      // refresh the page data
                      window.location.reload();
                    } else if (reply.reasons) {
                      setEditStatus(reply.reasons.map((r) => `${r.field}: ${r.reason}`).join("; "));
                    } else {
                      setEditStatus(reply.reason ?? "Update failed.");
                    }
                  } catch {
                    setEditStatus("Could not update post.");
                  }
                }}
              >
                <label>
                  Title
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required maxLength={120} />
                </label>
                <label>
                  Summary
                  <input value={editSummary} onChange={(e) => setEditSummary(e.target.value)} required maxLength={280} />
                </label>
                <label>
                  Post
                  <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} required rows={10} maxLength={20000} />
                </label>
                {post && Object.keys(post.images).length > 0 ? (
                  <fieldset>
                    <legend>Remove images</legend>
                    {Object.keys(post.images).map((pos) => (
                      <label key={pos}>
                        <input
                          type="checkbox"
                          checked={removeImages.has(Number(pos))}
                          onChange={(e) => {
                            setRemoveImages((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(Number(pos));
                              else next.delete(Number(pos));
                              return next;
                            });
                          }}
                        />
                        Image {pos}
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                <p className="pf-muted">Links are re-screened on save.</p>
                {editStatus ? <p role="status">{editStatus}</p> : null}
                <button type="submit" className="pf-btn">Save changes</button>{" "}
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
  const me = useMe();
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
          {me ? (
            <>
              <Link to="/account/posts">Your posts</Link> ·{" "}
            </>
          ) : null}
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
        {me ? (
          <>
            <label>
              Name
              <input name="author" maxLength={60} defaultValue={me.profile.displayName ?? ""} placeholder="Anonymous" />
            </label>
            <p className="pf-muted">
              Posting as {displayName(me)}. The post is linked to your account, so you can edit it while signed in.
            </p>
          </>
        ) : (
          <>
            <label>
              Name (optional)
              <input name="author" maxLength={60} />
            </label>
            <label>
              Email (optional)
              <input name="email" type="email" maxLength={254} />
            </label>
            <p className="pf-muted">
              Your email is used only to send you one-time tokens to edit this post, and only a salted hash of it is stored.{" "}
              Or <Link to={`${LOGIN_ROUTE}?next=${SUBMIT_ROUTE}`}>sign in</Link> or <Link to={REGISTER_ROUTE}>create an account</Link>{" "}
              to own your posts. See the <Link to="/privacy">privacy notice</Link>.
            </p>
          </>
        )}
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

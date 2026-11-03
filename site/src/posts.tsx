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

  useEffect(() => {
    fetch(`/api/posts/${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? (res.json() as Promise<Post>) : null))
      .then(setPost)
      .catch(() => setPost(null));
  }, [slug]);

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
      <p>
        <Link to="/skills">Back to Skills &amp; Tools</Link>
      </p>
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

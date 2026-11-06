import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Link, navigate } from "./router";

/**
 * Site accounts, on the client. The session lives in an HttpOnly cookie the page can't read,
 * so the signed-in state comes from `/api/auth/me`, held once per page load and shared
 * the same way as the router's path.
 */

export interface Me {
  account: { email: string; emailVerified: boolean };
  profile: { displayName: string | null; bio: string | null; website: string | null };
}

export interface OwnPost {
  slug: string;
  title: string;
  summary: string;
  status: "pending" | "published" | "rejected";
  reject_reason: string | null;
  created_at: string;
  published_at: string | null;
}

interface Rejection {
  field: string;
  reason: string;
}

export const LOGIN_ROUTE = "/login";
export const REGISTER_ROUTE = "/register";
export const PROFILE_ROUTE = "/profile";
export const ACCOUNT_POSTS_ROUTE = "/account/posts";
export const RESET_ROUTE = "/reset";
export const VERIFY_ROUTE = "/verify";

/** undefined while the first check runs, null when signed out. */
let me: Me | null | undefined;
let started = false;
const listeners = new Set<() => void>();

function setMe(next: Me | null): void {
  me = next;
  for (const listener of listeners) listener();
}

export async function refreshMe(): Promise<Me | null> {
  try {
    const res = await fetch("/api/auth/me");
    setMe(res.ok ? ((await res.json()) as Me) : null);
  } catch {
    setMe(null);
  }
  return me ?? null;
}

export function useMe(): Me | null | undefined {
  if (!started && typeof window !== "undefined") {
    started = true;
    void refreshMe();
  }
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => me,
    () => undefined
  );
}

export function displayName(value: Me): string {
  return value.profile.displayName || value.account.email;
}

function initials(value: Me): string {
  const words = displayName(value).replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join("") || "?";
}

/** JSON to an auth route. Every failure comes back as a list of reasons to show. */
async function send(path: string, body: unknown = {}, method = "POST"): Promise<{ ok: boolean; reasons: Rejection[]; data: Record<string, unknown> }> {
  try {
    const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { reasons?: Rejection[]; reason?: string };
    if (res.ok) return { ok: true, reasons: [], data };
    return { ok: false, reasons: data.reasons ?? [{ field: "form", reason: data.reason ?? "That didn't work. Try again." }], data };
  } catch {
    return { ok: false, reasons: [{ field: "form", reason: "The request couldn't be sent. Try again." }], data: {} };
  }
}

/** The fragment, so emailed tokens never reach a server log. */
function tokenFromHash(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

/** Where to go after signing in: a same-site path only. */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next") ?? "";
  return next.startsWith("/") && !next.startsWith("//") ? next : PROFILE_ROUTE;
}

function Reasons({ reasons }: { reasons: readonly Rejection[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="pf-post-errors" role="alert">
      {reasons.map((item, i) => (
        <li key={i}>{item.reason}</li>
      ))}
    </ul>
  );
}

function PrivacyNote() {
  return (
    <p className="pf-muted pf-auth-note">
      Your email and a hash of your password are stored to run your account, and nothing is sold or used for ads.{" "}
      <Link to="/privacy">Privacy notice</Link> · <Link to="/terms">Terms of use</Link>
    </p>
  );
}

/** The header's account link: initials and Profile when signed in. */
export function AccountChip() {
  const value = useMe();
  if (value === undefined) return null;
  if (!value) {
    return (
      <Link className="pf-nav-link" to={LOGIN_ROUTE}>
        Sign in
      </Link>
    );
  }
  return (
    <Link className="pf-nav-link pf-account-chip" to={PROFILE_ROUTE}>
      <span className="pf-avatar" aria-hidden="true">
        {initials(value)}
      </span>
      Profile
    </Link>
  );
}

function LoginForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<Rejection[]>([]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const reply = await send("/api/auth/login", { email, password });
    setBusy(false);
    if (!reply.ok) return setReasons(reply.reasons);
    setPassword("");
    await refreshMe();
    if (!compact) navigate(nextPath());
  }

  return (
    <form className="pf-post-form pf-auth-form" onSubmit={(event) => void submit(event)}>
      <Reasons reasons={reasons} />
      <label>
        Email
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} />
      </label>
      <label>
        Password
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      <p>
        <button className="pf-btn" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>{" "}
        <Link to={RESET_ROUTE}>Forgot password?</Link>
      </p>
    </form>
  );
}

/** The compact card on the home page. */
export function LoginPanel() {
  const value = useMe();
  if (value === undefined) return null;
  return (
    <section className="pf-section pf-auth-panel" aria-label="Account">
      {value ? (
        <>
          <h2>Signed in as {displayName(value)}</h2>
          <p className="pf-cta-links">
            <Link className="pf-btn" to={PROFILE_ROUTE}>
              Profile
            </Link>
            <Link className="pf-btn" to={ACCOUNT_POSTS_ROUTE}>
              Your posts
            </Link>
          </p>
        </>
      ) : (
        <>
          <h2>Sign in</h2>
          <p className="pf-sub">An account lets you own and edit the posts you submit.</p>
          <LoginForm compact />
          <p>
            New here? <Link to={REGISTER_ROUTE}>Create an account</Link>
          </p>
        </>
      )}
      <PrivacyNote />
    </section>
  );
}

function AuthPage({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <article className="pf-page">
      <header className="pf-page-head">
        <h1>{title}</h1>
        {sub ? <p className="pf-sub">{sub}</p> : null}
      </header>
      {children}
    </article>
  );
}

/** Sends signed-out visitors to the login page, and back here afterwards. */
function RequireAccount({ route, children }: { route: string; children: (value: Me) => ReactNode }) {
  const value = useMe();
  useEffect(() => {
    if (value === null) navigate(`${LOGIN_ROUTE}?next=${encodeURIComponent(route)}`);
  }, [value, route]);
  if (!value) return <article className="pf-page" aria-busy="true" />;
  return <>{children(value)}</>;
}

export function LoginPage() {
  const value = useMe();
  return (
    <AuthPage title="Sign in">
      {value ? (
        <p>
          You're signed in as {displayName(value)}. <Link to={PROFILE_ROUTE}>Go to your profile</Link>
        </p>
      ) : (
        <>
          <LoginForm />
          <p>
            New here? <Link to={REGISTER_ROUTE}>Create an account</Link>
          </p>
          <PrivacyNote />
        </>
      )}
    </AuthPage>
  );
}

export function RegisterPage() {
  const [reasons, setReasons] = useState<Rejection[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirm")) {
      return setReasons([{ field: "confirm", reason: "The passwords don't match." }]);
    }
    setBusy(true);
    const reply = await send("/api/auth/register", {
      email: form.get("email"),
      password: form.get("password"),
      displayName: form.get("displayName")
    });
    setBusy(false);
    if (!reply.ok) return setReasons(reply.reasons);
    await refreshMe();
    navigate(PROFILE_ROUTE);
  }

  return (
    <AuthPage title="Create an account" sub="Own the posts you submit, and edit them without an emailed token.">
      <Reasons reasons={reasons} />
      <form className="pf-post-form pf-auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required maxLength={254} />
        </label>
        <label>
          Display name (optional)
          <input name="displayName" autoComplete="nickname" maxLength={60} />
        </label>
        <label>
          Password (at least 12 characters)
          <input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} />
        </label>
        <label>
          Confirm password
          <input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={256} />
        </label>
        <label className="pf-auth-check">
          <input name="terms" type="checkbox" required /> I've read the <Link to="/privacy">privacy notice</Link> and agree to the{" "}
          <Link to="/terms">terms of use</Link>.
        </label>
        <button className="pf-btn" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p>
        Already have one? <Link to={LOGIN_ROUTE}>Sign in</Link>
      </p>
    </AuthPage>
  );
}

export function OwnPosts() {
  const [posts, setPosts] = useState<OwnPost[] | null>(null);
  useEffect(() => {
    fetch("/api/auth/posts")
      .then((res) => (res.ok ? (res.json() as Promise<OwnPost[]>) : []))
      .then(setPosts)
      .catch(() => setPosts([]));
  }, []);

  if (posts === null) return <p className="pf-muted" role="status">Loading posts…</p>;
  if (posts.length === 0) {
    return (
      <p className="pf-muted">
        No posts yet. <Link to="/skills/posts/new">Submit one</Link>
      </p>
    );
  }
  return (
    <ul className="pf-cards">
      {posts.map((post) => (
        <li className="pf-card" key={post.slug}>
          <h3>{post.status === "published" ? <Link to={`/skills/posts/${post.slug}`}>{post.title}</Link> : post.title}</h3>
          <p>{post.summary}</p>
          <p className="pf-muted pf-skill-meta">
            <span className={`pf-status pf-status-${post.status}`}>{post.status}</span> · {(post.published_at ?? post.created_at).slice(0, 10)}
          </p>
          {post.status === "rejected" && post.reject_reason ? <p className="pf-muted">Reason: {post.reject_reason}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function AccountPostsPage() {
  return (
    <RequireAccount route={ACCOUNT_POSTS_ROUTE}>
      {() => (
        <AuthPage title="Your posts" sub="Pending posts wait for review. Published ones can be edited from their page.">
          <OwnPosts />
          <p>
            <Link to={PROFILE_ROUTE}>Back to your profile</Link>
          </p>
        </AuthPage>
      )}
    </RequireAccount>
  );
}

function ProfileForm({ value }: { value: Me }) {
  const [status, setStatus] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Rejection[]>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reply = await send(
      "/api/auth/profile",
      { displayName: form.get("displayName"), bio: form.get("bio"), website: form.get("website") },
      "PATCH"
    );
    setReasons(reply.reasons);
    setStatus(reply.ok ? "Profile saved." : null);
    if (reply.ok) await refreshMe();
  }

  return (
    <form className="pf-post-form" onSubmit={(event) => void submit(event)}>
      <Reasons reasons={reasons} />
      <label>
        Display name
        <input name="displayName" defaultValue={value.profile.displayName ?? ""} maxLength={60} />
      </label>
      <label>
        Bio
        <textarea name="bio" defaultValue={value.profile.bio ?? ""} rows={4} maxLength={500} />
      </label>
      <label>
        Website
        <input name="website" type="url" placeholder="https://" defaultValue={value.profile.website ?? ""} maxLength={200} />
      </label>
      {status ? <p role="status">{status}</p> : null}
      <button className="pf-btn" type="submit">
        Save profile
      </button>
    </form>
  );
}

function PasswordForm() {
  const [status, setStatus] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Rejection[]>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    if (form.get("next") !== form.get("confirm")) {
      setStatus(null);
      return setReasons([{ field: "confirm", reason: "The new passwords don't match." }]);
    }
    const reply = await send("/api/auth/change-password", { current: form.get("current"), next: form.get("next") });
    setReasons(reply.reasons);
    setStatus(reply.ok ? "Password changed. Other sessions were signed out." : null);
    if (reply.ok) target.reset();
  }

  return (
    <form className="pf-post-form" onSubmit={(event) => void submit(event)}>
      <Reasons reasons={reasons} />
      <label>
        Current password
        <input name="current" type="password" autoComplete="current-password" required />
      </label>
      <label>
        New password (at least 12 characters)
        <input name="next" type="password" autoComplete="new-password" required minLength={12} maxLength={256} />
      </label>
      <label>
        Confirm new password
        <input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={256} />
      </label>
      {status ? <p role="status">{status}</p> : null}
      <button className="pf-btn" type="submit">
        Change password
      </button>
    </form>
  );
}

function DeleteAccount() {
  const [reasons, setReasons] = useState<Rejection[]>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm("Delete your account and every post you submitted? This can't be undone.")) return;
    const reply = await send("/api/auth/account", { password: new FormData(event.currentTarget).get("password") }, "DELETE");
    if (!reply.ok) return setReasons(reply.reasons);
    await refreshMe();
    navigate("/");
  }

  return (
    <form className="pf-post-form" onSubmit={(event) => void submit(event)}>
      <p className="pf-muted">This removes the account, its sessions and history, and every post it submitted, published or not.</p>
      <Reasons reasons={reasons} />
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <button className="pf-btn pf-btn-danger" type="submit">
        Delete account
      </button>
    </form>
  );
}

function VerifyNotice({ value }: { value: Me }) {
  const [status, setStatus] = useState<string | null>(null);
  if (value.account.emailVerified) return <p className="pf-muted">Email confirmed.</p>;
  return (
    <p className="pf-muted">
      Email not confirmed yet.{" "}
      <button
        type="button"
        className="pf-link-btn"
        onClick={async () => {
          const reply = await send("/api/auth/verify-email");
          setStatus(reply.ok ? (reply.data.emailSent ? "A new link is on its way." : "Mail isn't set up yet, so no link was sent.") : reply.reasons[0]!.reason);
        }}
      >
        Send a new link
      </button>
      {status ? <span role="status"> {status}</span> : null}
    </p>
  );
}

export function ProfilePage() {
  return (
    <RequireAccount route={PROFILE_ROUTE}>
      {(value) => (
        <AuthPage title="Profile" sub={value.account.email}>
          <VerifyNotice value={value} />
          <section className="pf-section">
            <h2>About you</h2>
            <ProfileForm value={value} />
          </section>
          <section className="pf-section">
            <h2>Your posts</h2>
            <OwnPosts />
          </section>
          <section className="pf-section">
            <h2>Password</h2>
            <PasswordForm />
          </section>
          <section className="pf-section">
            <h2>Your data</h2>
            <p>
              <a className="pf-btn" href="/api/auth/account" download="account.json">
                Download your data
              </a>{" "}
              <button
                type="button"
                className="pf-btn"
                onClick={async () => {
                  await send("/api/auth/logout");
                  await refreshMe();
                  navigate("/");
                }}
              >
                Sign out
              </button>
            </p>
            <p className="pf-muted">
              See the <Link to="/privacy">privacy notice</Link> for what's stored and for how long.
            </p>
          </section>
          <section className="pf-section">
            <h2>Delete account</h2>
            <DeleteAccount />
          </section>
        </AuthPage>
      )}
    </RequireAccount>
  );
}

export function ResetPage() {
  const [token] = useState(tokenFromHash);
  const [done, setDone] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Rejection[]>([]);

  async function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reply = await send("/api/auth/request-reset", { email: new FormData(event.currentTarget).get("email") });
    if (!reply.ok) return setReasons(reply.reasons);
    setDone("If an account uses that email, a reset link is on its way. It works for an hour.");
  }

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirm")) return setReasons([{ field: "confirm", reason: "The passwords don't match." }]);
    const reply = await send("/api/auth/reset", { token, password: form.get("password") });
    if (!reply.ok) return setReasons(reply.reasons);
    window.history.replaceState(null, "", RESET_ROUTE);
    setDone("Password changed, and every session was signed out. Sign in with the new password.");
  }

  return (
    <AuthPage title="Reset password">
      {done ? (
        <p role="status">
          {done} <Link to={LOGIN_ROUTE}>Sign in</Link>
        </p>
      ) : (
        <>
          <Reasons reasons={reasons} />
          {token ? (
            <form className="pf-post-form" onSubmit={(event) => void reset(event)}>
              <label>
                New password (at least 12 characters)
                <input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} />
              </label>
              <label>
                Confirm new password
                <input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={256} />
              </label>
              <button className="pf-btn" type="submit">
                Set password
              </button>
            </form>
          ) : (
            <form className="pf-post-form" onSubmit={(event) => void request(event)}>
              <label>
                Email
                <input name="email" type="email" autoComplete="email" required maxLength={254} />
              </label>
              <button className="pf-btn" type="submit">
                Send reset link
              </button>
            </form>
          )}
        </>
      )}
    </AuthPage>
  );
}

export function VerifyPage() {
  const [token] = useState(tokenFromHash);
  const [status, setStatus] = useState<string>("Confirming…");
  // Strict mode runs effects twice, and a token can only be spent once.
  const sent = useRef(false);
  useEffect(() => {
    if (!token) return setStatus("This link has no token. Open the link from the email again.");
    if (sent.current) return;
    sent.current = true;
    window.history.replaceState(null, "", VERIFY_ROUTE);
    void send("/api/auth/verify-email", { token }).then(async (reply) => {
      setStatus(reply.ok ? "Email confirmed." : reply.reasons[0]!.reason);
      if (reply.ok) await refreshMe();
    });
  }, [token]);
  return (
    <AuthPage title="Confirm email">
      <p role="status">{status}</p>
      <p>
        <Link to={PROFILE_ROUTE}>Go to your profile</Link>
      </p>
    </AuthPage>
  );
}

/** Account routes, for the shell. */
export const ACCOUNT_PAGES: Record<string, { title: string; Page: () => ReactNode }> = {
  [LOGIN_ROUTE]: { title: "Sign in", Page: LoginPage },
  [REGISTER_ROUTE]: { title: "Create an account", Page: RegisterPage },
  [PROFILE_ROUTE]: { title: "Profile", Page: ProfilePage },
  [ACCOUNT_POSTS_ROUTE]: { title: "Your posts", Page: AccountPostsPage },
  [RESET_ROUTE]: { title: "Reset password", Page: ResetPage },
  [VERIFY_ROUTE]: { title: "Confirm email", Page: VerifyPage }
};

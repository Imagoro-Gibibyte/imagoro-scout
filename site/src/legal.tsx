import type { ReactNode } from "react";
import { Link } from "./router";

/**
 * The privacy notice and terms of use. Each statement here describes what the code in
 * `functions/` does, so a change to what's stored or who processes it changes this page too.
 *
 * The contact address is a build input (`VITE_PRIVACY_CONTACT`), like the repository URL,
 * so no deployed address is committed. Without it, requests go through the contact page.
 */

const CONTACT = (import.meta.env.VITE_PRIVACY_CONTACT ?? "").trim();
export const LAST_UPDATED = "2026-11-11";

function Contact() {
  return CONTACT ? (
    <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
  ) : (
    <>
      the <Link to="/contact">contact page</Link>
    </>
  );
}

function Legal({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <article className="pf-page pf-legal">
      <header className="pf-page-head">
        <h1>{title}</h1>
        <p className="pf-sub">{sub}</p>
        <p className="pf-muted">Last updated {LAST_UPDATED}</p>
      </header>
      {children}
    </article>
  );
}

export function PrivacyPage() {
  return (
    <Legal title="Privacy notice" sub="What this site stores about you, who processes it, and how to have it changed or removed.">
      <section className="pf-section">
        <h2>Who processes your data</h2>
        <p>The site runs entirely on Cloudflare, which processes data on the operator's behalf:</p>
        <ul className="pf-points">
          <li>Cloudflare Pages hosts the pages.</li>
          <li>Pages Functions, which run on Cloudflare Workers, handle sign-in, posts and download counts.</li>
          <li>Cloudflare D1 stores accounts, posts and counters, in the site's own Cloudflare account.</li>
          <li>Workers AI checks images attached to posts, and Cloudflare's malware-blocking resolver checks the links in them.</li>
          <li>
            Cloudflare Email Service sends account and edit-token emails, so it receives the recipient address and the message.
          </li>
        </ul>
      </section>

      <section className="pf-section">
        <h2>What's collected</h2>
        <ul className="pf-points">
          <li>
            <strong>Account:</strong> your email address, a salted PBKDF2 hash of your password (never the password itself), and
            when the account was created and its email confirmed.
          </li>
          <li>
            <strong>Profile:</strong> the display name, bio and website you choose to enter.
          </li>
          <li>
            <strong>Posts:</strong> what you submit, its images, and its review status. Posts you submit while signed in are linked
            to your account.
          </li>
          <li>
            <strong>Sessions:</strong> a hash of the session token, when it was created and expires, and salted hashes of your IP
            address and browser's user agent. The address and user agent themselves aren't stored.
          </li>
          <li>
            <strong>Account history:</strong> sign-ins, sign-outs, failed sign-ins, password changes and email confirmations, each
            with a time and nothing else.
          </li>
          <li>
            <strong>Abuse limits:</strong> counters keyed by salted hashes of IP addresses and emails, which limit sign-in, sign-up,
            reset and submission attempts.
          </li>
          <li>
            <strong>Anonymous posts:</strong> if you leave an email without an account, only a salted hash of it is kept, so an edit
            token can be sent to that address later.
          </li>
          <li>
            <strong>Downloads:</strong> each download or share is counted once per visitor and day, using a hash that changes daily.
            No IP address is stored.
          </li>
        </ul>
        <p>
          Cloudflare also processes the network data that any request carries, such as your IP address, under its own terms, to
          deliver and protect the site.
        </p>
      </section>

      <section className="pf-section">
        <h2>Cookies and tracking</h2>
        <p>
          Signing in sets one cookie, <code>__Host-session</code>, which is HttpOnly, Secure and SameSite=Lax. It holds a random
          token and nothing about you. There are no advertising or tracking cookies, and your data is never sold or shared for
          advertising. If Cloudflare Web Analytics is turned on, it is cookieless and reports only aggregate counts.
        </p>
      </section>

      <section className="pf-section">
        <h2>How long it's kept</h2>
        <ul className="pf-points">
          <li>Your account, profile, posts, sessions and account history are kept until you delete the account.</li>
          <li>A session stops working after 7 days without use, and after 30 days at most.</li>
          <li>Password-reset links expire after an hour, and email-confirmation links after 48 hours.</li>
          <li>Edit tokens for anonymous posts expire after 15 minutes.</li>
        </ul>
      </section>

      <section className="pf-section">
        <h2>Your rights</h2>
        <ul className="pf-points">
          <li>
            <strong>Access and export:</strong> download everything stored about your account from your{" "}
            <Link to="/profile">profile</Link>, as one JSON file.
          </li>
          <li>
            <strong>Correction:</strong> change your profile and password on your profile page at any time.
          </li>
          <li>
            <strong>Deletion:</strong> deleting your account removes it, its sessions, history and tokens, and every post it
            submitted, published or not.
          </li>
        </ul>
        <p>
          For anything else, including a request about an anonymous post, reach the operator at <Contact />.
        </p>
      </section>

      <section className="pf-section">
        <h2>Security</h2>
        <ul className="pf-points">
          <li>The site is served only over HTTPS.</li>
          <li>Passwords and every token, whether session, reset, confirmation or edit, are stored only as hashes.</li>
          <li>Five wrong passwords lock an account's sign-in for 15 minutes.</li>
          <li>Requests that change anything must come from this site's own pages.</li>
          <li>All input is validated on the server, and post bodies are never rendered as HTML.</li>
        </ul>
      </section>
    </Legal>
  );
}

export function TermsPage() {
  return (
    <Legal title="Terms of use" sub="The rules for accounts and posts on this site.">
      <section className="pf-section">
        <h2>Accounts</h2>
        <p>
          Accounts are free, and are for this site only: they give you a profile and ownership of the posts you submit, and no
          access to anything else. Keep your password to yourself. You're responsible for what's posted from your account.
        </p>
      </section>

      <section className="pf-section">
        <h2>Acceptable use</h2>
        <ul className="pf-points">
          <li>Post only what you have the right to share.</li>
          <li>No malware, phishing, spam, explicit images, harassment, or anything unlawful.</li>
          <li>Don't try to get around the screening, the rate limits, or anyone else's account.</li>
          <li>Don't use the site to collect other people's data.</li>
        </ul>
      </section>

      <section className="pf-section">
        <h2>Your posts</h2>
        <p>
          You keep the rights to what you post. By submitting a post, you allow this site to store it, screen it, and show it
          publicly once it's approved. The site's own source code is licensed under Apache-2.0, and that license doesn't cover
          your posts.
        </p>
      </section>

      <section className="pf-section">
        <h2>Moderation</h2>
        <p>
          Every post is screened automatically and reviewed by hand before it's published. The operator can edit, reject or take
          down any post, and can suspend or delete an account that breaks these terms. You can delete your own account at any
          time from your <Link to="/profile">profile</Link>.
        </p>
      </section>

      <section className="pf-section">
        <h2>Disclaimers</h2>
        <p>
          The site and the skills and tools on it are provided as they are, without warranty of any kind. Downloads are yours to
          review before you run them. The operator isn't liable for losses that come from using the site or its content, as far
          as the law allows.
        </p>
      </section>

      <section className="pf-section">
        <h2>Changes</h2>
        <p>
          These terms and the <Link to="/privacy">privacy notice</Link> may change, and the date at the top says when they last
          did. Questions go to <Contact />.
        </p>
      </section>
    </Legal>
  );
}

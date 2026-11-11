import { useEffect, useState } from "react";
import { Avatar, TierBadge } from "./avatar";
import { Link } from "./router";

interface PublicProfile {
  handle: string;
  displayName: string | null;
  bio: string | null;
  website: string | null;
  role: string;
  joined: string;
  avatar: string | null;
  posts: { slug: string; title: string; summary: string; published_at: string }[];
}

/** /u/:handle: a public profile. Private and unknown profiles look the same: not found. */
export function PublicProfilePage({ handle }: { handle: string }) {
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  useEffect(() => {
    setProfile(undefined);
    fetch(`/api/people/${encodeURIComponent(handle)}`)
      .then((res) => (res.ok ? (res.json() as Promise<PublicProfile>) : null))
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [handle]);

  if (profile === undefined) return <article className="pf-page" aria-busy="true" />;
  if (profile === null) {
    return (
      <article className="pf-page">
        <h1>Profile not found</h1>
        <p className="pf-muted">There's no public profile with that handle.</p>
      </article>
    );
  }
  const name = profile.displayName || profile.handle;
  return (
    <article className="pf-page">
      <header className="pf-page-head pf-person-head">
        <Avatar src={profile.avatar} name={name} size="lg" />
        <div>
          <h1>
            {name} <TierBadge tier={profile.role} />
          </h1>
          <p className="pf-muted">
            @{profile.handle} · joined {profile.joined}
          </p>
        </div>
      </header>
      {profile.bio ? <p className="pf-person-bio">{profile.bio}</p> : null}
      {profile.website ? (
        <p>
          <a href={profile.website} target="_blank" rel="noopener noreferrer nofollow ugc">
            {profile.website.replace(/^https:\/\//, "").replace(/\/$/, "")}
          </a>
        </p>
      ) : null}
      <section className="pf-section">
        <h2>Posts</h2>
        {profile.posts.length === 0 ? (
          <p className="pf-muted">No published posts yet.</p>
        ) : (
          <ul className="pf-cards">
            {profile.posts.map((post) => (
              <li className="pf-card" key={post.slug}>
                <h3>
                  <Link to={`/skills/posts/${post.slug}`}>{post.title}</Link>
                </h3>
                <p>{post.summary}</p>
                <p className="pf-muted pf-skill-meta">{post.published_at.slice(0, 10)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

---
title: The site gets accounts, and post edits that work
date: 2026-11-06
area: ui
---

# The site gets accounts, and post edits that work

The site has accounts now. A post submitted while signed in belongs to the account, and its owner edits it from the post page with no token. Anonymous posts keep the emailed token, which now goes only to the address the post was submitted with. The site also has a privacy notice and terms of use.

## What changed

- **Accounts.** Register, sign in and out, a profile (display name, bio, an `https://` website), password change and reset, email confirmation, a JSON export of everything stored, and account deletion, which removes the account's posts too. They're [Pages Functions](../site/functions/api/auth) over D1, with the schema in [one migration](../site/migrations/0006_accounts.sql). An account grants nothing outside the site.
- **How sign-in is protected.** Passwords are PBKDF2-SHA256 at 100,000 iterations, the most Workers allow, with the count stored in each hash. The session is a random 256-bit token in a `__Host-` cookie (HttpOnly, Secure, SameSite=Lax), and only its SHA-256 is kept. Sessions last 7 days, slide while in use, and end 30 days after sign-in. Five wrong passwords lock an account for 15 minutes, each route has a per-IP limit, and any state-changing request from another origin is refused. A wrong password and an unknown email get the same answer.
- **Ownership.** Posts gain an owner. The submit form fills the author from the profile, and the post page skips the token for its owner. The profile lists the account's posts in every status.
- **Edit tokens, fixed.** A post now keeps a salted hash of the email it was submitted with, and a token is issued only for that address. The reply is the same either way. Checking a token no longer spends it: saving does.
- **The mail relay needs a key.** The email worker refuses any request without its relay token.
- **Privacy and terms.** `/privacy` lists what's stored, who processes it (Cloudflare for hosting, compute, storage and screening, plus a mail provider), how long it's kept, and how to export or delete it. `/terms` covers use, post licensing, moderation and disclaimers. Both are linked from the footer and the sign-in forms.

## Why

The token flow shipped on 2026-11-03 had two faults that tests would have caught. `edit-request` issued a token to whatever address was typed in, so anyone could edit any post with a token sent to their own mailbox. And `edit-verify` spent the token, so the `edit-apply` call that followed it always failed with 409. The 2026-11-03 entry named the missing tests as the next step. They're written now, and they caught both faults.

Accounts answer the question the token flow left open: an author who comes back days later shouldn't need a fresh email to fix a typo.

## What it means

- The site has 62 tests, 25 of them new, run against the real migrations on SQLite. They cover hashing, sessions, expiry and sliding, the lockout, the limits, the origin check, reset and confirmation links, deletion, the edit tokens, and the whole path: register, confirm, sign in, edit the profile, post, edit by session, sign out.
- On the live site, a registration takes about 2.2 seconds end to end.
- Mail delivery is still off, so confirmation, reset and edit-token emails aren't sent yet. Accounts and owner edits work without it.

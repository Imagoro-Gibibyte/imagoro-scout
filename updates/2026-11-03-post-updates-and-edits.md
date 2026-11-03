---
title: Updates attach to posts, and authors can edit with a token
date: 2026-11-03
area: ui
---

# Updates attach to posts, and authors can edit with a token

Devlog updates can now belong to a specific skill post, and the post page shows them. Authors can edit or remove their own post's text and images, after confirming an email address with a one-time token. The email delivery path is built but not yet switched on.

## What changed

- **Updates link to posts.** A devlog entry can name the post it updates. The post page shows only those entries, under an "Updates" heading, instead of the whole devlog. The devlog-update helper takes a `--post` flag for this.
- **Submit form asks for an email (optional).** A disclaimer says it's used only for one-time tokens to post updates or make site edits.
- **Edit flow in three steps.** The post page opens a dialog that asks for an email, then for the token, then shows an edit form. The form changes the title, summary and body, and can remove images. Links are screened again on save, as they are for admin edits.
- **Tokens are single-use and short-lived.** A token is random, lasts 15 minutes, and is stored only as a SHA-256 hash. Verifying it marks it used. The plaintext never reaches the database.
- **Email worker scaffold.** A Cloudflare Worker that forwards a token email to an email provider's API. It is not deployed. The Pages function calls it through `MAIL_PROVIDER_URL` and `MAIL_API_KEY`.

## Why

A devlog that was one flat stream couldn't say which change belonged to which skill. And once a post was approved, its author had no way to correct a typo or pull an image without asking an operator to use the admin tools. The token flow gives that correction path without putting an admin key in the browser or storing a password.

## What it means

- Until the worker is deployed and a provider key is set, `edit-request` issues the token but nothing is emailed. The edit flow can't be used by an outside author yet.
- The three new endpoints (`edit-request`, `edit-verify`, `edit-apply`) have no tests of their own. The existing 37 site tests pass, and the build and leak check are clean, but the token and edit paths are unexercised. Adding tests is the next step before enabling delivery.
- Editing only changes text and removes images. Adding a new image on edit isn't supported yet.

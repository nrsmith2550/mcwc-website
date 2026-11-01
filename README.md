# Mountain Cat Wrestling Club — Website

Website for the Mountain Cat Wrestling Club (supporting Pitt-Johnstown wrestling), hosted on GitHub Pages.

**Pages:** Home · About · Join (membership levels) · Member Feed (members only) · New Post and Admin (staff only) · Store with cart · Donate

## Staff posting
Staff sign in with Google on an unlisted login page (`/#staff`), then publish, edit, pin, draft and delete Member Feed posts.
They can also add and remove other staff on the Admin page. Posts are stored in Firebase on the free plan.

**To turn it on, follow [SETUP.md](SETUP.md).** Until `config.js` has Firebase settings, the site runs in
**demo mode**: sample posts, a "Preview as" menu, and nothing is saved.

## Files
| File | What it is |
|---|---|
| `index.html` | Page layout and styles |
| `app.js` | Site behaviour: feed, staff posting, store, cart |
| `config.js` | Firebase settings and optional membership payment link |
| `firestore.rules` | Database security rules (paste into Firebase) |
| `SETUP.md` | One-time Firebase setup steps |

## Not built yet (placeholders)
- Member logins. The feed's members-only screen stays up; for now only staff can read posts.
- Store checkout (membership dues and donations use the club's existing Stripe links)
- Membership levels 2–6 (names, prices, perks), mission text, board list, events
- Store products and prices

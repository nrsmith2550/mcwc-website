# Staff posting setup (Firebase, free)

Staff sign in with their Google account and post to the Member Feed. Posts are stored in
Google Firebase (Cloud Firestore) on the free **Spark** plan. No credit card is needed.

Plan on about 15 minutes. You only do this once.

## 1. Create the Firebase project
1. Go to <https://console.firebase.google.com> and sign in with the Google account that should own the club's data.
2. Click **Create a project** (or **Add project**) and name it `mcwc`. Google Analytics isn't needed, so you can turn it off.

## 2. Turn on "Sign in with Google"
1. In the left menu, go to **Build → Authentication → Get started**.
2. On the **Sign-in method** tab, choose **Google**, switch it to **Enable**, pick a support email, then click **Save**.
3. On the **Settings** tab, open **Authorized domains → Add domain** and enter `nrsmith2550.github.io`.
   Add your own domain here too if you move the site to one (e.g. `mcatwc.org`).

## 3. Create the database
1. Go to **Build → Firestore Database → Create database**.
2. Choose a US location (e.g. `nam5 (United States)`). It can't be changed later.
3. Choose **Start in production mode**.

## 4. Add the security rules
1. In Firestore, open the **Rules** tab.
2. Delete what's there, paste in the whole contents of [`firestore.rules`](firestore.rules), and click **Publish**.

These rules mean that only Google accounts on the staff list can read, write, edit or delete posts.

## 5. Add yourself as the first staff member
1. In Firestore, open the **Data** tab and click **+ Start collection**.
2. For **Collection ID**, type `staff`.
3. For **Document ID**, type your Google email **in all lowercase** (e.g. `nathansmith2550@gmail.com`).
4. Add a field: **name** (string) = your name. Click **Save**.

After this, you can add other staff from the website's **Admin** page. You won't need the console for that.

## 6. Connect the website
1. Click the **gear icon → Project settings**. Under **Your apps**, click the **Web** icon (`</>`).
2. Name the app `mcwc-website` and click **Register app**. Don't tick Firebase Hosting.
3. Copy the `firebaseConfig` values (`apiKey`, `authDomain`, `projectId`, …) into [`config.js`](config.js),
   replacing `firebase: null`. These values are meant to be public; the security rules are what protect the data.
4. Commit the change. GitHub Pages redeploys in about a minute.

## 7. Try it
Go to the staff login page, **https://nrsmith2550.github.io/mcwc-website/#staff**, and click **Sign in with Google**.
This page isn't linked anywhere on the site, so bookmark it and share it only with staff.
After you sign in, **+ New post** on the Member Feed is where you write.

## How staff use it
| Task | How |
|---|---|
| Sign in | Open the staff login page (`…/mcwc-website/#staff`) |
| Write a post | **Members → + New post**, type it, click **Publish to feed** |
| Save for later | Click **Save as draft**. Drafts are only visible to staff. |
| Fix a post | Click **Edit** on the post in the feed |
| Keep a post at the top | Click **Pin to top**, or tick the pin box while writing |
| Remove a post | Click **Delete** on the post |
| Give someone posting access | **Admin**, then add their Google email |

## Free plan limits
The Spark plan allows 50,000 reads, 20,000 writes and 20,000 deletes per day, with 1 GiB stored.
A club feed uses a tiny fraction of that. If a limit is ever hit, the database pauses until the
next day; it never charges you.

# MyScreenFolio

Your screen portfolio. Track everything you watch, rate it properly, curate it, and share it with friends. MyScreenFolio (MSF) is a tracker for **TV shows, movies, anime and cartoons**. It has a detailed scoring system, episode ratings, lists and notes, and a full social hub: friends, polls, an inbox, episode chats, Movie Nights, challenges and medals.

It's an installable Progressive Web App with no framework and no build step.

**Stack:** Vanilla HTML / CSS / JS · Supabase (PostgreSQL, Auth, Realtime, Storage) · TMDB + AniList APIs · Cloudinary · GitHub Pages

---

## Highlights

- Multi-user app with Supabase Auth and Row Level Security on every table
- Four libraries (TV · Movies · Anime · Cartoons) with watch progress, rewatches and statuses
- Detailed ratings: core, bonus and animation criteria with a weighted final score
- Episode and season ratings, with graphs, fan favourites and a dedicated Episodes page
- Discover: trending, top-rated, "Top Rated on MSF", genre lists, Browse and "Your TV" release schedule
- Personal and collaborative lists, notes (with spoiler flags), reactions and comments
- **Social hub:** friends, activity feed, taste match, compare, Blend, Episode Chat, Movie Night, Challenges, Polls and a two-way Inbox
- **Official challenges, medals and spotlight popups** run from an official account
- Live in-app notifications (Realtime) for friends, lists, new episodes and releases
- Admin dashboard with moderation: word filter, flags, bans and picture checks
- 15 languages for the site's own text, and the language follows the account
- Shared Sort & Filter system, PDF export, offline support, light and dark themes
- Built mobile-first and checked at 320px, 390px, tablet and desktop

---

## Features

### Libraries & tracking

- Four libraries: **TV Shows, Movies, Anime, Cartoons**, plus a unified **Library** page.
- Statuses:
  - Watchlist
  - **Up Next** (shown first in Watching)
  - Watching
  - Taking a Break
  - Watched
  - To Be Continued (watched but still airing)
- Episode progress by season and episode, with season breakdowns and total episodes. Movies track runtime.
- Exact "watched" date and time, so same-day titles stay in order.
- Rewatch tracking with a rewatch-count badge.
- Anime and Cartoons can be a Movie or a Show. TV and Movies can switch on an Animation Quality rating.
- Live stats bars on every library: totals, episodes watched and movie watch time.
- "Length" convention everywhere: movies use runtime, shows use seasons and episodes.

### Ratings

- Each title is rated across **core** criteria, optional **bonus** criteria and an optional **Animation Quality**, on +/− steppers from 0.0 to 10.0.
  - **Core:** Story & Plot · Acting / Voice Acting · Character Development · Writing & Dialogue · World Building · Pacing & Consistency · Cinematography & Visuals · Ending & Payoff · Enjoyment
  - **Bonus:** Music & Soundtrack · Emotional Impact · Main Character vs Villain Dynamics · Rewatchability · Plot Twist Quality · Funny · Bingeable · Horror
  - **Anime / cartoons** get their own set: Voice Acting, Character Designs, Animation Quality, Action Choreography and more.
- **Final score:** 70% the core average, plus Enjoyment and the bonus average. Enjoyment and bonus together make 20% + 10%, and either one alone makes 30%.
- Your score always shows as `★ 8.81`. Poster badges are colour-coded by tier, from gold for 10 down to deep red.
- One shared **Ratings popup** is used on every page.

### Episodes

- Rate episodes and seasons (SeriesGraph-style), with a prompt when you press **+** on a show and named score bands.
- **Episodes page:** look up any show and see its episode ratings as a list or a graph, alongside TMDB ratings.
- **Fan Favorites** on the title page understand how people type episode and character names.
- "New episode" and "Out today" notifications, grouped to one per show per release day.

### Titles, people & Discover

- **Title page** (TMDB): hero backdrop, MSF community score next to TMDB's, seasons, cast, "In Lists", fan favourites, friends who watched it, and the episode chat.
- **Person page:** biography, personal info and known-for credits.
- **Discover:**
  - Trending, Top Picks, Upcoming, Top 250, Airing Today, genre "best of" lists and anime / cartoon categories
  - "Top Rated on MSF"
  - **Browse**
  - **Your TV:** a release schedule for what you watch
- Discover lists support grid / list view and infinite scroll, and adding a title takes one tap.

### Lists, notes & comments

- **Lists:**
  - custom lists, ranked or unranked, with their own order and descriptions;
  - forkable;
  - **collaborative**, with invite links;
  - "In Lists" on every title.
- **Notes:**
  - notes of up to 500 words, with spoiler flags;
  - a Notes page with community notes, sortable by date watched;
  - reactions and replies.
- **Comments:** one shared comments popup with threaded replies and reactions.
- **Favourites & Lowlights** per title: favourite character, episode and season, and least favourite ones.

### Profiles

- **Your profile** (`profile.html`) has:
  - an overview dashboard;
  - tabs for library, notes, lists and episodes;
  - top picks and favourites per category.
- **Friend profiles** (`profile-view.html`) are read-only and show a **taste match**.
- **Public profiles** (`user.html?u=username`) work without logging in.
- **Settings:**
  - username (with a live availability check), display name, bio and quote;
  - avatar, theme and password;
  - language, a share-profile link, and deleting your account.

### Social hub (`friends.html`)

A side nav (a dropdown on phones) with:

- **Friends:** search people, requests, and friend cards with taste match. Best Match sort.
- **Activity:** what friends watched, with season / episode and episode names, plus their notes and lists.
- **Lists & Notes:** what your friends have been making.
- **Compare:** two libraries side by side, shared titles and a taste-match score.
- **Blend:**
  - pick up to 8 friends and see what you all want, what they loved and what you loved;
  - **Surprise us** picks one for a Movie Night;
  - **Start a Movie Night** builds a vote from the Blend.
- **Episode Chat:**
  - a friends-only, spoiler-safe thread for every episode;
  - it unlocks once your progress reaches that episode, and no rating is needed;
  - it shows which friends have watched it.
- **Movie Night:**
  - invite friends, add titles (from search, your shared watchlists or your Blend) and vote on big poster cards;
  - lock in the top pick or "Surprise us";
  - an optional date and time, with a reminder on the day;
  - **After the movie:** everyone's score, notes, favourites and lists, a group score, highlights, and a **Compare ratings** table.
- **Challenges:**
  - set a goal ("10 horror movies in October") with optional type and genre, and dates from the date-range picker;
  - invite up to 100 friends, who can invite theirs;
  - a live leaderboard, and medals for finishers.
- **Official challenges** (see below) appear in a **Featured** row at the top.
- **Polls:** ask friends with text or title options, plus comments.
- **Inbox:**
  - recommend titles, lists or "watched" moments to friends;
  - a two-way conversation with Sent / Seen badges, quick replies and automatic replies like "Added to watchlist".

### Official challenges, medals & spotlights

- **Official account** (`msf_official`):
  - only admins can make an account official;
  - it can keep a reserved username;
  - only it can create official challenges.
- **Official challenges:**
  - open to everyone, with your own description and medal;
  - count either a **set list** (only those titles count) or anything that fits a type / genre;
  - hidden until 7 days before they start, then "Coming soon" (people can join early), then Live until they end.
- **Medals** are drawn in code (`js/medals.js`):
  - **Friends' challenges:** a ribbon medal with the place on a plate. Gold for 1st, silver for 2nd, bronze for 3rd and after.
  - **Official challenges:** a scene inside a wreath with a star (Halloween, Arrakis, Doomsday Clock…). Everyone who finishes gets the same one.
  - Earlier finishers got their medals backdated.
  - **Achievements:** the emblem with the level's number on a plate — bronze, silver, gold, then green at the top. 12 of them (titles watched, episodes watched / rated, titles rated, hours, shows finished, anime, cartoons, genres, lists, notes, challenges), counted from what people already have.
- **Set lists** can mark titles "Already watched OK" — they count even if watched before the challenge (e.g. earlier films in a saga).
- **Details popup** on every challenge: how it works step by step, each title's status, the medal.
- **Achievement Cabinet** (`cabinet.html`, in the avatar menu): every medal, with progress to the next level; tabs All / Achievements / Official / Challenges. `cabinet.html?user=<id>` shows someone else's (earned only). New medals arrive as one notification — the first time, a single "your cabinet is open".
- **Spotlights** (`js/spotlights.js`):
  - a popup that advertises an official challenge;
  - shows every time the app is opened on the home page, until you join or it ends;
  - a darker colour set for light mode;
  - the official account can preview it.

### Notifications

- A bell with live updates (Supabase Realtime), plus a Notifications page.
- Covers friend requests and activity, list invites, comments and replies, new episodes and releases, polls, recommendations and replies, Episode Chat, Movie Night (invites, picks, reminders, reviews) and challenges (invites, finishers).
- Per-friend notification toggles.

### Admin & safety (`admin.html`)

- Admins only, set in `app_admins`.
- **Dashboard:** members, titles, and who's watching what.
- **Member pages:** stats, flags, ban / unban, delete, rename, and the "Make official" switch.
- **Word filter:**
  - offensive words are starred out in posts and blocked in usernames;
  - reserved names (`official`, `support`, `staff`, `myscreenscore…`) are blocked too;
  - admins can check, block and unblock words.
- **Flags & picture checks:** borderline avatar or poster uploads go to a review queue.
- **Language requests** from users.

### Site-wide

- **Languages:** English plus Arabic, Croatian, Chinese, French, German, Hindi, Italian, Japanese, Persian, Portuguese, Russian, Spanish, Turkish and Urdu (`js/lang/*.json`). Right-to-left is supported, and the language follows the account across devices.
- **Sort & Filter:** a shared system (`js/sort-filter.js`) on libraries, the profile, Completed and Discover lists.
- **Shared popups:** info, ratings, comments, notes, lists and dialogs. One module each, used everywhere.
- **Date pickers** (`js/date-range.js`):
  - a Starts / Ends range calendar (Challenges);
  - a Day + Time picker (Movie Night).
- **PDF export** with jsPDF: ranked list, completed list, profile overview and watch later, in dark or light themes.
- **Queue picker:** a random pick from your watchlist.
- **PWA:**
  - installable on iOS and Android, with an offline page;
  - the service worker uses stale-while-revalidate for the app and cache-first for posters and fonts;
  - Supabase is always network-only.
- **Accessibility:** labelled controls, focus styles, keyboard support in popups and pickers, and reduced-motion support.
- **Keyboard shortcuts:** `N` add, `/` search, `Esc` close.

---

## File structure

```
/
├── index.html            Home
├── tv-shows.html · movies.html · anime.html · cartoons.html   Libraries
├── library.html          Unified library
├── completed.html        Watched + rankings
├── detail.html           Edit an entry
├── title.html            Title page (TMDB)
├── person.html           Cast / crew page
├── episodes.html         Episode ratings, graphs
├── discover.html · discover-list.html   Discover + its lists
├── lists.html · list-view.html          Lists
├── notes.html            Notes
├── friends.html          Social hub
├── notifications.html    Notifications
├── cabinet.html          Achievement Cabinet
├── profile.html · profile-view.html · user.html   Your / a friend's / public profile
├── settings.html         Settings
├── admin.html            Admin dashboard
├── login.html · offline.html · 404.html
├── manifest.json · sw.js · icons/
├── css/style.css         The design system (numbered § sections)
├── js/
│   ├── config.js         Supabase, constants, icons, shared helpers, dialogs, cards
│   ├── db.js             Data layer
│   ├── nav.js            Nav, auth guard, search, notifications, add modal
│   ├── i18n.js · lang/   Translations
│   ├── category.js · library-view.js · dashboard.js · profile-tabs.js
│   ├── info-popup.js · rating-popup.js · comments.js · note-popup.js · list-popup.js
│   ├── sort-filter.js · date-range.js · create-card.js · rewatch.js · export.js
│   ├── discover-categories.js · browse.js · tv-schedule.js
│   ├── episode-ratings.js · episode-chat.js
│   ├── social.js         Polls + Inbox
│   ├── friend-popups.js · movie-night.js · challenges.js
│   ├── medals.js         Medals (SVG) — challenge, official, achievement
│   └── spotlights.js     Spotlight popups — every spotlight ever made lives here
└── sql/                  Numbered migrations 001 → 060 (+ 999 reference queries)
```

---

## Tech stack

- **Frontend:** vanilla HTML5, CSS3 and JavaScript (ES2020+). No framework, no build step.
- **Backend:** Supabase. PostgreSQL with RLS, plus Auth, Realtime and Storage (avatars). Logic lives in `SECURITY DEFINER` RPC functions.
- **Data:** TMDB (titles, people, episodes) and AniList (anime).
- **Images:** Cloudinary (posters).
- **PDF:** jsPDF.
- **Fonts:** Oswald, Bebas Neue and Manrope (Google Fonts).
- **Icons:** an inline SVG set in `config.js`.
- **Hosting:** GitHub Pages, or any static server.

---

## Setup

1. Create a Supabase project.
2. In the SQL Editor, run every file in `sql/` **in number order**, from `001` to `060`. Each file can be re-run safely and lists what it needs at the top. Skip `999`; it's reference queries only.
3. Add your Supabase URL and anon key in `js/config.js`, and your Cloudinary cloud name and unsigned preset in `js/db.js`.
4. Serve the folder, for example with `python3 -m http.server 8080`, and create an account.
5. Make yourself an admin:
   ```sql
   insert into app_admins (user_id) select id from profiles where username = 'you';
   ```

New tables must get explicit grants in the same migration that creates them. Supabase stops adding them automatically for new tables from Oct 30, 2026.

---

## Database (main tables)

- **Profiles & entries:**
  - `profiles`: username, name, bio, avatar, language, favourites, `is_official`
  - `entries`: every tracked title, with ratings, scores, progress, runtime, notes, TMDB link and dates
- **Lists, notes, comments & reactions:** `favorite_lists`, collaborators, reactions, `comments`, `note_replies`, `list_replies`
- **Episodes:** `episode_ratings`, season ratings and fan favourites
- **Friends & notifications:** `friendships`, `notifications` (Realtime)
- **Social:**
  - polls and recommendations, with their replies
  - `episode_chat`
  - `movie_nights` and their members / options / votes
  - `challenges`, `challenge_members`, `challenge_titles`
- **Medals:** `user_badges` (medals) and `spotlight_views`
- **Admin & safety:** `app_admins`, `blocked_words`, `moderation_flags`, `banned_users`, `picture_reviews`, plus language requests and rate limits

**Security:**
- Row Level Security is on everywhere.
- Most social data is reachable only through RPCs that check friendship or membership.
- Rate limits are applied to anything people post.

---

*Built by **Mohammad Rahimi** & **Narimaan Samani***

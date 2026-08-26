# MyScreenScore

Track everything you watch. MyScreenScore is a personal entertainment tracker for TV shows, movies, anime, and cartoons — with a detailed scoring system, watch progress, favorites, friends, and shareable public profiles. Built as an installable Progressive Web App with no framework and no build step.

**Stack:** Vanilla HTML/CSS/JS · Supabase (PostgreSQL + Auth) · TMDB & AniList API · Cloudinary (image hosting) · No build step · No framework

---

## Highlights

- Full-stack multi-user application
- Authentication and authorization with Supabase Auth
- PostgreSQL database with Row Level Security (RLS)
- Advanced rating and ranking system with 13 criteria
- Progress tracking for shows and episodic content
- Movie runtime tracking with cumulative watch time stats
- Ongoing series support (completed but still airing)
- Friends system with threaded comments and profile sharing
- Home page comment inbox with inline reply support
- User avatars with Supabase Storage
- Public user profiles
- PDF export for ranked list, completed list, profile overview, and watch later queue
- Progressive Web App (PWA) — installable on iOS and Android
- Cloudinary image hosting for posters (zero Supabase egress)
- Offline support via service worker
- Responsive mobile-first design
- Built entirely with Vanilla JavaScript

---

## What it is

MyScreenScore is a full-stack multi-user web application that allows users to build a personal entertainment archive for movies, TV shows, anime, and cartoons.

Users can track viewing progress, organize watchlists, create detailed ratings, rank completed titles, leave personal notes, interact with friends, and export their libraries to PDF. The platform combines personal tracking with lightweight social features while maintaining privacy controls through user-managed profile visibility and Supabase Row Level Security.

---

## Features

### Libraries & Tracking

Four separate libraries — **TV Shows**, **Movies**, **Anime**, and **Cartoons** — each with five status options:

| Status | Description |
|--------|-------------|
| Watch Later | Queued for future viewing |
| Currently Watching | In progress, with episode tracking |
| Taking a Break | Paused — shown in Watching with a visual indicator |
| Completed | Finished — triggers rating prompt and score calculation |
| Completed / Ongoing | Fully rated but still airing — shown in a dedicated Ongoing section |

Anime and Cartoon entries let you choose between **Movie** or **Show** type, which shows or hides episode/season fields accordingly. TV Shows and Movies can optionally enable an **Animation Quality** rating when the content is animated.

---

### Rating System

Every completed entry is rated across up to **13 criteria** using +/− steppers in 0.5 increments (0.0 → 10.0).

**Core Ratings (8)**
- Story & Plot · Character Development · Writing · Acting / Voice Acting
- Pacing & Consistency · Cinematography & Visuals · Ending & Payoff · Enjoyment

**Bonus Ratings (4, optional)**
- Music / Soundtrack · Emotional Impact · Atmosphere / Immersion · Tension

**Animation Quality (1, optional)**
- Available for TV Shows and Movies when content is animated — enabled via a toggle

**Score Formula**
```
Objective Score  =  average of all 8 core ratings
Final Score      =  (Objective Score × 70%) + (Enjoyment × 30%)
```

**Score Color Coding**

| Range | Color |
|-------|-------|
| 10.0 | Gold |
| 9.0 – 9.9 | Dark Green |
| 8.0 – 8.9 | Green |
| 7.0 – 7.9 | Light Green |
| 6.0 – 6.9 | Amber |
| 3.0 – 5.9 | Red |
| 0.0 – 2.9 | Purple |

---

### Entry Detail Page

Each entry has a full edit page with two columns:

- **Left:** Poster upload (via Cloudinary), title, category, type, status, year, genres, description, episode tracking (season / episode / totals), season breakdown, runtime (movies), notes, Favorites & Lowlights
- **Right:** All rating steppers (including optional Animation Quality toggle), live final score display with objective/personal breakdown bars, Save and Delete actions, and a Comments button (opens a dedicated modal with threaded comments)

Episode tracking auto-hides for Movies. Runtime (hours/minutes) is shown for movie-type entries. Season breakdown lets you log episodes per season with auto-calculated totals. Watch Later entries show season breakdown but hide current position.

**Favorites & Lowlights** — each entry supports optional personal highlights:
- Favorites: Favorite Character, Favorite Episode, Favorite Season
- Lowlights: Least Favorite Character, Least Favorite Episode, Least Favorite Season

These are displayed in the entry detail popup on category pages.

---

### Episode & Runtime Metadata

All entry cards display contextual metadata badges:

- **TV Shows / Anime Shows / Cartoon Shows** — displays total seasons and episodes (e.g. `4 Seasons · 142 Episodes`) across Queue, Completed, Latest Entries, and Friend View. Currently Watching shows current position (e.g. `S3 E7`)
- **Movies / Anime Movies / Cartoon Movies** — displays runtime (e.g. `2h 14m`) wherever available

Badges scale responsively on smaller screen sizes.

---

### Stats & Tracking

Each category page shows a live stats bar:

- **TV Shows / Anime / Cartoons** — Total, Watching, Ongoing, In Queue, Completed, Episodes watched
- **Movies** — Total, Watching, In Queue, Completed, Movie Watch Time

The Completed page shows additional stats responsive to the active category filter: Completed, Avg Score, Rated, Top Category, Episodes (shows only), Movie Watch Time (movies only).

---

### Completed & Rankings

The Completed page shows all finished entries in two modes:

- **Recently Completed** — sorted by completion date
- **Ranked** — sorted by Final Score

Also includes a dedicated **Ongoing** section for entries marked as Completed / Ongoing. Filterable by category (All / TV Shows / Movies / Anime / Cartoons). Stats update live when a filter is applied. Each entry displays a color-coded score badge and episode/runtime metadata in both grid and list views.

---

### Friends

- Send friend requests by username
- Accept, decline, or cancel requests
- Unfriend at any time
- A pending badge in the nav shows incoming request count
- View any accepted friend's full lists (Currently Watching, Watch Later, Completed/Ranked, Ongoing)
- Comment on a friend's entries directly from their list view or from the entry detail page
- Friend comments appear in your home page inbox
- All access is protected by Supabase Row Level Security — friends only see what they're supposed to

---

### Comments

Comments exist in two contexts:

- **Detail page** — a Comments button opens a dedicated modal with the full threaded comment list, post input, reply support, and delete for your own comments
- **Category / friend view** — a Comments strip on each card popup lets you read and post without leaving the page

**Home page inbox** — a collapsible section on the home page shows recent comments left by friends on your entries. Clicking a comment opens an inline modal with the full thread and reply support, without navigating away from the home page.

Comments support **threaded replies** — any top-level comment can be replied to, with replies displayed indented below their parent. Comments are capped at 500 characters and protected by RLS — only the entry owner, comment author, and accepted friends can read them.

---

### User Avatars

Users can upload a profile avatar from the Profile page. Avatars are stored in Supabase Storage and displayed across the app — in the nav bar, friend lists, and comment threads.

---

### Public Profile

Each user can toggle their profile public or private. When public, a shareable read-only page is available at:

```
/user.html?u=username
```

This page shows their ranked list, recently completed entries, and stats — no login required to view.

---

### PDF Export

Four export types available from the Profile page (and Completed page for the first two):

- **Ranked List** — all completed entries sorted by final score
- **Completed List** — full watch history in chronological order
- **Profile Overview** — stats, highlights, and top-ranked titles
- **Watch Later** — full watchlist queue with category breakdown stats

Each PDF has a choice of **Dark** or **Light** theme, a full-bleed background, and the MyScreenScore logo as a header. Generated entirely client-side with jsPDF (pure vector — no html2canvas).

---

### Queue Picker

Not sure what to watch next?

The Queue Picker randomly selects an entry from your Watch Later list and presents it through a focused recommendation modal. Users can reshuffle selections, rediscover forgotten entries, and quickly choose their next movie, show, anime, or cartoon without scrolling through large queues.

---

### Image Hosting (Cloudinary)

Poster images are uploaded directly from the browser to Cloudinary and served via CDN — no image data is stored in Supabase. This keeps database egress near zero and ensures fast poster loading globally.

- Images are auto-compressed before upload (converted to JPEG, max 800px wide)
- Served at 500px wide with `q_auto` and `f_auto` for optimal delivery
- Cloudinary free tier: 25 GB storage · 25 GB bandwidth/month

---

### Progressive Web App (PWA)

MyScreenScore is installable as a native-feeling app on any device:

- **iOS** — Safari → Share → Add to Home Screen
- **Android** — Chrome shows an automatic Install prompt

Once installed it opens full screen with no browser bar. A service worker handles:

| Asset | Strategy |
|-------|----------|
| HTML / CSS / JS | Stale-while-revalidate (instant load + background update) |
| Cloudinary posters | Cache first (loads from device after first view) |
| Google Fonts | Cache first |
| Supabase API | Network only (always fresh data) |

An offline page is shown when there is no internet connection.

---

### Responsive Design

MyScreenScore follows a mobile-first responsive design approach and is optimized for:

- Phones (including iPhone SE)
- Tablets (iPad)
- Laptops
- Desktops
- Large displays

**Mobile navigation** — hamburger menu on the top bar opens a slide-out drawer. Bottom tab bar covers the main pages. A floating action button (FAB) opens the Add modal. The top bar has no separator line to keep it clean.

Layouts automatically adapt between list and grid views while maintaining feature parity and usability across all supported screen sizes.

---

### Search

Global real-time search across all your entries by title and description. Accessible from the nav bar (`/` shortcut) or the home page hero search. Results show category label and genre tags.

---

### Navigation

**Desktop** — dual-row nav with logo on top, links and controls below. Includes search bar, Add button, and user menu with avatar, profile, and sign out.

**Mobile** — logo + hamburger on top row, bottom tab bar for main pages (Home / TV / Movies / Anime / Cartoons), slide-out drawer for full nav. A floating action button (FAB) opens the Add modal.

---

### Theme

Dark and light mode, toggled from a pill switch in the bottom-right corner. The preference is saved to `localStorage`.

| | Dark | Light |
|-|------|-------|
| Background | `#0A0A0E` near-black | `#E2DAD0` warm cream |
| Card | `rgba(255,255,255,0.058)` | `#F3EDE4` off-white |
| Accent | `#7EB86C` olive green | `#1E5C26` forest green |
| Text | `#EDEDED` | `#1A1A1A` |

---

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | Open Add Entry modal |
| `/` | Focus search bar |
| `Esc` | Close any open modal or overlay |

---

## File Structure

```
/
├── index.html                              — Home dashboard
├── tv-shows.html                           — TV Shows library
├── movies.html                             — Movies library
├── anime.html                              — Anime library
├── cartoons.html                           — Cartoons library
├── detail.html                             — Entry detail / edit
├── completed.html                          — Completed list + rankings
├── friends.html                            — Friends management
├── friend-view.html                        — View a friend's lists
├── profile.html                            — Settings, avatar, public toggle, PDF export
├── user.html                               — Public profile (no auth required)
├── search.html                             — Search results
├── login.html                              — Sign in / Create account
├── offline.html                            — Offline fallback page (PWA)
├── manifest.json                           — PWA manifest
├── sw.js                                   — Service worker (caching + offline)
├── icons/                                  — PWA icons (72 → 512px)
├── css/
│   └── style.css                           — Full design system
├── js/
│   ├── config.js                           — Supabase init, constants, icons, utilities
│   ├── db.js                               — Data layer (all Supabase queries)
│   ├── nav.js                              — Nav injection, auth guard, modals
│   ├── category.js                         — Category page logic (all sections)
│   └── export.js                           — PDF export (pure jsPDF)
└── sql/
    ├── supabase-schema.sql                 — Core schema (run first)
    ├── friends-feature.sql                 — Friendships table + RLS policies
    ├── comments.sql                        — Comments table + RLS policies
    ├── user-avatar.sql                     — Avatar column + avatars storage bucket
    ├── restrict-entry-value-status.sql     — Adds 'paused' and 'ongoing' to status constraint
    ├── security-fixes.sql                  — Hardens trigger functions + revokes
    └── authenticated-read-policy.sql       — Allows username lookup for friend requests
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla HTML5, CSS3, JavaScript (ES2020+) |
| Database | Supabase — PostgreSQL |
| Auth | Supabase Auth |
| Image Hosting | Cloudinary (poster uploads + CDN delivery) |
| Storage | Supabase Storage (avatars) |
| PWA | Service Worker + Web App Manifest |
| PDF | jsPDF 2.5.1 (pure vector, client-side) |
| Icons | Lucide (inline SVG) |
| Fonts | Cormorant Garamond, Inter — Google Fonts |
| Hosting | GitHub Pages (or any static file server) |

---

## Setup

**1. Create a Supabase project** at [supabase.com](https://supabase.com) (free tier is fine).

**2. Run the SQL files** in this order in the Supabase SQL Editor:

| Order | File | What it does |
|-------|------|--------------|
| 1 | `supabase-schema.sql` | Core tables, RLS, triggers |
| 2 | `friends-feature.sql` | Friendships table + friend RLS |
| 3 | `comments.sql` | Comments table + comment RLS |
| 4 | `user-avatar.sql` | Avatar column + avatars storage bucket |
| 5 | `restrict-entry-value-status.sql` | Adds `paused` and `ongoing` to status enum |
| 6 | `security-fixes.sql` | Hardens trigger functions |
| 7 | `authenticated-read-policy.sql` | Allows username lookup for friend requests |

**3. Add runtime columns** to your entries table:

```sql
ALTER TABLE entries
ADD COLUMN IF NOT EXISTS runtime_h integer,
ADD COLUMN IF NOT EXISTS runtime_m integer;
```

**4. Create a Cloudinary account** at [cloudinary.com](https://cloudinary.com) (free tier).

- Go to Settings → Upload → Add upload preset
- Set signing mode to **Unsigned**
- Note your **Cloud Name** and **Upload Preset name**

**5. Add your credentials** to `js/config.js`:

```js
const SUPABASE_URL      = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

And in `js/db.js`, update `uploadPoster()` with your Cloudinary details:

```js
formData.append('upload_preset', 'YOUR_PRESET_NAME');
// fetch URL: https://api.cloudinary.com/v1_1/YOUR_CLOUD_NAME/image/upload
```

**6. Serve locally:**

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` and create an account.

---

## Database

**Tables**
- `profiles` — username, display name, bio, avatar URL, public toggle
- `entries` — all tracked titles with ratings, scores, genres, poster URL, episode data, runtime, favorites, lowlights
- `friendships` — friend requests and accepted connections
- `comments` — per-entry comments with reply threading, capped at 500 characters, linked to author profiles

**Security**
Row Level Security is enabled on all tables. Users can only access their own data. Friends get read access to each other's entries, profiles, and comments. Public profiles are readable by anyone. Trigger functions are `SECURITY DEFINER` with a fixed `search_path` and have execute permissions revoked from all roles.

**Triggers**
- `handle_new_user()` — creates a profile row on signup, sanitizes and de-duplicates the username
- `set_updated_at()` — keeps `updated_at` current on entries and profiles

---

*Built by **Nasrawi04** · Half credit to **N1 - Narimaan***

# Secret Santa

Secret Santa is a web application built with NestJS that allows users to participate in a Secret Santa gift exchange.
This project uses a PostgreSQL database and supports Docker for containerization.

## Groups

Several Secret Santa groups (e.g. a family and an office) can run at the same time. Each group (`santa_group`) has
its own participants, families, draw, dossiers, settings (incl. the letter on `/kiri`), analytics, activity log and
maze leaderboard. Santa's voice lines and the agency facts are shared by every group.

- **Participants** never see a group in the URL: a personal link belongs to one participant in one group, and so
  does a session. The same person can take part in several groups, with one participant row per group (names and
  e-mails are unique within a group). After a Google sign-in, someone in several groups picks one on `/grupp` and can
  switch later ("Vaheta gruppi"). Switching relies on the verified e-mail of that Google sign-in
  (`santa_identity` cookie), so a forwarded personal link never reaches the owner's other groups.
- **Disabling a group** (group Settings, "Group is enabled") leaves it out of the selection: it is not offered on
  `/grupp` or in the header switch, and Google sign-in never opens it. Personal links of its participants keep
  working, and its admins can still manage it.
- **Group admins** are the participants marked as admin in a group. They manage only their own groups; the panel's
  group picker switches between them.
- **The super admin** (`ADMIN_EMAIL`) manages every group, creates, renames and deletes groups (only empty ones) on
  the **Groups** page, and is the only one who edits the shared agency facts and Santa audio (ElevenLabs costs money).

- **Sign-up link**: an admin can open sign-up for a group (Participants, "Sign-up link") and share its secret link,
  `/liitu/<code>`. Anyone with it adds themselves to that group with their name and e-mail, and picks their family,
  creates a new one (unless the admin turned that off) or picks none. Names and e-mails stay unique within the group.
  Sign-up does not sign anyone in or grant admin access: personal links come from the draw, as for everyone else, and
  Google sign-in works with the e-mail given. It pauses by itself while the group has been drawn, so nobody joins after
  the names are drawn. "New link" replaces the code, so the old link stops working. Sign-ups and families created by
  them show in the activity log under the person's own name.

A database from before groups existed is moved into a single group called "Secret Santa" on the first start, with
the old settings; links already sent keep working. See `src/database/group-migration.ts`.

## Admin panel

The admin panel lives at `/admin`. Sign in with a Google account that is an admin of at least one group (or is
`ADMIN_EMAIL`). Admin access uses its own signed, httpOnly `santa_admin` cookie (7 days) holding the e-mail address
Google verified, issued only by a Google sign-in, so a participant's personal link never grants admin access. Which
groups it may manage is re-read from the database on every request. Every page works on the group chosen in the
sidebar. The panel is a small single-page app in
`public/admin-assets/` with no build step; its JSON API is `/api/admin/*` (`src/admin/`).

- **Overview**: season checklist, mission progress, dossier completeness, recent activity.
- **Participants**: searchable table, profile and dossier editing (codename, brief, facts, photo, audio), per-person activity, CSV export, and the group's sign-up link.
- **Families**: groups that never give to each other, with member assignment.
- **Dossiers**: completeness of every dossier at a glance.
- **Agency facts**: the made-up "Agentuuri andmed" lines, edited directly in the table (Enter saves and moves down, Escape undoes), with bulk paste, on/off switches and who sees each one.
- **Santa audio**: edit Santa's lines and generate the clips with ElevenLabs, with progress and per-participant previews.
- **Draw & links**: feasibility check, run/clear the draw, validation without revealing pairs, personal links, "start new season" (saves this year's recipients as last year's).
  A latecomer added after the draw can be added to it on their participant page ("Add to draw") without redrawing:
  one Santa gives to them instead and they take over that Santa's old recipient, under the same family and last-year
  rules. Nobody else changes and every existing link keeps working. "Automatic" picks someone who has not opened their
  mission yet and keeps the pair hidden from the admin. Until someone is in a draw, the home page tells them
  "Vara veel, jõuluvana alles mõtleb."
- **Analytics**: visitors, missions opened, Santa listen-through, funnel, devices, browsers, time of day, per-participant engagement.
- **Activity log**: every admin change and every recorded site event.
- **Settings**: open/close missions, closed message, exchange date, budget, letter link, organiser notes.
- **Groups** (super admin): create groups with their first admin, rename, delete empty ones.

Each Santa's recipient is stored in `user.giftingTo` as base64, not encrypted, only so names are not readable
at a glance in query results; it is always resolved within the Santa's own group. `decryptionCode` is the random code
in the participant's personal link, unique across all groups. Rows drawn
in the older AES format are converted to base64 on startup, keeping their codes, so links already sent keep working.

Agency facts are stored in `agency_fact` and seeded once with the original list. Each dossier shows a few active
ones (Settings, default 3), spread over the group on the server: every fact is used once before any is used twice, and
the combinations overlap as little as possible. Participants are handled oldest first, so a person keeps the same facts
while the list and the count are unchanged, and someone who joins later does not change anyone else's facts.

Site events are stored in `analytics_event` (no IP addresses), admin changes in `audit_log`, both with the group
they belong to (visitors who are not signed in have none). Each group's settings are in `santa_group.settings`.
Reports use the `ADMIN_TIME_ZONE` time zone (default `Europe/Tallinn`).

## Reveal flow and dossiers (2026)

When a participant opens their link, the page first asks them to make sure their device sound works.
After they accept the mission, Santa's pre-generated audio clip plays and a "classified file" slides in
showing the recipient's name, photo, codename, mission brief and known facts.

Each dossier belongs to the recipient (the person whose name is revealed) and is edited on the
participant's page in the admin panel: codename, mission brief, a photo (JPEG, PNG, GIF, WebP, AVIF, HEIC) and an
audio clip (MP3, OGG, WAV, FLAC, WebM, M4A), up to 20 MB each. The file type is detected from the content, not
trusted from the browser. Facts come from the user's existing "Facts" field, one per line. Assets are stored
in the `dossier` database table and served only to the recipient's Santa.

### Santa's voice clips

Santa's briefing is assembled from three clips: an intro, a line that says the recipient's name, and an
outro. Texts and clips are managed on the admin **Santa audio** page: add, edit, reorder and delete lines, then
generate the missing or out-of-date clips with ElevenLabs (`ELEVENLABS_*` variables in the server environment).
Generation runs in the background with progress; the page shows how many characters will be billed first.
Texts and audio are stored in the database (`santa_line`, `santa_clip`) and served from `/santa-audio`, so they
survive redeploys. A clip goes out of date when its text changes or the participant is renamed, and only
up-to-date clips are played.

On first start the texts are seeded from `scripts/santa-audio/lines.json`. `yarn santa-audio` still works as an
offline alternative: mp3s it writes to `scripts/santa-audio/clips/` are imported into the database on the next start
when that slot has no clip or an older one. That folder is not served; every clip, including name clips, is only
reachable through the signed, unguessable URL the app hands out (`/santa-audio/<id>.<time>.<signature>.mp3`).

The browser rotates through the clips: a counter in `localStorage` advances on every accepted mission, so
refreshing the page gives a different intro, name-line variant and outro. A hand-uploaded clip in the
dossier (admin page) is still played when a participant has no generated name clip.

## Source code

Source code is available in [Github - https://github.com/jaansusi/secretsanta](https://github.com/jaansusi/secretsanta)

## Security

See [docs/SECURITY-AUDIT.md](docs/SECURITY-AUDIT.md) for the latest audit, what was fixed and the known
residual risks. In short:

- Participant sessions (`santa_session`) and admin sessions (`santa_admin`) are signed, `HttpOnly`,
  `SameSite=Lax` cookies (`Secure` when `HOST` is https) with server-enforced expiry. The app refuses to start in
  production without a random `COOKIE_SECRET` of at least 32 characters.
- State-changing requests must come from the app's own origin. Signing out is a POST.
- A strict Content-Security-Policy allows no inline script. Front-end libraries are served from npm packages
  under `/vendor`, not from a CDN.
- Decryption codes are kept out of logs and URLs (a `?code=` link is exchanged for a session and redirected).

## Run in development mode

Requires Node.js 24.9 or newer (Node 26 LTS is what the Docker image and CI use). NestJS 12 is ESM-only and
Jest can only load it on Node >= 24.9.

1. Install the dependencies:
    ```sh
    yarn
    ```

2. Create a `.env` file based on the `.env.template` and fill in the required environment variables.

3. Run application in watch mode
    ```sh
    yarn start:dev
    ```

4. Navigate to [http://localhost:3000](http://localhost:3000)

## Running the Application in production mode

### Deployment (santa.susid.ee)

Production runs on the home-infra k3s cluster, reconciled by Argo CD from
`apps/secretsanta/` in the home-infra repo (runbook: `apps/secretsanta/README.md` there).
Every push to `master` builds `ghcr.io/jaansusi/secretsanta:<YYYYMMDD>-<short sha>`; the tag
is shown at the top of the build run. Building does not deploy: set the new tag in
`apps/secretsanta/deployment.yaml` and push home-infra.

### Using Docker

1. Build and run the database Docker container
    ```sh
    yarn infra:up
    ```

2. Build and run the main Docker container:
    ```sh
    docker-compose up -d
    ```

3. The application will be available at [http://localhost](http://localhost)

### Without Docker


1. Install the dependencies:
    ```sh
    yarn
    ```

2. Build the project:
    ```sh
    yarn build
    ```

2. Start the application:
    ```sh
    yarn start:prod
    ```

3. The application will be available at [http://localhost:3000](http://localhost:3000)

## Environment Variables

The following environment variables are required:

- `NODE_ENV`: The environment in which the application is running (e.g., `development`, `production`).
- `PORT`: The port on which the application will run (inside the container, if applicable).
- `HOST`: The absolute public URL including the port when it is not 80/443 (e.g. `https://santa.example.com`).
  Used for the Google auth callback, personal links and the same-origin check on POST/PUT/PATCH/DELETE requests.
  With `https` the cookies get the `Secure` flag and HSTS is sent.
- `GOOGLE_CLIENT_ID`: Google OAuth Client ID.
- `GOOGLE_CLIENT_SECRET`: Google OAuth Client Secret.
- `COOKIE_SECRET`: Signs the session cookies. At least 32 random characters (`openssl rand -base64 48`).
  Rotating it signs everyone out.
- `ADMIN_EMAIL`: Google account (verified email) of the super admin, who manages every group.

Optional:

- `ADMIN_TIME_ZONE`: Time zone for analytics days and hours, default `Europe/Tallinn`.
- `TRUST_PROXY`: Number of reverse proxies in front of the app (e.g. `1` behind an ingress). Needed for per-client
  rate limiting.
- `LOG_LEVEL`: `error`, `warn`, `info` or `debug` (default `info` in production).
- `DB_SSL` / `DB_SSL_CA`: `true` to require a verified TLS connection to Postgres; PEM CA for a private CA.
- `DB_LOGGING`: `true` logs every SQL statement. Local debugging only, since statements contain decryption codes.
- `STORE_DEBUG_ASSIGNMENTS`: `true` (with `NODE_ENV=development`) stores a plaintext copy of each assignment.
- `GOOGLE_DOC_LETTER_LINK`: https URL of the letter on `/kiri`, for visitors who are not signed in and for groups
  that have not set their own (admin settings, https only).

## Scripts

    build: Builds the project.
    format: Formats the code using Prettier.
    start: Starts the application.
    start:dev: Starts the application in development mode with hot-reloading.
    start:debug: Starts the application in debug mode.
    start:prod: Starts the application in production mode (note: run build first).
    lint: Lints the code using ESLint.
    test: Runs the tests.
    test:watch: Runs the tests in watch mode.
    test:debug: Runs the tests in debug mode.
    test:e2e: Runs end-to-end tests.

## License
This project is licensed under the UNLICENSED License.

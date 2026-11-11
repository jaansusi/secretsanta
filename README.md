# Secret Santa

Secret Santa is a web application built with NestJS that allows users to participate in a Secret Santa gift exchange.
This project uses a PostgreSQL database and supports Docker for containerization.

## Admin panel

The admin panel lives at `/admin`. Sign in with a Google account whose participant has admin access
(the `ADMIN_EMAIL` account is made admin automatically). Admin access uses its own signed, httpOnly
`santa_admin` cookie (7 days), issued only by a Google sign-in, so a participant's personal link never grants
admin access. The panel is a small single-page app in
`public/admin-assets/` with no build step; its JSON API is `/api/admin/*` (`src/admin/`).

- **Overview**: season checklist, mission progress, dossier completeness, recent activity.
- **Participants**: searchable table, profile and dossier editing (codename, brief, facts, photo, audio), per-person activity, CSV export.
- **Families**: groups that never give to each other, with member assignment.
- **Dossiers**: completeness of every dossier at a glance.
- **Agency facts**: the made-up "Agentuuri andmed" lines, edited directly in the table (Enter saves and moves down, Escape undoes), with bulk paste, on/off switches and who sees each one.
- **Santa audio**: edit Santa's lines and generate the clips with ElevenLabs, with progress and per-participant previews.
- **Draw & links**: feasibility check, run/clear the draw, validation without revealing pairs, personal links, "start new season" (saves this year's recipients as last year's).
- **Analytics**: visitors, missions opened, Santa listen-through, funnel, devices, browsers, time of day, per-participant engagement.
- **Activity log**: every admin change and every recorded site event.
- **Settings**: open/close missions, closed message, exchange date, budget, letter link, organiser notes.

Each Santa's recipient is stored in `user.giftingTo` as base64, not encrypted, only so names are not readable
at a glance in query results. `decryptionCode` is the random code in the participant's personal link. Rows drawn
in the older AES format are converted to base64 on startup, keeping their codes, so links already sent keep working.

Agency facts are stored in `agency_fact` and seeded once with the original list. Each dossier shows a few active
ones (Settings, default 3), picked on the server from the recipient's name, so a person keeps the same facts while
the list is unchanged.

Site events are stored in `analytics_event` (no IP addresses), admin changes in `audit_log`, settings in `setting`.
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
- `ADMIN_EMAIL`: Google account (verified email) that is always made an admin.

Optional:

- `ADMIN_TIME_ZONE`: Time zone for analytics days and hours, default `Europe/Tallinn`.
- `TRUST_PROXY`: Number of reverse proxies in front of the app (e.g. `1` behind an ingress). Needed for per-client
  rate limiting.
- `LOG_LEVEL`: `error`, `warn`, `info` or `debug` (default `info` in production).
- `DB_SSL` / `DB_SSL_CA`: `true` to require a verified TLS connection to Postgres; PEM CA for a private CA.
- `DB_LOGGING`: `true` logs every SQL statement. Local debugging only, since statements contain decryption codes.
- `STORE_DEBUG_ASSIGNMENTS`: `true` (with `NODE_ENV=development`) stores a plaintext copy of each assignment.
- `GOOGLE_DOC_LETTER_LINK`: https URL of the letter on `/kiri` (overridable in admin settings, https only).

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

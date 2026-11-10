# Secret Santa

Secret Santa is a web application built with NestJS that allows users to participate in a Secret Santa gift exchange.
This project uses a PostgreSQL database and supports Docker for containerization.

## Admin panel

The admin panel lives at `/admin`. Sign in with a Google account whose participant has admin access
(the `ADMIN_EMAIL` account is made admin automatically). Admin access uses its own signed, httpOnly
`santa_admin` cookie, so `COOKIE_SECRET` must be set. The panel is a small single-page app in
`public/admin-assets/` with no build step; its JSON API is `/api/admin/*` (`src/admin/`).

- **Overview**: season checklist, mission progress, dossier completeness, recent activity.
- **Participants**: searchable table, profile and dossier editing (codename, brief, facts, photo, audio), per-person activity, CSV export.
- **Families**: groups that never give to each other, with member assignment.
- **Dossiers**: completeness of every dossier at a glance.
- **Santa audio**: edit Santa's lines and generate the clips with ElevenLabs, with progress and per-participant previews.
- **Draw & links**: feasibility check, run/clear the draw, validation without revealing pairs, personal links, "start new season" (saves this year's recipients as last year's).
- **Analytics**: visitors, missions opened, Santa listen-through, funnel, devices, browsers, time of day, per-participant engagement.
- **Activity log**: every admin change and every recorded site event.
- **Settings**: open/close missions, closed message, exchange date, budget, letter link, organiser notes.

Each Santa's recipient is stored in `user.giftingTo` as base64, not encrypted, only so names are not readable
at a glance in query results. `decryptionCode` is the random code in the participant's personal link. Rows drawn
in the older AES format are converted to base64 on startup, keeping their codes, so links already sent keep working.

Site events are stored in `analytics_event` (no IP addresses), admin changes in `audit_log`, settings in `setting`.
Reports use the `ADMIN_TIME_ZONE` time zone (default `Europe/Tallinn`).

## Reveal flow and dossiers (2026)

When a participant opens their link, the page first asks them to make sure their device sound works.
After they accept the mission, Santa's pre-generated audio clip plays and a "classified file" slides in
showing the recipient's name, photo, codename, mission brief and known facts.

Each dossier belongs to the recipient (the person whose name is revealed) and is edited on the
participant's page in the admin panel: codename, mission brief, a photo and an audio clip (any `image/*` and `audio/*`,
up to 20 MB each). Facts come from the user's existing "Facts" field, one per line. Assets are stored
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
offline alternative: mp3s it writes to `public/audio/santa/` are imported into the database on the next start
when that slot has no clip or an older one.

The browser rotates through the clips: a counter in `localStorage` advances on every accepted mission, so
refreshing the page gives a different intro, name-line variant and outro. A hand-uploaded clip in the
dossier (admin page) is still played when a participant has no generated name clip.

## Source code

Source code is available in [Github - https://github.com/jaansusi/secretsanta](https://github.com/jaansusi/secretsanta)

## Run in development mode

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
- `HOST`: The host address, used for Google auth callback.
- `GOOGLE_CLIENT_ID`: Google OAuth Client ID.
- `GOOGLE_CLIENT_SECRET`: Google OAuth Client Secret.
- `COOKIE_SECRET`: Secret key for signing cookies. Required for admin sign-in.
- `ADMIN_EMAIL`: Google account that is always made an admin.
- `ADMIN_TIME_ZONE` (optional): Time zone for analytics days and hours, default `Europe/Tallinn`.

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

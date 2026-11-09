# Secret Santa

Secret Santa is a web application built with NestJS that allows users to participate in a Secret Santa gift exchange.
This project uses a PostgreSQL database and supports Docker for containerization.

## User management

.env file defines an e-mail that will always authenticate as an administrator.

Administrators have access to Users and Families pages to manage participants.

## Reveal flow and dossiers (2026)

When a participant opens their link, the page first asks them to make sure their device sound works.
After they accept the mission, Santa's pre-generated audio clip plays and a "classified file" slides in
showing the recipient's name, photo, codename, mission brief and known facts.

Each dossier belongs to the recipient (the person whose name is revealed) and is edited on the
admin Users page: codename, mission brief, a photo and an audio clip (any `image/*` and `audio/*`,
up to 20 MB each). Facts come from the user's existing "Facts" field, one per line. Assets are stored
in the `dossier` database table and served only to the recipient's Santa.

### Generating Santa's voice clips

Santa's briefing is assembled from three clips: an intro, a line that says the recipient's name, and an
outro. The texts live in `scripts/santa-audio/lines.json`; `yarn santa-audio` sends them to the ElevenLabs
API (`ELEVENLABS_*` variables in `.env`, participant names from the `user` table) and writes the mp3s to
`public/audio/santa/`, which is committed and served statically. `scripts/santa-audio/manifest.json` records
the text behind each clip, so lines that did not change are skipped on the next run. Useful flags:
`--dry-run` (print without calling the API), `--only intros,outros,names`, `--names "Mari,Jaan"`, `--force`.

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
- `COOKIE_SECRET`: Secret key for signing cookies.

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

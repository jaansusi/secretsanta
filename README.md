# Secret Santa

Secret Santa is a web application built with NestJS that allows users to participate in a Secret Santa gift exchange.
This project uses a SQLite database and supports Docker for containerization.

## User management

.env file defines an e-mail that will always authenticate as an administrator.

Administrators have access to Users and Families pages to manage participants.

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

3. Build and run the CDOC utility with Docker:
    ```sh
    yarn cdoc:up
    ```

4. The application will be available at [http://localhost](http://localhost)

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

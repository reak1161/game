# Architecture Overview

## Project Structure

The project is organized into several key directories, each serving a specific purpose:

- **src/**: Contains the source code for both the client and server components of the application.
  - **client/**: This directory holds the React application, including components, hooks, pages, and styles.
  - **server/**: This directory contains the Express server setup, API routes, game logic, and WebSocket management.
  - **shared/**: This directory includes shared types and utility functions used across both client and server.

- **tests/**: Contains test files for both client and server components, ensuring the functionality and reliability of the application.

- **docs/**: This directory includes documentation files, such as architecture and requirements, to provide insights into the project structure and specifications.

- **scripts/**: Contains scripts for tasks like seeding initial data into the database.

- **config/**: Holds configuration files for tools like Jest and ESLint.

## Client Architecture

The client-side of the application is built using React. The main entry point is `main.tsx`, which renders the `App` component. The application is structured to separate concerns:

- **Components**: Reusable UI components are organized in the `components` directory.
- **Hooks**: Custom hooks, such as `useGameClient`, manage state and API interactions.
- **Pages**: Different views of the application, like the `Lobby`, are defined in the `pages` directory.
- **Styles**: Global styles are defined in `global.css`.

## Server Architecture

The server-side is built using Express and handles API requests and WebSocket connections:

- **Entry Point**: The server starts from `index.ts`, setting up middleware and routes.
- **API Routes**: The `api` directory contains route definitions, such as `matchRoutes.ts`, which manage game-related requests.
- **Game Logic**: The `game` directory implements the core game engine and rules.
- **WebSocket Management**: The `sockets` directory manages real-time communication for the lobby.

## Shared Architecture

The `shared` directory contains common types and utility functions that facilitate communication between the client and server, ensuring type safety and code reusability.

## Conclusion

This architecture provides a modular and scalable structure for developing an online multiplayer board game, allowing for easy maintenance and future enhancements.
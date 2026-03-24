# Half Paper 📓

A personal diary web application for students. Write and organise your daily thoughts, track your mood, and reflect on your experiences.

## Features

- **User accounts** – register and log in securely (passwords hashed with bcrypt)
- **Diary entries** – create, read, edit and delete entries
- **Mood tracker** – tag each entry with an emoji mood (happy, excited, grateful, neutral, anxious, sad)
- **Persistent sessions** – stay logged in across browser restarts
- **Responsive UI** – works on desktop and mobile

## Tech Stack

| Layer    | Technology |
|----------|------------|
| Server   | Node.js + Express |
| Database | SQLite (via better-sqlite3) |
| Sessions | express-session + connect-sqlite3 |
| Auth     | bcryptjs |
| Frontend | Vanilla HTML / CSS / JS |

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm

### Installation

```bash
npm install
```

### Running the app

```bash
npm start
```

Open your browser at **http://localhost:3000**

## Project Structure

```
half-paper/
├── server.js        # Express server & REST API
├── db.js            # SQLite database setup
├── public/
│   ├── index.html   # Login / register page
│   ├── diary.html   # Main diary page
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── diary.js
└── package.json
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/register` | Create a new account |
| POST | `/api/login` | Log in |
| POST | `/api/logout` | Log out |
| GET  | `/api/me` | Current user info |
| GET  | `/api/entries` | List all entries (auth required) |
| GET  | `/api/entries/:id` | Get a single entry |
| POST | `/api/entries` | Create an entry |
| PUT  | `/api/entries/:id` | Update an entry |
| DELETE | `/api/entries/:id` | Delete an entry |

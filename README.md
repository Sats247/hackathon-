<div align="center">
 
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72" fill="none">
  <rect width="72" height="72" rx="16" fill="#1A56DB"/>
  <path d="M36 14C26.06 14 18 22.06 18 32c0 13 18 26 18 26s18-13 18-26c0-9.94-8.06-18-18-18zm0 24a6 6 0 1 1 0-12 6 6 0 0 1 0 12z" fill="white"/>
</svg>
 
# Civicity
 
**Bangalore Civic Issue Reporting Portal**
 
A mobile-first platform for citizens to report infrastructure problems, for government workers to manage resolutions, and for coordinators to oversee the full pipeline — built for the Megahackathon 2026.
 
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.0-000000?logo=flask&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-2.5_Flash-4285F4?logo=google&logoColor=white)
 
</div>
 
---
 
## Features
 
**Civilian Reporting** — Any citizen can file a report without an account. The multi-step form captures a photo, GPS coordinates (or a manual address), category (Pothole, Streetlight, Garbage, Sewage, Other), title, and description. Reports are tied to the device by a browser-generated SHA-256 fingerprint rather than a login credential, keeping the barrier to participation as low as possible.
 
**AI Image Validation** — Before a report is accepted, the uploaded photo is sent to Google Gemini 2.5 Flash with a civic-intent classification prompt. Selfies, memes, blank images, and AI-generated photos are rejected with an in-form error message. If no API key is configured, the validator fails open so the system remains functional without external credentials.
 
**Duplicate Detection** — On submission the server checks for an existing open report of the same category within 20 metres of the submitted coordinates, submitted in the last 48 hours. A duplicate match surfaces the existing report to the citizen rather than creating a redundant entry.
 
**Community Upvoting with Civic Energy** — Citizens can upvote any open report to signal urgency. Each device is allocated 10 upvotes per day (the "civic energy" pool), resetting at midnight. Votes are deduplicated per device per report. The energy balance is shown in-app so citizens know their remaining weight.
 
**Public Feed** — All reports are visible on a Leaflet map and in a card list, filterable by category and status, sortable by newest, most upvoted, or by traffic-light status. Each report card shows the before photo, upvote count, category badge, current status, and assigned worker name when one has been assigned.
 
**Traffic-Light Status System** — Reports move through three states: red (filed, unresolved), yellow (assigned to a worker, in progress), and green (resolved, after photo uploaded). The colour coding is consistent across the map pins, card badges, and the coordinator table.
 
**Coordinator Dashboard** — The coordinator account has a full management view: a table of all reports with approve/reject controls, coordinator notes, worker assignment dropdowns, and per-report history. Rejecting a report resets it to red and records a note visible to the worker. The coordinator can also create and manage community events.
 
**Government Worker Portal** — Workers log in with a category-specific account (Roads, Electrical, Sanitation, General). Their task queue is pre-filtered to reports matching their category, then sorted by status and upvote count so the most community-pressured issues surface first. Workers update report status and attach an after photo when marking a job complete.
 
**NGO and Social Worker Profiles** — Any citizen can register a social worker or NGO profile tied to their device, recording name, organisation, phone, and area of operation. Profiles are associated with reports filed under that device.
 
**Analytics** — A dashboard view exposes: report counts by category, counts by status, a 30-day daily submission trend, average response time in hours (from creation to worker assignment), active task count, and total community pressure (sum of upvotes on unresolved reports).
 
**Budget Panel** — A static panel shows allocated versus utilised municipal budget figures, giving citizens context for reported delays.
 
**Multi-language UI** — The full interface is available in English, Kannada, and Hindi, toggled at runtime via a client-side translation engine. Language selection persists across navigation within the session.
 
**Rate Limiting** — Submissions are capped at 3 reports per device per hour to prevent automated flooding, tracked in a lightweight SQLite rate-limit table.
 
---
 
## Tech Stack
 
| Library / Tool | Category | Role in Civicity |
|---|---|---|
| Flask 3.0 | Backend framework | Single-process REST API and static file server on port 5050 |
| flask-cors | CORS middleware | Enables cross-origin fetch calls during local development |
| python-dotenv | Config | Loads `GEMINI_API_KEY` from `.env` at startup |
| SQLite (WAL mode) | Database | Stores all reports, votes, energy, events, NGO profiles, and rate-limit counters in `civic_issues.db` — zero infrastructure setup |
| google-genai / google-generativeai | AI | Sends uploaded images to Gemini 2.5 Flash for civic-intent classification; falls back to the legacy `generativeai` SDK if the new `genai` package is absent |
| Pillow | Image I/O | Required by the image handling pipeline for file decoding |
| React 18 (CDN UMD) | Frontend framework | Full SPA rendered via Babel standalone — no build step, runs directly from `index.html` |
| Leaflet.js 1.9.4 | Maps | Interactive map of all reports with colour-coded pins by status; clicking a pin opens a report detail popup |
| Google Fonts — Inter, Poppins | Typography | Primary typeface loaded via CDN |
| Vanilla CSS | Frontend | Custom design system in `style.css` with CSS variables and a mobile-first responsive layout |
 
---
 
## Architecture Overview
 
Civicity is a monolithic Flask application that co-hosts the REST API and the React SPA from a single server process. The SPA lives entirely in `app/static/` and is served as Flask's static folder; the single entry point `app/templates/index.html` loads React, Babel, and Leaflet from public CDNs and bootstraps the app. There is no build step — the project runs from source without `npm install` or a bundler.
 
The backend has no blueprint layer; all routes live in `app.py`. Persistence is a single SQLite database (`civic_issues.db`) with WAL mode and foreign key enforcement on every connection. The schema is created on first boot via `init_db()` in `database.py`; there are no migration files and no separate seed scripts.
 
Worker and coordinator credentials are declared as plain dictionaries in `database.py` rather than in the database, which keeps the setup to a single file. Citizen and NGO identity is entirely device-fingerprint-based — no registration flow exists for public users.
 
AI validation is isolated in `ai_validator.py` and called synchronously during report submission. The validator fails open on any exception or missing API key so the system remains usable without a Google Cloud project.
 
---
 
## Key Data Flows
 
### 1. Report Submission (Citizen)
 
1. The citizen completes the multi-step form in the React SPA.
2. The SPA `POST`s to `/api/validate-image` with the photo; the server calls Gemini and returns `Valid` or `Invalid`. An `Invalid` result surfaces an error message and halts the submission.
3. On the main submit, the SPA `POST`s the full form as `multipart/form-data` to `/api/reports`.
4. `app.py` calls `db.find_nearby_duplicate()` — a Haversine query across open reports of the same category within 20 m. A match returns the existing report with `duplicate: true`; the SPA shows the duplicate card and does not create a new record.
5. If no duplicate, `db.create_report()` inserts the row and returns the new report object. The SPA shows a success card with the generated report ID.
 
### 2. Report Resolution (Worker)
 
1. Worker logs in via `/api/auth/login`; the server returns role, display name, and category.
2. The SPA calls `GET /api/worker/tasks?username=<name>`, which queries reports matching the worker's category, ordered by status then upvote count descending.
3. Worker updates progress via `POST /api/reports/<id>/status` (with `status=yellow` to start, `status=green` to complete). Completing a task requires an after photo, which is accepted via the same endpoint as `multipart/form-data`.
4. The public feed and map update on the next poll.
 
### 3. Coordinator Oversight
 
1. Coordinator logs in via `/api/auth/login`; the session role is `coordinator`.
2. The SPA calls `GET /api/reports` (unfiltered) and renders the full management table.
3. The coordinator assigns a worker via `POST /api/reports/<id>/assign`, which sets `status=yellow` and writes the worker display name.
4. Approve (`POST /api/reports/<id>/approve`) records a date-stamped approval flag. Reject (`POST /api/reports/<id>/reject`) resets status to `red`, clears the after photo, and stores a coordinator note.
 
### 4. Community Upvoting
 
1. The SPA generates a device fingerprint from `navigator.userAgent`, screen dimensions, and colour depth, hashed with `crypto.subtle.digest('SHA-256')`.
2. `POST /api/reports/<id>/upvote` with `{device_id}` is guarded by two uniqueness checks: the `votes` table (unique on `(report_id, device_id)`) and the `device_energy` table (10 votes per device per calendar day, resetting on the next UTC date).
3. Both the updated upvote count and remaining energy are returned to the SPA in a single response.
 
---
 
## Getting Started
 
### Prerequisites
 
- Python 3.11+
- A `.env` file in `app/` (see Environment Variables below)
 
### Installation
 
```bash
# Clone the repository
git clone <your-repo-url>
cd Civcity-main
 
# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate      # macOS / Linux
# .venv\Scripts\activate       # Windows
 
# Install dependencies
pip install -r app/requirements.txt
```
 
### Environment Variables
 
Create a `.env` file in the `app/` directory:
 
| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key for image validation. If omitted, all images pass validation automatically. |
 
### Running Locally
 
```bash
# From the project root, with .venv activated:
cd app
python app.py
```
 
The app starts on `http://localhost:5050`.
 
---
 
## Default Credentials
 
| Role | Username | Password |
|---|---|---|
| Coordinator | `coordinator` | `coord123` |
| Roads Worker | `ravi` | `worker123` |
| Electrical Worker | `suresh` | `worker123` |
| Sanitation Worker | `ananya` | `worker123` |
| General Worker | `priya` | `worker123` |
 
Citizens and NGO social workers do not require credentials. Identity is established via a browser-generated device fingerprint.
 
---
 
## Project Structure
 
```
Civcity-main/
├── .gitignore
└── app/
    ├── .env.example                 # Template for environment secrets
    ├── app.py                       # Flask app — all routes, file handling, auth
    ├── database.py                  # SQLite connection, schema init, all DB queries, worker/coordinator credentials
    ├── ai_validator.py              # Gemini image classification (new SDK + legacy fallback)
    ├── requirements.txt             # Python dependencies
    ├── civic_issues.db              # SQLite database (auto-created on first run)
    ├── templates/
    │   └── index.html               # SPA entry point — loads React, Babel, Leaflet, and all scripts
    └── static/
        ├── css/
        │   └── style.css            # Full design system — CSS variables, mobile-first layout, status colours
        ├── js/
        │   ├── app.js               # React SPA — all views: civilian, coordinator, worker, NGO, feed, analytics
        │   └── translations.js      # i18n string maps for English, Kannada, and Hindi
        └── uploads/                 # Uploaded before/after photos (auto-created at runtime)
```
 
---
 
## API Reference
 
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Authenticate coordinator or worker — returns role, display name, and category |
| `POST` | `/api/validate-image` | Run Gemini civic-intent check on an uploaded photo — returns `{result: 'Valid'|'Invalid'}` |
| `POST` | `/api/reports` | Create a report (multipart) — runs duplicate check and AI validation, returns created report |
| `GET` | `/api/reports` | List all reports — supports `?category=`, `?status=`, `?sort=newest|upvotes|status` |
| `GET` | `/api/reports/<id>` | Get a single report by ID |
| `POST` | `/api/reports/<id>/upvote` | Upvote a report — enforces per-device daily energy and uniqueness |
| `POST` | `/api/reports/<id>/status` | Update report status (accepts optional after photo as multipart) |
| `POST` | `/api/reports/<id>/after-photo` | Upload after photo and set status to green |
| `POST` | `/api/reports/<id>/assign` | Assign a worker to a report (sets status to yellow) |
| `POST` | `/api/reports/<id>/approve` | Coordinator approval — records date-stamped approval flag |
| `POST` | `/api/reports/<id>/reject` | Coordinator rejection — resets status to red, stores note |
| `GET` | `/api/analytics` | Aggregate analytics: by category, by status, 30-day trend, avg response time, active tasks, community pressure |
| `GET` | `/api/budget` | Static allocated vs. utilised budget figures |
| `GET` | `/api/energy` | Remaining civic energy for a given `?device_id=` |
| `POST` | `/api/ngo/register` | Register or update an NGO / social worker profile by device ID |
| `GET` | `/api/ngo/profile` | Fetch NGO profile by `?device_id=` |
| `POST` | `/api/events` | Create a community event |
| `GET` | `/api/events` | List all events ordered by date |
| `GET` | `/api/worker/tasks` | Task queue for a worker by `?username=`, pre-filtered by category and sorted by urgency |
 
---
 
## Why This Stack
 
Flask was chosen for rapid iteration — a multi-route REST API with AI integration and file uploads in a single Python process, with no build step, suits a hackathon timeline well. SQLite eliminates all infrastructure setup while providing ACID compliance with WAL mode for concurrent reads during live demos. Gemini 2.5 Flash was selected over a local classifier because it handles the full range of deceptive inputs (memes, screenshots, AI-generated images) without a training pipeline, and its fail-open error handling means the system stays functional in environments without a valid API key.
 
React 18 loaded from CDN with Babel standalone removes the `npm` dependency entirely — the project runs with `python app.py` and nothing else. This makes judges and evaluators' setup paths as short as possible. Leaflet is fully open-source, integrates cleanly with custom pin colour logic driven by report status, and requires no API key. Device fingerprinting over account creation removes the single biggest friction point for citizen adoption: no sign-up flow means no drop-off before the first report is filed.
 
---
 
## Contributing
 
1. Fork the repository and create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes and commit with a clear message: `git commit -m "feat: describe your change"`
3. Ensure no secrets are committed — `.env` is gitignored; the `.env.example` file contains only key names with no values
4. Open a Pull Request against `main` with a description of what changed and why

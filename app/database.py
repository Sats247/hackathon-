"""
database.py — Database layer for CivCity Civic Issue Reporting System.

Tables:
  - reports:        Civic issue reports submitted by citizens
  - votes:          Tracks which device upvoted which report (prevents double-voting)
  - device_energy:  Daily vote budget per device (10 votes/day)
  - rate_limit:     Submission rate limiting (3 reports/hour per device)
  - ngo_profiles:   Registered social workers and NGOs
  - events:         Community events created by coordinators

Status values for reports:
  - 'pending'      — Newly submitted, awaiting worker assignment
  - 'in_progress'  — Worker has started fixing the issue
  - 'resolved'     — Worker marked the issue as fixed (pending coordinator validation)
"""

import sqlite3
import os
from datetime import datetime, date

DB_PATH = os.path.join(os.path.dirname(__file__), 'civic_issues.db')


# ─── Connection ──────────────────────────────────────────────────────────────

def get_db():
    """Open a connection to the SQLite database with WAL mode and foreign keys enabled."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# ─── Schema ──────────────────────────────────────────────────────────────────

def init_db():
    """Create all database tables and indexes if they don't already exist."""
    conn = get_db()
    cur = conn.cursor()

    # --- Civic issue reports ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            title                   TEXT NOT NULL,              -- Short title (e.g. "Pothole on MG Road")
            description             TEXT,                       -- Optional longer description
            category                TEXT,                       -- Pothole | Streetlight | Garbage | Sewage | Other
            status                  TEXT DEFAULT 'pending',     -- pending | in_progress | resolved
            latitude                REAL,                       -- GPS latitude
            longitude               REAL,                       -- GPS longitude
            manual_address          TEXT,                       -- User-typed address (if no GPS)
            before_photo_path       TEXT,                       -- Filename of the "before" photo
            after_photo_path        TEXT,                       -- Filename of the "after" photo (uploaded by worker)
            phash                   TEXT,                       -- Perceptual hash of the before photo
            ai_validation_result    TEXT DEFAULT 'Pending',     -- Valid | Invalid | Pending
            upvotes                 INTEGER DEFAULT 0,          -- Community upvote count
            device_id               TEXT,                       -- SHA-256 fingerprint of submitter's browser
            assigned_worker         TEXT,                       -- Display name of assigned worker
            coordinator_note        TEXT,                       -- Note from coordinator on rejection
            approved_by_coordinator INTEGER DEFAULT 0,          -- 1 = coordinator verified resolution
            approval_date           TEXT,                       -- Date coordinator approved
            created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # --- Vote tracking (one vote per device per report) ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS votes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id   INTEGER NOT NULL REFERENCES reports(id),
            device_id   TEXT NOT NULL,
            UNIQUE(report_id, device_id)
        )
    """)

    # --- Daily vote budget per device (resets at midnight) ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS device_energy (
            device_id   TEXT PRIMARY KEY,
            votes_used  INTEGER DEFAULT 0,      -- How many votes used today
            last_reset  DATE                     -- Date of last reset
        )
    """)

    # --- Submission rate limiting (max 3 reports per hour per device) ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS rate_limit (
            device_id   TEXT NOT NULL,
            hour_bucket TEXT NOT NULL,           -- Format: YYYY-MM-DD-HH
            count       INTEGER DEFAULT 0,
            PRIMARY KEY (device_id, hour_bucket)
        )
    """)

    # --- Social worker / NGO profiles ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ngo_profiles (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            org_name      TEXT,
            phone         TEXT,
            area          TEXT,                    -- Area of operation (e.g. "Koramangala")
            device_id     TEXT UNIQUE,
            profile_type  TEXT DEFAULT 'Social Worker',  -- "Social Worker" or "NGO"
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # --- Community events ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            event_name    TEXT NOT NULL,
            event_date    TEXT NOT NULL,
            location      TEXT,
            description   TEXT,
            organized_by  TEXT,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # --- Indexes for common queries ---
    cur.executescript("""
        CREATE INDEX IF NOT EXISTS idx_reports_status   ON reports(status);
        CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category);
        CREATE INDEX IF NOT EXISTS idx_reports_location ON reports(latitude, longitude);
        CREATE INDEX IF NOT EXISTS idx_reports_device   ON reports(device_id);
        CREATE INDEX IF NOT EXISTS idx_votes_report     ON votes(report_id);
        CREATE INDEX IF NOT EXISTS idx_votes_device     ON votes(device_id);
    """)

    # --- Add phash column to existing tables if needed ---
    try:
        cur.execute("ALTER TABLE reports ADD COLUMN phash TEXT")
    except sqlite3.OperationalError:
        pass # Column likely already exists

    # --- Migrate old color-based statuses to readable names ---
    cur.executescript("""
        UPDATE reports SET status = 'pending'     WHERE status = 'red';
        UPDATE reports SET status = 'in_progress' WHERE status = 'yellow';
        UPDATE reports SET status = 'resolved'    WHERE status = 'green';
    """)

    conn.commit()
    conn.close()


# ─── Row Helpers ──────────────────────────────────────────────────────────────

def row_to_dict(row):
    """Convert a sqlite3.Row to a plain dict, or None if row is None."""
    if row is None:
        return None
    return dict(row)


def rows_to_list(rows):
    """Convert a list of sqlite3.Row objects to a list of dicts."""
    return [dict(r) for r in rows]


# ─── Reports ────────────────────────────────────────────────────────────────

def create_report(data):
    """
    Insert a new civic issue report.

    Args:
        data: dict with keys: title, description, category, latitude, longitude,
              manual_address, before_photo_path, phash, ai_validation_result, device_id

    Returns:
        int: The auto-generated report ID.
    """
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO reports
            (title, description, category, latitude, longitude,
             manual_address, before_photo_path, phash, ai_validation_result, device_id)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, (
        data['title'], data.get('description'), data['category'],
        data.get('latitude'), data.get('longitude'),
        data.get('manual_address'), data.get('before_photo_path'),
        data.get('phash'), data.get('ai_validation_result', 'Pending'), data.get('device_id')
    ))
    conn.commit()
    report_id = cur.lastrowid
    conn.close()
    return report_id


def get_report(report_id):
    """
    Fetch a single report by its ID.

    Returns:
        dict or None if not found.
    """
    conn = get_db()
    row = conn.execute("SELECT * FROM reports WHERE id=?", (report_id,)).fetchone()
    conn.close()
    return row_to_dict(row)


def get_all_reports(category=None, status=None, sort_by='newest'):
    """
    Fetch all reports with optional filters and sorting.

    Args:
        category: Filter by category (e.g. 'Pothole'). None = all.
        status:   Filter by status (e.g. 'pending'). None = all.
        sort_by:  'newest' (default), 'upvotes', or 'status'.

    Returns:
        list of dicts.
    """
    conn = get_db()
    query = """SELECT r.*, n.name as ngo_name, n.profile_type as ngo_type
               FROM reports r LEFT JOIN ngo_profiles n ON r.device_id = n.device_id
               WHERE 1=1"""
    params = []
    if category:
        query += " AND r.category=?"
        params.append(category)
    if status:
        query += " AND r.status=?"
        params.append(status)

    if sort_by == 'upvotes':
        query += " ORDER BY r.upvotes DESC, r.created_at DESC"
    elif sort_by == 'status':
        query += """ ORDER BY CASE r.status
                        WHEN 'pending' THEN 1
                        WHEN 'in_progress' THEN 2
                        WHEN 'resolved' THEN 3
                     END, r.created_at DESC"""
    else:
        query += " ORDER BY r.created_at DESC"

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return rows_to_list(rows)


def update_report_status(report_id, status, after_photo_path=None):
    """
    Update a report's status and optionally attach an after-photo.

    Args:
        report_id: ID of the report.
        status: New status ('pending', 'in_progress', or 'resolved').
        after_photo_path: Optional filename of the after-photo.
    """
    conn = get_db()
    if after_photo_path:
        conn.execute("""
            UPDATE reports SET status=?, after_photo_path=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        """, (status, after_photo_path, report_id))
    else:
        conn.execute("""
            UPDATE reports SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
        """, (status, report_id))
    conn.commit()
    conn.close()


def assign_worker(report_id, worker_name):
    """Assign a worker to a report and set status to 'in_progress'."""
    conn = get_db()
    conn.execute("""
        UPDATE reports SET assigned_worker=?, status='in_progress', updated_at=CURRENT_TIMESTAMP
        WHERE id=?
    """, (worker_name, report_id))
    conn.commit()
    conn.close()


def approve_report(report_id):
    """Mark a resolved report as verified by the coordinator."""
    today = date.today().strftime('%Y-%m-%d')
    conn = get_db()
    conn.execute("""
        UPDATE reports
        SET approved_by_coordinator=1, approval_date=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
    """, (today, report_id))
    conn.commit()
    conn.close()


def reject_report(report_id, note):
    """
    Reject a resolved report — resets status to 'pending', clears the after-photo,
    and saves the coordinator's rejection note.
    """
    conn = get_db()
    conn.execute("""
        UPDATE reports
        SET status='pending', coordinator_note=?, approved_by_coordinator=0,
            after_photo_path=NULL, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
    """, (note, report_id))
    conn.commit()
    conn.close()


# ─── Votes / Energy ─────────────────────────────────────────────────────────

def upvote_report(report_id, device_id):
    """
    Upvote a report. Each device can vote once per report and has 10 votes/day.

    Args:
        report_id: ID of the report to upvote.
        device_id: SHA-256 fingerprint of the voter's browser.

    Returns:
        dict with 'success' (bool), and either:
          - 'upvotes' + 'energy_left' on success
          - 'error' message on failure
    """
    conn = get_db()
    today = date.today().isoformat()

    # Check/reset daily energy
    energy_row = conn.execute(
        "SELECT * FROM device_energy WHERE device_id=?", (device_id,)
    ).fetchone()

    if energy_row:
        energy = dict(energy_row)
        if energy['last_reset'] != today:
            conn.execute(
                "UPDATE device_energy SET votes_used=0, last_reset=? WHERE device_id=?",
                (today, device_id)
            )
            votes_used = 0
        else:
            votes_used = energy['votes_used']
    else:
        conn.execute(
            "INSERT INTO device_energy (device_id, votes_used, last_reset) VALUES (?,0,?)",
            (device_id, today)
        )
        votes_used = 0

    if votes_used >= 10:
        conn.close()
        return {'success': False, 'error': 'No civic energy left for today. Resets at midnight.'}

    # Prevent double-voting
    try:
        conn.execute(
            "INSERT INTO votes (report_id, device_id) VALUES (?,?)",
            (report_id, device_id)
        )
    except sqlite3.IntegrityError:
        conn.close()
        return {'success': False, 'error': 'You have already upvoted this report.'}

    # Increment upvote count
    conn.execute("UPDATE reports SET upvotes=upvotes+1 WHERE id=?", (report_id,))
    conn.execute(
        "UPDATE device_energy SET votes_used=votes_used+1 WHERE device_id=?",
        (device_id,)
    )
    conn.commit()
    new_count = conn.execute("SELECT upvotes FROM reports WHERE id=?", (report_id,)).fetchone()[0]
    energy_left = 10 - (votes_used + 1)
    conn.close()
    return {'success': True, 'upvotes': new_count, 'energy_left': energy_left}


def get_energy_left(device_id):
    """
    Check how many upvotes a device has remaining today.

    Returns:
        int: Number of votes left (0–10).
    """
    conn = get_db()
    today = date.today().isoformat()
    row = conn.execute(
        "SELECT * FROM device_energy WHERE device_id=?", (device_id,)
    ).fetchone()
    conn.close()
    if not row:
        return 10
    row = dict(row)
    if row['last_reset'] != today:
        return 10
    return max(0, 10 - row['votes_used'])


# ─── Rate Limit ─────────────────────────────────────────────────────────────

def check_rate_limit(device_id):
    """
    Check if a device is allowed to submit a new report (max 3 per hour).

    Returns:
        True if allowed, False if rate limited.
    """
    conn = get_db()
    hour_bucket = datetime.utcnow().strftime('%Y-%m-%d-%H')
    row = conn.execute(
        "SELECT count FROM rate_limit WHERE device_id=? AND hour_bucket=?",
        (device_id, hour_bucket)
    ).fetchone()

    if row is None:
        conn.execute(
            "INSERT INTO rate_limit (device_id, hour_bucket, count) VALUES (?,?,1)",
            (device_id, hour_bucket)
        )
        conn.commit()
        conn.close()
        return True

    if row[0] >= 3:
        conn.close()
        return False

    conn.execute(
        "UPDATE rate_limit SET count=count+1 WHERE device_id=? AND hour_bucket=?",
        (device_id, hour_bucket)
    )
    conn.commit()
    conn.close()
    return True


# ─── Duplicate Detection ─────────────────────────────────────────────────────

def compute_phash(image_path):
    """Compute the perceptual hash of an image."""
    try:
        from PIL import Image
        import imagehash
        return str(imagehash.phash(Image.open(image_path)))
    except Exception as e:
        print(f"Error computing phash for {image_path}: {e}")
        return None

def find_similar_image(category, lat, lng, image_path, radius_meters=50, hours=48, hash_threshold=10):
    """
    Find an existing report of the same category that is both:
    1. Geographically close (within `radius_meters`)
    2. Visually similar (Hamming distance of phash <= `hash_threshold`)

    Returns:
        dict of the matching report, or None.
    """
    import math
    import imagehash
    
    new_hash_str = compute_phash(image_path)
    if not new_hash_str:
        return None
        
    try:
        new_hash = imagehash.hex_to_hash(new_hash_str)
    except Exception:
        return None

    conn = get_db()
    # First filter by time, category, and ensure they have a phash
    rows = conn.execute("""
        SELECT * FROM reports
        WHERE category=? AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND phash IS NOT NULL
          AND created_at >= datetime('now', ? || ' hours')
          AND status != 'resolved'
    """, (category, f'-{hours}')).fetchall()
    conn.close()

    for row in rows:
        row = dict(row)
        
        # 1. Geographic Distance Check (Haversine)
        dlat = math.radians(lat - row['latitude'])
        dlng = math.radians(lng - row['longitude'])
        a = (math.sin(dlat/2)**2 +
             math.cos(math.radians(lat)) * math.cos(math.radians(row['latitude'])) *
             math.sin(dlng/2)**2)
        dist = 6371000 * 2 * math.asin(math.sqrt(a))
        
        if dist <= radius_meters:
            # 2. Visual Similarity Check (Hamming Distance)
            try:
                old_hash = imagehash.hex_to_hash(row['phash'])
                if new_hash - old_hash <= hash_threshold:
                    return row
            except Exception:
                pass
                
    return None


# ─── Analytics ───────────────────────────────────────────────────────────────

def get_analytics():
    """
    Generate dashboard analytics: category breakdown, status breakdown,
    daily report count (30 days), average response time, active tasks,
    and community pressure (sum of upvotes on pending reports).

    Returns:
        dict with keys: by_category, by_status, daily,
        avg_response_hours, active_tasks, community_pressure
    """
    conn = get_db()

    by_category = rows_to_list(conn.execute("""
        SELECT category, COUNT(*) as count FROM reports GROUP BY category
    """).fetchall())

    by_status = rows_to_list(conn.execute("""
        SELECT status, COUNT(*) as count FROM reports GROUP BY status
    """).fetchall())

    daily = rows_to_list(conn.execute("""
        SELECT DATE(created_at) as day, COUNT(*) as count
        FROM reports
        WHERE created_at >= datetime('now', '-30 days')
        GROUP BY DATE(created_at)
        ORDER BY day
    """).fetchall())

    avg_response = conn.execute("""
        SELECT AVG((JULIANDAY(updated_at) - JULIANDAY(created_at)) * 24) as avg_hours
        FROM reports
        WHERE assigned_worker IS NOT NULL AND status != 'pending'
    """).fetchone()

    active_tasks = conn.execute(
        "SELECT COUNT(*) as c FROM reports WHERE status='in_progress'"
    ).fetchone()[0]

    community_pressure = conn.execute(
        "SELECT COALESCE(SUM(upvotes),0) as total FROM reports WHERE status='pending'"
    ).fetchone()[0]

    conn.close()

    avg_h = avg_response[0] if avg_response and avg_response[0] else 0

    return {
        'by_category': by_category,
        'by_status': by_status,
        'daily': daily,
        'avg_response_hours': round(avg_h, 1),
        'active_tasks': active_tasks,
        'community_pressure': community_pressure
    }


# ─── Workers & Coordinator Credentials ───────────────────────────────────────
# NOTE: In a production app, these should be in a database table with hashed
# passwords. For this prototype, they are kept as constants for simplicity.

WORKERS = {
    'ravi':    {'password': 'worker123', 'category': 'Pothole',     'display': 'Ravi (Roads)'},
    'suresh':  {'password': 'worker123', 'category': 'Streetlight', 'display': 'Suresh (Electrical)'},
    'ananya':  {'password': 'worker123', 'category': 'Garbage',     'display': 'Ananya (Sanitation)'},
    'priya':   {'password': 'worker123', 'category': 'Other',       'display': 'Priya (General)'},
}

COORDINATOR = {'username': 'coordinator', 'password': 'coord123'}


def get_worker_tasks(worker_username):
    """
    Get all tasks assigned to a worker or matching their category.
    Results are sorted by status priority (pending first), then by upvotes.

    Args:
        worker_username: Login username of the worker (e.g. 'ravi').

    Returns:
        list of report dicts.
    """
    worker = WORKERS.get(worker_username)
    if not worker:
        return []
    conn = get_db()
    rows = conn.execute("""
        SELECT * FROM reports
        WHERE (assigned_worker=? OR category=?)
          AND status != 'resolved'
        ORDER BY
          CASE status WHEN 'pending' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
          upvotes DESC,
          created_at DESC
    """, (worker['display'], worker['category'])).fetchall()
    conn.close()
    return rows_to_list(rows)


# ─── NGO Profiles ─────────────────────────────────────────────────────────────

def register_ngo(data):
    """
    Register a new social worker / NGO profile, or update if device already registered.

    Args:
        data: dict with keys: name, org_name, phone, area, device_id, profile_type

    Returns:
        dict with 'success': True (and optionally 'updated': True if existing was updated).
    """
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO ngo_profiles (name, org_name, phone, area, device_id, profile_type)
            VALUES (?,?,?,?,?,?)
        """, (
            data['name'], data.get('org_name'), data.get('phone'),
            data.get('area'), data['device_id'],
            data.get('profile_type', 'Social Worker')
        ))
        conn.commit()
        conn.close()
        return {'success': True}
    except sqlite3.IntegrityError:
        # Device already registered — update profile
        conn.execute("""
            UPDATE ngo_profiles SET name=?, org_name=?, phone=?, area=?, profile_type=?
            WHERE device_id=?
        """, (
            data['name'], data.get('org_name'), data.get('phone'),
            data.get('area'), data.get('profile_type', 'Social Worker'),
            data['device_id']
        ))
        conn.commit()
        conn.close()
        return {'success': True, 'updated': True}


def get_ngo_profile(device_id):
    """
    Fetch the NGO/social worker profile for a device.

    Returns:
        dict or None.
    """
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM ngo_profiles WHERE device_id=?", (device_id,)
    ).fetchone()
    conn.close()
    return row_to_dict(row)


# ─── Events ───────────────────────────────────────────────────────────────────

def create_event(data):
    """
    Create a new community event.

    Args:
        data: dict with keys: event_name, event_date, location, description, organized_by

    Returns:
        int: The auto-generated event ID.
    """
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO events (event_name, event_date, location, description, organized_by)
        VALUES (?,?,?,?,?)
    """, (
        data['event_name'], data['event_date'],
        data.get('location'), data.get('description'),
        data.get('organized_by')
    ))
    conn.commit()
    event_id = cur.lastrowid
    conn.close()
    return event_id


def get_all_events():
    """Fetch all community events, newest first."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM events ORDER BY event_date DESC"
    ).fetchall()
    conn.close()
    return rows_to_list(rows)

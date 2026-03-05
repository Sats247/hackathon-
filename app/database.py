import sqlite3
import os
from datetime import datetime, date

DB_PATH = os.path.join(os.path.dirname(__file__), 'civic_issues.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.executescript("""
        CREATE TABLE IF NOT EXISTS ngo_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            org_name TEXT,
            phone TEXT,
            area TEXT,
            device_id TEXT UNIQUE,
            profile_type TEXT DEFAULT 'Social Worker',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            category TEXT,
            status TEXT DEFAULT 'red',
            latitude REAL,
            longitude REAL,
            manual_address TEXT,
            before_photo_path TEXT,
            after_photo_path TEXT,
            ai_validation_result TEXT DEFAULT 'Pending',
            upvotes INTEGER DEFAULT 0,
            device_id TEXT,
            assigned_worker TEXT,
            coordinator_note TEXT,
            approved_by_coordinator INTEGER DEFAULT 0,
            approval_date TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER,
            device_id TEXT,
            UNIQUE(report_id, device_id)
        );

        CREATE TABLE IF NOT EXISTS device_energy (
            device_id TEXT PRIMARY KEY,
            votes_used INTEGER DEFAULT 0,
            last_reset DATE
        );

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_name TEXT NOT NULL,
            event_date TEXT NOT NULL,
            location TEXT,
            description TEXT,
            organized_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS rate_limit (
            device_id TEXT,
            hour_bucket TEXT,
            count INTEGER DEFAULT 0,
            PRIMARY KEY (device_id, hour_bucket)
        );
    """)
    conn.commit()
    conn.close()


def row_to_dict(row):
    if row is None:
        return None
    return dict(row)


def rows_to_list(rows):
    return [dict(r) for r in rows]


# ─── Reports ────────────────────────────────────────────────────────────────

def create_report(data):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO reports
            (title, description, category, latitude, longitude,
             manual_address, before_photo_path, ai_validation_result, device_id)
        VALUES (?,?,?,?,?,?,?,?,?)
    """, (
        data['title'], data.get('description'), data['category'],
        data.get('latitude'), data.get('longitude'),
        data.get('manual_address'), data.get('before_photo_path'),
        data.get('ai_validation_result', 'Pending'), data.get('device_id')
    ))
    conn.commit()
    report_id = cur.lastrowid
    conn.close()
    return report_id


def get_report(report_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM reports WHERE id=?", (report_id,)).fetchone()
    conn.close()
    return row_to_dict(row)


def get_all_reports(category=None, status=None, sort_by='newest'):
    conn = get_db()
    query = "SELECT r.*, n.name as ngo_name, n.profile_type as ngo_type FROM reports r LEFT JOIN ngo_profiles n ON r.device_id = n.device_id WHERE 1=1"
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
        query += " ORDER BY CASE r.status WHEN 'red' THEN 1 WHEN 'yellow' THEN 2 WHEN 'green' THEN 3 END, r.created_at DESC"
    else:
        query += " ORDER BY r.created_at DESC"

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return rows_to_list(rows)


def update_report_status(report_id, status, after_photo_path=None):
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
    conn = get_db()
    conn.execute("""
        UPDATE reports SET assigned_worker=?, status='yellow', updated_at=CURRENT_TIMESTAMP
        WHERE id=?
    """, (worker_name, report_id))
    conn.commit()
    conn.close()


def approve_report(report_id):
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
    conn = get_db()
    conn.execute("""
        UPDATE reports
        SET status='red', coordinator_note=?, approved_by_coordinator=0,
            after_photo_path=NULL, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
    """, (note, report_id))
    conn.commit()
    conn.close()


# ─── Votes / Energy ─────────────────────────────────────────────────────────

def upvote_report(report_id, device_id):
    conn = get_db()
    today = date.today().isoformat()

    # Check/reset energy
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

    # Check uniqueness
    try:
        conn.execute(
            "INSERT INTO votes (report_id, device_id) VALUES (?,?)",
            (report_id, device_id)
        )
    except sqlite3.IntegrityError:
        conn.close()
        return {'success': False, 'error': 'You have already upvoted this report.'}

    # Increment
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
    """Returns True if allowed, False if rate limited (3 per hour)."""
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

def find_nearby_duplicate(category, lat, lng, radius_meters=20, hours=48):
    """Find a report of same category within radius_meters in last hours."""
    import math
    conn = get_db()
    rows = conn.execute("""
        SELECT * FROM reports
        WHERE category=? AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND created_at >= datetime('now', ? || ' hours')
          AND status != 'green'
    """, (category, f'-{hours}')).fetchall()
    conn.close()

    for row in rows:
        row = dict(row)
        dlat = math.radians(lat - row['latitude'])
        dlng = math.radians(lng - row['longitude'])
        a = (math.sin(dlat/2)**2 +
             math.cos(math.radians(lat)) * math.cos(math.radians(row['latitude'])) *
             math.sin(dlng/2)**2)
        dist = 6371000 * 2 * math.asin(math.sqrt(a))
        if dist <= radius_meters:
            return row
    return None


# ─── Analytics ───────────────────────────────────────────────────────────────

def get_analytics():
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
        WHERE assigned_worker IS NOT NULL AND status != 'red'
    """).fetchone()

    active_tasks = conn.execute(
        "SELECT COUNT(*) as c FROM reports WHERE status='yellow'"
    ).fetchone()[0]

    community_pressure = conn.execute(
        "SELECT COALESCE(SUM(upvotes),0) as total FROM reports WHERE status='red'"
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


# ─── Workers ─────────────────────────────────────────────────────────────────

WORKERS = {
    'ravi':    {'password': 'worker123', 'category': 'Pothole',     'display': 'Ravi (Roads)'},
    'suresh':  {'password': 'worker123', 'category': 'Streetlight', 'display': 'Suresh (Electrical)'},
    'ananya':  {'password': 'worker123', 'category': 'Garbage',     'display': 'Ananya (Sanitation)'},
    'priya':   {'password': 'worker123', 'category': 'Other',       'display': 'Priya (General)'},
}

COORDINATOR = {'username': 'coordinator', 'password': 'coord123'}


def get_worker_tasks(worker_username):
    worker = WORKERS.get(worker_username)
    if not worker:
        return []
    conn = get_db()
    # Get both assigned tasks and tasks matching their category
    rows = conn.execute("""
        SELECT * FROM reports
        WHERE (assigned_worker=? OR category=?)
          AND status != 'green'
        ORDER BY
          CASE status WHEN 'red' THEN 1 WHEN 'yellow' THEN 2 ELSE 3 END,
          upvotes DESC,
          created_at DESC
    """, (worker['display'], worker['category'])).fetchall()
    conn.close()
    return rows_to_list(rows)


# ─── NGO Profiles ─────────────────────────────────────────────────────────────

def register_ngo(data):
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
        # Update existing
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
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM ngo_profiles WHERE device_id=?", (device_id,)
    ).fetchone()
    conn.close()
    return row_to_dict(row)


# ─── Events ───────────────────────────────────────────────────────────────────

def create_event(data):
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
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM events ORDER BY event_date DESC"
    ).fetchall()
    conn.close()
    return rows_to_list(rows)

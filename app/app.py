import os
import uuid
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

load_dotenv()

import database as db
from ai_validator import validate_image

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist'))
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='/')
CORS(app)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png'}
MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5 MB
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
db.init_db()

# ─── Auth ─────────────────────────────────────────────────────────────────────


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def save_upload(file, prefix='photo'):
    ext = file.filename.rsplit('.', 1)[1].lower()
    fname = f"{prefix}_{uuid.uuid4().hex}.{ext}"
    path = os.path.join(UPLOAD_FOLDER, fname)
    file.save(path)
    return fname, path


# ─── Serve SPA ────────────────────────────────────────────────────────────────

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_vue_app(path):
    # If path is not an API route and not an uploads request, serve the Vite index.html
    if path.startswith('api/') or path.startswith('static/uploads/'):
        return "Not found", 404
        
    # Check if the requested file exists in the Vite dist folder
    if path and os.path.exists(os.path.join(FRONTEND_DIR, path)):
        return send_from_directory(FRONTEND_DIR, path)
        
    return send_from_directory(FRONTEND_DIR, 'index.html')


@app.route('/static/uploads/<filename>')
def serve_uploads(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)


# ─── Auth ─────────────────────────────────────────────────────────────────────

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username', '').strip().lower()
    password = data.get('password', '').strip()

    if username == db.COORDINATOR['username'] and password == db.COORDINATOR['password']:
        return jsonify({'success': True, 'role': 'coordinator', 'name': 'Coordinator', 'username': username})

    worker = db.WORKERS.get(username)
    if worker and worker['password'] == password:
        return jsonify({
            'success': True,
            'role': 'worker',
            'name': worker['display'],
            'username': username,
            'category': worker['category']
        })

    return jsonify({'success': False, 'error': 'Invalid credentials'}), 401


# ─── Image Validation ─────────────────────────────────────────────────────────

@app.route('/api/validate-image', methods=['POST'])
def validate_image_route():
    if 'photo' not in request.files:
        return jsonify({'error': 'No photo provided'}), 400

    file = request.files['photo']
    if not file or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Use JPG or PNG.'}), 400

    fname, path = save_upload(file, prefix='validate')
    try:
        validation = validate_image(path)
    finally:
        # Always remove temporary validation file
        try:
            os.remove(path)
        except Exception:
            pass

    return jsonify({
        'result': validation['result'],
        'reason': validation.get('reason', ''),
        'confidence': validation.get('confidence', '')
    })


# ─── Reports ─────────────────────────────────────────────────────────────────

@app.route('/api/reports', methods=['POST'])
def create_report():
    device_id = request.form.get('device_id', '')


    # Photo
    if 'photo' not in request.files:
        return jsonify({'error': 'Photo is required'}), 400
    file = request.files['photo']
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Use JPG or PNG.'}), 400

    fname, path = save_upload(file, prefix='before')

    # AI Validation
    ai_validation = validate_image(path)
    ai_result = ai_validation['result']
    ai_reason = ai_validation.get('reason', 'This image does not appear to show a civic issue.')
    if ai_result == 'Invalid':
        os.remove(path)
        return jsonify({'error': 'AI_INVALID', 'message': ai_reason}), 422

    # Location
    lat = request.form.get('latitude')
    lng = request.form.get('longitude')
    manual_address = request.form.get('manual_address')

    if not request.form.get('title'):
        return jsonify({'error': 'Title is required'}), 400

    category = request.form.get('category')
    
    if lat and lng and not request.form.get('force'):
        duplicate = db.find_similar_image(category, float(lat), float(lng), path)
        if duplicate:
            # We don't save the new report, we return the old one for upvoting
            os.remove(path)
            return jsonify({'success': True, 'duplicate': True, 'existing_report': duplicate})

    # If no duplicate or forced, compute phash to save
    phash_str = db.compute_phash(path)

    # Save to DB
    report_id = db.create_report({
        'title': request.form.get('title'),
        'description': request.form.get('description'),
        'category': category,
        'latitude': float(lat) if lat else None,
        'longitude': float(lng) if lng else None,
        'manual_address': request.form.get('manual_address'),
        'before_photo_path': fname,
        'phash': phash_str,
        'ai_validation_result': ai_result,
        'device_id': device_id
    })

    report = db.get_report(report_id)
    return jsonify({'success': True, 'report': report}), 201


@app.route('/api/reports', methods=['GET'])
def get_reports():
    category = request.args.get('category')
    status = request.args.get('status')
    sort_by = request.args.get('sort', 'newest')
    reports = db.get_all_reports(category=category, status=status, sort_by=sort_by)

    # Add photo URLs
    for r in reports:
        if r.get('before_photo_path'):
            r['before_photo_url'] = f"/static/uploads/{r['before_photo_path']}"
        if r.get('after_photo_path'):
            r['after_photo_url'] = f"/static/uploads/{r['after_photo_path']}"

    return jsonify(reports)


@app.route('/api/reports/<int:report_id>', methods=['GET'])
def get_report(report_id):
    report = db.get_report(report_id)
    if not report:
        return jsonify({'error': 'Not found'}), 404
    if report.get('before_photo_path'):
        report['before_photo_url'] = f"/static/uploads/{report['before_photo_path']}"
    if report.get('after_photo_path'):
        report['after_photo_url'] = f"/static/uploads/{report['after_photo_path']}"
    return jsonify(report)


@app.route('/api/reports/<int:report_id>/upvote', methods=['POST'])
def upvote(report_id):
    data = request.get_json() or {}
    device_id = data.get('device_id', '')
    if not device_id:
        return jsonify({'error': 'device_id required'}), 400
    result = db.upvote_report(report_id, device_id)
    if result['success']:
        return jsonify(result)
    return jsonify(result), 400


@app.route('/api/reports/<int:report_id>/status', methods=['POST'])
def update_status(report_id):
    # Worker uploads after-photo when marking done
    new_status = request.form.get('status') or (request.get_json() or {}).get('status')

    after_path = None
    if 'after_photo' in request.files:
        file = request.files['after_photo']
        if file and allowed_file(file.filename):
            fname, _ = save_upload(file, prefix='after')
            after_path = fname

    db.update_report_status(report_id, new_status, after_path)
    return jsonify({'success': True})


@app.route('/api/reports/<int:report_id>/after-photo', methods=['POST'])
def upload_after_photo(report_id):
    if 'photo' not in request.files:
        return jsonify({'error': 'No photo'}), 400
    file = request.files['photo']
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400
    fname, _ = save_upload(file, prefix='after')
    db.update_report_status(report_id, 'resolved', fname)
    return jsonify({'success': True})


@app.route('/api/reports/<int:report_id>/assign', methods=['POST'])
def assign_worker(report_id):
    data = request.get_json() or {}
    worker_name = data.get('worker')
    if not worker_name:
        return jsonify({'error': 'worker required'}), 400
    db.assign_worker(report_id, worker_name)
    return jsonify({'success': True})


@app.route('/api/reports/<int:report_id>/approve', methods=['POST'])
def approve_report(report_id):
    db.approve_report(report_id)
    return jsonify({'success': True})


@app.route('/api/reports/<int:report_id>/reject', methods=['POST'])
def reject_report(report_id):
    data = request.get_json() or {}
    note = data.get('note', '')
    db.reject_report(report_id, note)
    return jsonify({'success': True})


# ─── Analytics ────────────────────────────────────────────────────────────────

@app.route('/api/analytics', methods=['GET'])
def analytics():
    return jsonify(db.get_analytics())


# ─── Budget ───────────────────────────────────────────────────────────────────

@app.route('/api/budget', methods=['GET'])
def budget():
    return jsonify({
        'allocated': '₹12,00,00,000',
        'utilized': '₹4,50,00,000',
        'allocated_raw': 120000000,
        'utilized_raw': 45000000
    })


# ─── Energy ─────────────────────────────────────────────────────────────────

@app.route('/api/energy', methods=['GET'])
def energy():
    device_id = request.args.get('device_id', '')
    return jsonify({'energy_left': db.get_energy_left(device_id)})


# ─── NGO ──────────────────────────────────────────────────────────────────────

@app.route('/api/ngo/register', methods=['POST'])
def ngo_register():
    data = request.get_json() or {}
    if not data.get('name') or not data.get('device_id'):
        return jsonify({'error': 'name and device_id required'}), 400
    result = db.register_ngo(data)
    return jsonify(result)


@app.route('/api/ngo/profile', methods=['GET'])
def ngo_profile():
    device_id = request.args.get('device_id', '')
    profile = db.get_ngo_profile(device_id)
    return jsonify(profile or {})


# ─── Events ───────────────────────────────────────────────────────────────────

@app.route('/api/events', methods=['POST'])
def create_event():
    data = request.get_json() or {}
    if not data.get('event_name') or not data.get('event_date'):
        return jsonify({'error': 'event_name and event_date required'}), 400
    event_id = db.create_event(data)
    return jsonify({'success': True, 'id': event_id}), 201


@app.route('/api/events', methods=['GET'])
def get_events():
    return jsonify(db.get_all_events())


# ─── Worker Tasks ─────────────────────────────────────────────────────────────

@app.route('/api/worker/tasks', methods=['GET'])
def worker_tasks():
    username = request.args.get('username', '')
    tasks = db.get_worker_tasks(username)
    for t in tasks:
        if t.get('before_photo_path'):
            t['before_photo_url'] = f"/static/uploads/{t['before_photo_path']}"
        if t.get('after_photo_path'):
            t['after_photo_url'] = f"/static/uploads/{t['after_photo_path']}"
    return jsonify(tasks)


if __name__ == '__main__':
    print("=" * 60)
    print("  Civic Issue Reporting System")
    print("  Running at: http://127.0.0.1:5000")
    print("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=5050, use_reloader=False)

import os
import gspread
import smtplib
import qrcode
import json
import base64
from io import BytesIO
from datetime import datetime
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template, url_for, session, redirect, flash
from flask_cors import CORS
from functools import wraps
from oauth2client.service_account import ServiceAccountCredentials
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage

# --- INITIALIZATION ---
load_dotenv()
app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)
# Secret key for session management (required for login)
app.secret_key = os.getenv("SECRET_KEY", "LfB@(Vbzdtw5^Fp/q=U4{88y[NOn}<")

# --- CONFIGURATION FROM ENVIRONMENT VARIABLES ---
# Lab Booking
SHEET_ID = os.getenv("SHEET_ID")
SHEET_NAME = os.getenv("SHEET_NAME")

# Equipment Booking
EQUIPMENT_SHEET_ID = os.getenv("EQUIPMENT_SHEET_ID")
EQUIPMENT_SHEET_NAME = os.getenv("EQUIPMENT_SHEET_NAME")

# General Config
APP_URL = os.getenv("APP_URL")
SMTP_SERVER = os.getenv("SMTP_SERVER")
SMTP_PORT = os.getenv("SMTP_PORT")
SMTP_SENDER_EMAIL = os.getenv("SMTP_SENDER_EMAIL")
SMTP_SENDER_PASSWORD = os.getenv("SMTP_SENDER_PASSWORD")
LAB_HEAD_EMAIL = os.getenv("LAB_HEAD_EMAIL")
GOOGLE_CREDENTIALS_BASE64 = os.getenv("GOOGLE_CREDENTIALS_BASE64")

# Admin Config
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

# --- GOOGLE SHEETS CONNECTION ---

def get_google_creds():
    """Decodes the Base64 credentials."""
    if not GOOGLE_CREDENTIALS_BASE64:
        print("FATAL: Environment variable GOOGLE_CREDENTIALS_BASE64 not found.")
        return None
    try:
        creds_json_str = base64.b64decode(GOOGLE_CREDENTIALS_BASE64).decode('utf-8')
        return json.loads(creds_json_str)
    except Exception as e:
        print(f"FATAL: Failed to decode GOOGLE_CREDENTIALS_BASE64: {e}")
        return None

def get_lab_booking_sheet():
    """Connects to the Lab Booking Google Sheet."""
    try:
        creds_dict = get_google_creds()
        if not creds_dict:
            raise ValueError("Google credentials are not valid.")
        
        scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
        creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, scope)
        client = gspread.authorize(creds)
        sheet = client.open_by_key(SHEET_ID).worksheet(SHEET_NAME)
        print("Successfully connected to Google Sheets (Lab Booking).")
        return sheet
    except Exception as e:
        print(f"FAILED TO CONNECT to Google Sheets (Lab Booking): {e}")
        return None

def get_equipment_sheet():
    """Connects to the Equipment Booking Google Sheet."""
    try:
        creds_dict = get_google_creds()
        if not creds_dict:
            raise ValueError("Google credentials are not valid.")
            
        scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
        creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, scope)
        client = gspread.authorize(creds)
        sheet = client.open_by_key(EQUIPMENT_SHEET_ID).worksheet(EQUIPMENT_SHEET_NAME)
        print("Successfully connected to Google Sheets (Equipment Booking).")
        return sheet
    except Exception as e:
        print(f"FAILED TO CONNECT to Google Sheets (Equipment Booking): {e}")
        return None

# --- HELPER FUNCTIONS & EMAIL TEMPLATES ---

def time_to_minutes(time_str):
    """Converts 'HH:MM' time string to total minutes."""
    if isinstance(time_str, str) and ':' in time_str:
        h, m = map(int, time_str.split(':'))
        return h * 60 + m
    return 0

def send_email(to_address, subject, html_body, qr_image_bytes=None):
    """Sends an email with or without a QR code attachment."""
    try:
        port = int(SMTP_PORT or 587) 
        msg = MIMEMultipart('related')
        msg['From'] = f"Sampoerna Lab Booking <{SMTP_SENDER_EMAIL}>"
        msg['To'] = to_address
        msg['Subject'] = subject
        msg_alternative = MIMEMultipart('alternative')
        msg.attach(msg_alternative)
        msg_text = MIMEText(html_body, 'html')
        msg_alternative.attach(msg_text)
        
        if qr_image_bytes:
            qr_image = MIMEImage(qr_image_bytes, name='qrcode.png')
            qr_image.add_header('Content-ID', '<qr_code_image>')
            msg.attach(qr_image)
            
        with smtplib.SMTP(SMTP_SERVER, port) as server:
            server.starttls()
            server.login(SMTP_SENDER_EMAIL, SMTP_SENDER_PASSWORD)
            server.send_message(msg)
            print(f"Email successfully sent to {to_address}")
    except Exception as e:
        print(f"Failed to send email: {e}")

# --- Email Templates (Lab Booking) ---

def create_approval_email_body(data, row_id):
    """Creates the HTML email body for lab booking approval."""
    approve_url = f"{APP_URL}/approve?id={row_id}"
    reject_url = f"{APP_URL}/reject?id={row_id}"
    
    return f"""
    <p>A new lab booking request has been submitted with the following details:</p>
    <ul>
      <li><b>Name:</b> {data.get('nama')}</li>
      <li><b>ID:</b> {data.get('idPengguna')}</li>
      <li><b>Email:</b> {data.get('emailPengguna')}</li>
      <li><b>Date:</b> {data.get('tanggalBooking')}</li>
      <li><b>Time:</b> {data.get('waktuMulai')} - {data.get('waktuSelesai')}</li>
      <li><b>Purpose:</b> {data.get('finalPurpose')}</li>
      <li><b>Number of People:</b> {data.get('jumlahOrang', '1')}</li>
    </ul>
    <p>Please approve or reject this request:</p>
    <a href="{approve_url}" style="background-color: #0033A0; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">APPROVE</a>
    <a href="{reject_url}" style="background-color: #D4002A; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; margin-left: 10px;">REJECT</a>
    """

def create_approved_email_body(user_data, checkin_url):
    """Creates the HTML email body for an approved lab booking (with QR Code)."""
    formatted_date = datetime.strptime(user_data.get('tanggalBooking', ''), '%Y-%m-%d').strftime('%d/%m/%Y')
    return f"""
    <html><body><h2>Hello {user_data.get('nama')},</h2>
      <p>Your lab booking request for the following schedule has been approved:</p>
      <ul><li><b>Date:</b> {formatted_date}</li><li><b>Time:</b> {user_data.get('waktuMulai')} - {user_data.get('waktuSelesai')}</li></ul>
      <p>Please scan the QR Code below to check-in.</p>
      <div style="padding: 20px;"><img src="cid:qr_code_image" alt="QR Code"></div>
      <p>Or click this link: <a href="{checkin_url}">Manual Check-in Link</a></p></body></html>
    """

def create_rejected_email_body(data):
    """Creates the HTML email body for a rejected lab booking."""
    formatted_date = datetime.strptime(data.get('tanggalBooking', ''), '%Y-%m-%d').strftime('%d/%m/%Y')
    return f"""
    <h2>Hello {data.get('nama')},</h2>
    <p>We regret to inform you that your lab booking request could not be approved at this time:</p>
    <ul><li><b>Date:</b> {formatted_date}</li><li><b>Time:</b> {data.get('waktuMulai')} - {data.get('waktuSelesai')}</li></ul>
    <p>Please contact the lab administration for more information.</p>
    """

# --- Email Templates (Equipment Booking) ---

def create_equipment_approval_email(data, row_id):
    """Creates the HTML email body for equipment borrowing approval."""
    approve_url = f"{APP_URL}/equipment_approve?id={row_id}"
    reject_url = f"{APP_URL}/equipment_reject?id={row_id}"
    
    items_list_html = ""
    try:
        items_dict = json.loads(data.get('itemsBorrowed', '{}'))
        if not items_dict:
            items_list_html = "<li>No items were selected.</li>"
        else:
            for item, quantity in items_dict.items():
                items_list_html += f"<li><b>{item}:</b> {quantity} unit(s)</li>"
    except Exception as e:
        items_list_html = "<li>Failed to parse item list.</li>"

    return f"""
    <p>A new equipment borrowing request has been submitted:</p>
    <ul>
      <li><b>Name:</b> {data.get('nama')}</li>
      <li><b>ID:</b> {data.get('idPengguna')}</li>
      <li><b>Email:</b> {data.get('emailPengguna')}</li>
      <li><b>WA Number:</b> {data.get('waNumber')}</li>
      <li><b>Pickup Time:</b> {data.get('pickupDateTime')}</li>
      <li><b>Return Time:</b> {data.get('returnDateTime')}</li>
      <li><b>Purpose:</b> {data.get('purpose')}</li>
    </ul>
    <p><b>Items Requested:</b></p>
    <ul>
      {items_list_html}
    </ul>
    <p>Please approve or reject this request:</p>
    <a href="{approve_url}" style="background-color: #0033A0; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">APPROVE</a>
    <a href="{reject_url}" style="background-color: #D4002A; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; margin-left: 10px;">REJECT</a>
    """

def create_equipment_approved_email(user_data):
    """Creates the confirmation email for an approved equipment loan."""
    return f"""
    <html><body><h2>Hello {user_data.get('nama')},</h2>
      <p>Your equipment borrowing request has been approved.</p>
      <p>You can pick up the equipment at the following schedule:</p>
      <ul>
        <li><b>Pickup Time:</b> {user_data.get('pickupDateTime')}</li>
        <li><b>Return Time:</b> {user_data.get('returnDateTime')}</li>
      </ul>
      <p>Please show this email to the lab staff upon pickup.</p>
    </body></html>
    """

def create_equipment_rejected_email(user_data):
    """Creates the rejection email for an equipment loan."""
    return f"""
    <h2>Hello {user_data.get('nama')},</h2>
    <p>We regret to inform you that your equipment borrowing request could not be approved at this time.</p>
    <p>Please contact the lab administration for more information.</p>
    """

# --- LOGIN DECORATOR ---
def login_required(f):
    """Decorator to restrict access to certain routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            flash('You must be logged in to view this page.', 'error')
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# --- PAGE ROUTES ---

@app.route('/')
def home():
    """Main route, shows the public lab booking form."""
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    """Route for the public dashboard."""
    return render_template('dashboard.html')

@app.route('/scan')
def scan_qr():
    """Route for the public QR scanner page."""
    return render_template('scan.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Route for the admin login page."""
    if 'logged_in' in session:
        return redirect(url_for('admin_panel')) # If already logged in, go to admin panel
        
    if request.method == 'POST':
        email = request.form['username']
        password = request.form['password']
        if email == ADMIN_USERNAME and password == ADMIN_PASSWORD:
            session['logged_in'] = True
            flash('Login successful!', 'success')
            return redirect(url_for('admin_panel')) # Redirect to admin panel
        else:
            flash('Invalid Credentials. Please try again.', 'error')
            return redirect(url_for('login'))
    return render_template('login.html')

@app.route('/logout')
def logout():
    """Route for logging out the admin."""
    session.pop('logged_in', None)
    flash('You have been logged out.', 'success')
    return redirect(url_for('login'))

@app.route('/booking')
def booking_form():
    """Duplicate route for the lab booking form."""
    return render_template('index.html')

@app.route('/equipment')
def equipment_booking_form():
    """Route for the public equipment booking form."""
    return render_template('equipment.html')

# --- NEW: ADMIN PANEL ROUTE ---
@app.route('/admin_panel')
@login_required
def admin_panel():
    """Displays the admin-only control panel."""
    return render_template('admin_panel.html')

# --- API ENDPOINTS ---

# --- Public APIs ---

@app.route('/api/getBookedSlots', methods=['GET'])
def get_booked_slots():
    """API to get booked lab slots for a specific date."""
    sheet = get_lab_booking_sheet()
    if not sheet: 
        return jsonify({'status': 'gagal', 'message': 'Failed to connect to the database'}), 503
    try:
        tanggal = request.args.get('tanggal')
        if not tanggal: 
            return jsonify({'status': 'gagal', 'message': 'Date parameter not found'}), 400
        
        all_records = sheet.get_all_records()
        booked_slots = [
            {'start': r.get('Waktu Mulai'), 'end': r.get('Waktu Selesai')} 
            for r in all_records 
            if str(r.get('Tanggal Booking')) == tanggal and r.get('Status') in ["Disetujui", "Menunggu Persetujuan", "Datang"]
        ]
        return jsonify({'status': 'sukses', 'data': booked_slots})
    except Exception as e: 
        return jsonify({'status': 'gagal', 'message': str(e)}), 500

@app.route('/api/getDashboardData', methods=['GET'])
def get_dashboard_data():
    """API to get all data for the dashboard."""
    sheet = get_lab_booking_sheet()
    if not sheet: 
        return jsonify({'status': 'gagal', 'message': 'Failed to connect to the database'}), 503
    try:
        all_records = sheet.get_all_records()
        clean_records = [record for record in all_records if record.get('ID Baris')]
        return jsonify({'status': 'sukses', 'data': clean_records})
    except Exception as e:
        return jsonify({'status': 'gagal', 'message': str(e)}), 500

@app.route('/api/submitBooking', methods=['POST'])
def handle_form_submission():
    """API to handle the public lab booking form submission."""
    sheet = get_lab_booking_sheet()
    if not sheet: 
        return jsonify({'status': 'gagal', 'message': 'Failed to connect to the database'}), 503
    try:
        data = request.form.to_dict()
        all_records = sheet.get_all_records()
        new_start = time_to_minutes(data['waktuMulai'])
        new_end = time_to_minutes(data['waktuSelesai'])

        # Check for conflicts
        for record in all_records:
            if str(record.get('Tanggal Booking')) == data['tanggalBooking'] and record.get('Status') in ["Disetujui", "Menunggu Persetujuan", "Datang"]:
                existing_start = time_to_minutes(record.get('Waktu Mulai'))
                existing_end = time_to_minutes(record.get('Waktu Selesai'))
                if new_start < existing_end and existing_start < new_end: 
                    return jsonify({'status': 'gagal', 'message': 'The schedule at that time is already booked.'})
        
        purpose = data.get('bookingPurpose')
        final_purpose = data.get('otherPurpose', 'Other - not specified') if purpose == 'Other' else purpose
        data['finalPurpose'] = final_purpose

        import uuid
        row_id = str(uuid.uuid4())
        
        new_row = [
            datetime.now().isoformat(), 
            data['nama'], data['idPengguna'], data['emailPengguna'],
            data['tanggalBooking'], data['waktuMulai'], data['waktuSelesai'],
            final_purpose, data.get('jumlahOrang', '1'), "Menunggu Persetujuan", row_id
        ]
        sheet.append_row(new_row, value_input_option='USER_ENTERED')
        
        email_body = create_approval_email_body(data, row_id)
        send_email(LAB_HEAD_EMAIL, f"New Lab Booking Request: {data['nama']}", email_body)
        
        return jsonify({'status': 'sukses', 'message': 'Booking request submitted successfully!'})
    except Exception as e: 
        return jsonify({'status': 'gagal', 'message': str(e)}), 500

@app.route('/api/submitEquipmentBooking', methods=['POST'])
def handle_equipment_submission():
    """API to handle the public equipment borrowing form submission."""
    sheet = get_equipment_sheet()
    if not sheet: 
        return jsonify({'status': 'gagal', 'message': 'Failed to connect to the equipment database'}), 503
    try:
        data = request.form.to_dict()
        import uuid
        row_id = str(uuid.uuid4())
        items_borrowed_json = data.get('itemsBorrowed', '{}')

        new_row = [
            datetime.now().isoformat(),
            data.get('nama'), data.get('idPengguna'), data.get('emailPengguna'),
            data.get('waNumber'), data.get('pickupDateTime'), data.get('returnDateTime'),
            data.get('purpose'), items_borrowed_json,
            "Menunggu Persetujuan",  # Initial Status
            row_id
        ]
        
        sheet.append_row(new_row, value_input_option='USER_ENTERED')
        
        email_body = create_equipment_approval_email(data, row_id)
        send_email(LAB_HEAD_EMAIL, f"New Equipment Borrowing Request: {data.get('nama')}", email_body)
        
        return jsonify({'status': 'success', 'message': 'Equipment borrowing request submitted successfully!'})
    except Exception as e: 
        print(f"Error in submitEquipmentBooking: {e}")
        return jsonify({'status': 'gagal', 'message': str(e)}), 500

# --- ADMIN-ONLY APIs ---

@app.route('/api/admin_lab_booking', methods=['POST'])
@login_required
def handle_admin_lab_booking():
    """API for admins to book a lab (auto-approved)."""
    sheet = get_lab_booking_sheet()
    if not sheet: 
        return jsonify({'status': 'gagal', 'message': 'Failed to connect to the database'}), 503
    
    try:
        data = request.form.to_dict()
        all_records = sheet.get_all_records()
        new_start = time_to_minutes(data['waktuMulai'])
        new_end = time_to_minutes(data['waktuSelesai'])

        # Check for conflicts
        for record in all_records:
            if str(record.get('Tanggal Booking')) == data['tanggalBooking'] and record.get('Status') in ["Disetujui", "Datang"]:
                existing_start = time_to_minutes(record.get('Waktu Mulai'))
                existing_end = time_to_minutes(record.get('Waktu Selesai'))
                if new_start < existing_end and existing_start < new_end: 
                    return jsonify({'status': 'gagal', 'message': 'The schedule at that time is already booked by another user.'})
        
        import uuid
        row_id = str(uuid.uuid4())
        
        new_row = [
            datetime.now().isoformat(), 
            f"[ADMIN] {data['nama']}", data['idPengguna'], data['emailPengguna'],
            data['tanggalBooking'], data['waktuMulai'], data['waktuSelesai'],
            data.get('purpose', 'Admin Booking'), data.get('jumlahOrang', '1'), 
            "Disetujui", # Auto-approved
            row_id
        ]
        sheet.append_row(new_row, value_input_option='USER_ENTERED')
        
        return jsonify({'status': 'success', 'message': 'Admin booking created and auto-approved!'})
    except Exception as e: 
        return jsonify({'status': 'gagal', 'message': str(e)}), 500

@app.route('/api/admin_equipment_booking', methods=['POST'])
@login_required
def handle_admin_equipment_booking():
    """API for admins to borrow equipment (auto-approved)."""
    sheet = get_equipment_sheet()
    if not sheet: 
        return jsonify({'status': 'gagal', 'message': 'Failed to connect to the equipment database'}), 503
    
    try:
        data = request.form.to_dict()
        import uuid
        row_id = str(uuid.uuid4())
        
        # Admin can borrow any item, so we just parse the text
        items_borrowed = data.get('equipmentList', 'No items listed')

        new_row = [
            datetime.now().isoformat(),
            f"[ADMIN] {data.get('nama')}", data.get('idPengguna'), data.get('emailPengguna'),
            data.get('waNumber'), data.get('pickupDateTime'), data.get('returnDateTime'),
            data.get('purpose'), 
            items_borrowed, # Store the raw text
            "Disetujui",  # Auto-approved
            row_id
        ]
        
        sheet.append_row(new_row, value_input_option='USER_ENTERED')
        
        return jsonify({'status': 'success', 'message': 'Admin equipment loan created and auto-approved!'})
    except Exception as e: 
        print(f"Error in adminEquipmentBooking: {e}")
        return jsonify({'status': 'gagal', 'message': str(e)}), 500

# --- ACTION ROUTES (LAB BOOKING) ---
@app.route('/<action>', methods=['GET'])
def handle_action(action):
    """Handles lab booking actions (approve, reject, checkin, checkout)."""
    row_id = request.args.get('id')
    if not row_id: 
        return "Error: ID not found.", 400
    
    if action not in ['approve', 'reject', 'checkin', 'checkout']:
        return "Invalid action.", 400

    sheet = get_lab_booking_sheet() 
    if not sheet: 
        return render_template('konfirmasi.html', message="Failed to connect to the database.", status="gagal"), 503

    try:
        cell = sheet.find(row_id, in_column=11) # Row ID is in Column K
        if not cell: 
            return render_template('konfirmasi.html', message="Booking data not found or already processed.", status="gagal"), 404
        
        row_values = sheet.row_values(cell.row)
        user_data = {
            'nama': row_values[1], 'emailPengguna': row_values[3], 
            'tanggalBooking': row_values[4], 'waktuMulai': row_values[5], 
            'waktuSelesai': row_values[6]
        }
        status_col = 10 # Status is in Column J
        
        if action == 'approve':
            sheet.update_cell(cell.row, status_col, "Disetujui")
            checkin_url = f"{APP_URL}/checkin?id={row_id}"
            qr_img = qrcode.make(checkin_url)
            img_bytes = BytesIO()
            qr_img.save(img_bytes, format='PNG')
            img_bytes.seek(0)
            email_body = create_approved_email_body(user_data, checkin_url)
            send_email(user_data['emailPengguna'], "Your Lab Booking Has Been Approved!", email_body, qr_image_bytes=img_bytes.read())
            message = f"Booking for {user_data['nama']} has been successfully APPROVED."
            return render_template('konfirmasi.html', message=message, status="sukses")
            
        elif action == 'reject':
            sheet.update_cell(cell.row, status_col, "Ditolak")
            email_body = create_rejected_email_body(user_data)
            send_email(user_data['emailPengguna'], "Your Lab Booking Request Was Rejected", email_body)
            message = f"Booking for {user_data['nama']} has been REJECTED."
            return render_template('konfirmasi.html', message=message, status="gagal")

        elif action == 'checkin':
            sheet.update_cell(cell.row, status_col, "Datang")
            tanggal = datetime.strptime(user_data['tanggalBooking'], '%Y-%m-%d').strftime('%d/%m/%Y')
            message = f"Check-in for {user_data['nama']} for the schedule {tanggal}, {user_data['waktuMulai']} - {user_data['waktuSelesai']} has been successful."
            return render_template('konfirmasi.html', message=message, status="sukses")
        
        elif action == 'checkout':
            sheet.update_cell(cell.row, status_col, "Selesai")
            message = f"Check-out for {user_data['nama']} has been successful. Thank you!"
            return render_template('konfirmasi.html', message=message, status="sukses")

    except Exception as e: 
        return render_template('konfirmasi.html', message=f"An error occurred: {e}", status="gagal"), 500

# --- ACTION ROUTES (EQUIPMENT BOOKING) ---

@app.route('/equipment_approve', methods=['GET'])
def handle_equipment_approve():
    """Handles equipment approval."""
    row_id = request.args.get('id')
    if not row_id: return "Error: ID not found.", 400
    
    sheet = get_equipment_sheet()
    if not sheet: return render_template('konfirmasi.html', message="Failed to connect to the equipment database.", status="gagal"), 503

    try:
        cell = sheet.find(row_id, in_column=11) # Row ID is in Column K
        if not cell: return render_template('konfirmasi.html', message="Borrowing data not found or already processed.", status="gagal"), 404

        row_values = sheet.row_values(cell.row)
        user_data = {
            'nama': row_values[1], 
            'emailPengguna': row_values[3],
            'pickupDateTime': row_values[5],
            'returnDateTime': row_values[6]
        }
        status_col = 10 # Status is in Column J
        
        sheet.update_cell(cell.row, status_col, "Disetujui")
        
        email_body = create_equipment_approved_email(user_data)
        send_email(user_data['emailPengguna'], "Your Equipment Loan Has Been Approved!", email_body)
        
        message = f"Equipment loan for {user_data['nama']} has been successfully APPROVED."
        return render_template('konfirmasi.html', message=message, status="sukses")

    except Exception as e:
        return render_template('konfirmasi.html', message=f"An error occurred: {e}", status="gagal"), 500

@app.route('/equipment_reject', methods=['GET'])
def handle_equipment_reject():
    """Handles equipment rejection."""
    row_id = request.args.get('id')
    if not row_id: return "Error: ID not found.", 400
    
    sheet = get_equipment_sheet()
    if not sheet: return render_template('konfirmasi.html', message="Failed to connect to the equipment database.", status="gagal"), 503

    try:
        cell = sheet.find(row_id, in_column=11) # Row ID is in Column K
        if not cell: return render_template('konfirmasi.html', message="Borrowing data not found or already processed.", status="gagal"), 404

        row_values = sheet.row_values(cell.row)
        user_data = {'nama': row_values[1], 'emailPengguna': row_values[3]}
        status_col = 10 # Status is in Column J
        
        sheet.update_cell(cell.row, status_col, "Ditolak")
        
        email_body = create_equipment_rejected_email(user_data)
        send_email(user_data['emailPengguna'], "Your Equipment Loan Request Was Rejected", email_body)
        
        message = f"Equipment loan for {user_data['nama']} has been REJECTED."
        return render_template('konfirmasi.html', message=message, status="gagal")

    except Exception as e:
        return render_template('konfirmasi.html', message=f"An error occurred: {e}", status="gagal"), 500

# --- Run the Application ---
if __name__ == '__main__':
    app.run(debug=True, port=5000)


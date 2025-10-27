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

# --- INISIALISASI ---
load_dotenv()
app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)
# Kunci rahasia untuk session login (wajib ada)
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-key-jangan-digunakan-di-prod")

# --- KONFIGURASI DARI ENVIRONMENT VARIABLES ---
SHEET_ID = os.getenv("SHEET_ID")
SHEET_NAME = os.getenv("SHEET_NAME")
APP_URL = os.getenv("APP_URL")
SMTP_SERVER = os.getenv("SMTP_SERVER")
SMTP_PORT = os.getenv("SMTP_PORT")
SMTP_SENDER_EMAIL = os.getenv("SMTP_SENDER_EMAIL")
SMTP_SENDER_PASSWORD = os.getenv("SMTP_SENDER_PASSWORD")
LAB_HEAD_EMAIL = os.getenv("LAB_HEAD_EMAIL")
GOOGLE_CREDENTIALS_BASE64 = os.getenv("GOOGLE_CREDENTIALS_BASE64")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

# --- FUNGSI KONEKSI GOOGLE SHEETS ---
def get_lab_booking_sheet():
    """
    Menghubungkan ke Google Sheets (Sheet Lab Booking) menggunakan kredensial Base64.
    """
    try:
        if not GOOGLE_CREDENTIALS_BASE64:
            print("Environment variable GOOGLE_CREDENTIALS_BASE64 not found.")
            return None
        
        creds_json_str = base64.b64decode(GOOGLE_CREDENTIALS_BASE64).decode('utf-8')
        creds_dict = json.loads(creds_json_str)

        scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
        creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, scope)
        client = gspread.authorize(creds)
        sheet = client.open_by_key(SHEET_ID).worksheet(SHEET_NAME)
        print("Successfully connected to Google Sheets (Lab Booking).")
        return sheet
    except Exception as e:
        print(f"FAILED TO CONNECT TO GOOGLE SHEETS (Lab Booking): {e}")
        return None

# --- FUNGSI HELPER & TEMPLATE EMAIL ---
def time_to_minutes(time_str):
    """Mengubah string waktu 'HH:MM' menjadi total menit."""
    if isinstance(time_str, str) and ':' in time_str:
        h, m = map(int, time_str.split(':'))
        return h * 60 + m
    return 0

def send_email(to_address, subject, html_body, qr_image_bytes=None):
    """Mengirim email dengan atau tanpa lampiran QR code."""
    try:
        port = int(SMTP_PORT or 587) # Default ke port 587 jika tidak diset
        msg = MIMEMultipart('related')
        msg['From'] = f"Booking Lab Sampoerna <{SMTP_SENDER_EMAIL}>"
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

def create_approval_email_body(data, row_id):
    """Membuat badan email HTML untuk persetujuan kepala lab (Lab Booking)."""
    approve_url = f"{APP_URL}/approve?id={row_id}"
    reject_url = f"{APP_URL}/reject?id={row_id}"
    
    return f"""
    <p>There is a new lab booking request with the following details:</p>
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
    """Membuat badan email HTML untuk pengguna setelah disetujui (dengan QR Code)."""
    formatted_date = datetime.strptime(user_data.get('tanggalBooking', ''), '%Y-%m-%d').strftime('%d/%m/%Y')
    return f"""
    <html><body><h2>Hello {user_data.get('nama')},</h2>
      <p>Your lab booking request for the following schedule has been approved:</p>
      <ul><li><b>Date:</b> {formatted_date}</li><li><b>Time:</b> {user_data.get('waktuMulai')} - {user_data.get('waktuSelesai')}</li></ul>
      <p>Please scan the QR Code below to check-in.</p>
      <div style="padding: 20px;"><img src="cid:qr_code_image" alt="QR Code"></div>
      <p>Or click this link for manual check-in: <a href="{checkin_url}">Manual Check-in Link</a></p></body></html>
    """

def create_rejected_email_body(data):
    """Membuat badan email HTML untuk pengguna setelah ditolak."""
    formatted_date = datetime.strptime(data.get('tanggalBooking', ''), '%Y-%m-%d').strftime('%d/%m/%Y')
    return f"""
    <h2>Hello {data.get('nama')},</h2>
    <p>We regret to inform you that your lab booking request could not be approved at this time:</p>
    <ul><li><b>Date:</b> {formatted_date}</li><li><b>Time:</b> {data.get('waktuMulai')} - {data.get('waktuSelesai')}</li></ul>
    <p>Please contact the lab administration for more information.</p>
    """

# --- DECORATOR UNTUK LOGIN ---
def login_required(f):
    """Decorator untuk membatasi akses ke rute tertentu."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# --- ENDPOINTS / ROUTES ---

@app.route('/')
def home():
    """Rute utama, menampilkan formulir booking lab."""
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    """Rute untuk dashboard (publik)."""
    return render_template('dashboard.html')

@app.route('/scan')
def scan_qr():
    """Rute untuk halaman scan QR (publik)."""
    return render_template('scan.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Rute untuk login admin."""
    if request.method == 'POST':
        email = request.form['username']
        password = request.form['password']
        if email == ADMIN_USERNAME and password == ADMIN_PASSWORD:
            session['logged_in'] = True
            flash('Login successful!', 'success')
            return redirect(url_for('dashboard')) # Arahkan ke dashboard setelah login
        else:
            flash('Invalid Credentials. Please try again.', 'error')
            return redirect(url_for('login'))
    return render_template('login.html')

@app.route('/logout')
def logout():
    """Rute untuk logout admin."""
    session.pop('logged_in', None)
    return redirect(url_for('login'))

@app.route('/booking')
def booking_form():
    """Rute duplikat untuk formulir booking lab."""
    return render_template('index.html')

# --- RUTE BARU UNTUK HALAMAN EQUIPMENT ---
@app.route('/equipment')
def equipment_booking_form():
    """Menampilkan halaman form peminjaman alat."""
    return render_template('equipment_booking.html')

# --- ENDPOINTS / API ---

@app.route('/api/getBookedSlots', methods=['GET'])
def get_booked_slots():
    """API untuk mengambil slot waktu yang sudah dibooking pada tanggal tertentu."""
    sheet = get_lab_booking_sheet()
    if not sheet: 
        return jsonify({'status': 'error', 'message': 'Database connection failed'}), 503
    try:
        tanggal = request.args.get('tanggal')
        if not tanggal: 
            return jsonify({'status': 'error', 'message': 'Date parameter not found'}), 400
        
        all_records = sheet.get_all_records()
        booked_slots = [
            {'start': r.get('Waktu Mulai'), 'end': r.get('Waktu Selesai')} 
            for r in all_records 
            if str(r.get('Tanggal Booking')) == tanggal and r.get('Status') in ["Disetujui", "Menunggu Persetujuan", "Datang"]
        ]
        return jsonify({'status': 'success', 'data': booked_slots})
    except Exception as e: 
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/getDashboardData', methods=['GET'])
def get_dashboard_data():
    """API untuk mengambil semua data untuk dashboard."""
    sheet = get_lab_booking_sheet()
    if not sheet: 
        return jsonify({'status': 'error', 'message': 'Database connection failed'}), 503
    try:
        all_records = sheet.get_all_records()
        clean_records = [record for record in all_records if record.get('ID Baris')]
        return jsonify({'status': 'success', 'data': clean_records})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/submitBooking', methods=['POST'])
def handle_form_submission():
    """API untuk menerima data formulir booking lab."""
    sheet = get_lab_booking_sheet()
    if not sheet: 
        return jsonify({'status': 'error', 'message': 'Database connection failed'}), 503
    try:
        data = request.form.to_dict()
        all_records = sheet.get_all_records()
        new_start = time_to_minutes(data['waktuMulai'])
        new_end = time_to_minutes(data['waktuSelesai'])

        for record in all_records:
            if str(record.get('Tanggal Booking')) == data['tanggalBooking'] and record.get('Status') in ["Disetujui", "Menunggu Persetujuan", "Datang"]:
                existing_start = time_to_minutes(record.get('Waktu Mulai'))
                existing_end = time_to_minutes(record.get('Waktu Selesai'))
                if new_start < existing_end and existing_start < new_end: 
                    return jsonify({'status': 'error', 'message': 'The schedule at this time is already booked.'})
        
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
        
        return jsonify({'status': 'success', 'message': 'Booking request sent successfully!'})
    except Exception as e: 
        return jsonify({'status': 'error', 'message': str(e)}), 500

# --- API BARU UNTUK EQUIPMENT (MASIH PLACEHOLDER) ---
@app.route('/api/submitEquipmentBooking', methods=['POST'])
def handle_equipment_submission():
    """
    API untuk menerima data formulir peminjaman alat.
    (Saat ini hanya placeholder, belum terhubung ke Google Sheet)
    """
    try:
        data = request.form.to_dict()
        print("Equipment Borrowing Data Received:", data)
        # TODO: Implement logic to save to a separate equipment sheet
        # TODO: Implement logic to send equipment approval email
        
        return jsonify({'status': 'success', 'message': 'Equipment borrowing request sent!'})
    except Exception as e: 
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/<action>', methods=['GET'])
def handle_action(action):
    """Rute serbaguna untuk menangani aksi (approve, reject, checkin, checkout)."""
    row_id = request.args.get('id')
    if not row_id: 
        return "Error: ID not found.", 400
    
    # TODO: Logika ini perlu di-update untuk menangani DUA sheet (lab dan equipment)
    
    sheet = get_lab_booking_sheet() # Asumsi ini hanya untuk lab booking
    if not sheet: 
        return render_template('konfirmasi.html', message="Database connection failed.", status="error"), 503

    try:
        # ID Baris ada di kolom 11 (K)
        cell = sheet.find(row_id, in_column=11) 
        if not cell: 
            return render_template('konfirmasi.html', message="Booking data not found or already processed.", status="error"), 404
        
        row_values = sheet.row_values(cell.row)
        user_data = {
            'nama': row_values[1], 
            'emailPengguna': row_values[3], 
            'tanggalBooking': row_values[4], 
            'waktuMulai': row_values[5], 
            'waktuSelesai': row_values[6]
        }
        # Kolom Status ada di kolom 10 (J)
        status_col = 10
        
        if action == 'approve':
            sheet.update_cell(cell.row, status_col, "Disetujui")
            checkin_url = f"{APP_URL}/checkin?id={row_id}"
            qr_img = qrcode.make(checkin_url)
            img_bytes = BytesIO()
            qr_img.save(img_bytes, format='PNG')
            img_bytes.seek(0)
            email_body = create_approved_email_body(user_data, checkin_url)
            send_email(user_data['emailPengguna'], "Your Lab Booking has been Approved!", email_body, qr_image_bytes=img_bytes.read())
            message = f"Booking for {user_data['nama']} has been successfully APPROVED."
            return render_template('konfirmasi.html', message=message, status="success")
            
        elif action == 'reject':
            sheet.update_cell(cell.row, status_col, "Ditolak")
            email_body = create_rejected_email_body(user_data)
            send_email(user_data['emailPengguna'], "Your Lab Booking Request was Rejected", email_body)
            message = f"Booking for {user_data['nama']} has been REJECTED."
            return render_template('konfirmasi.html', message=message, status="error")

        elif action == 'checkin':
            sheet.update_cell(cell.row, status_col, "Datang")
            tanggal = datetime.strptime(user_data['tanggalBooking'], '%Y-%m-%d').strftime('%d/%m/%Y')
            message = f"Check-in for {user_data['nama']} for the schedule {tanggal}, {user_data['waktuMulai']} - {user_data['waktuSelesai']} was successful."
            return render_template('konfirmasi.html', message=message, status="success")
        
        elif action == 'checkout':
            sheet.update_cell(cell.row, status_col, "Selesai")
            message = f"Check-out for {user_data['nama']} was successful. Thank you!"
            return render_template('konfirmasi.html', message=message, status="success")

        else: 
            return "Invalid action.", 400
            
    except Exception as e: 
        return render_template('konfirmasi.html', message=f"An error occurred: {e}", status="error"), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)


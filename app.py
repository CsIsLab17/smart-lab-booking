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
from functools import wraps # Diperlukan untuk decorator
from oauth2client.service_account import ServiceAccountCredentials
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage

# --- INISIALISASI ---
load_dotenv()
app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# --- Kunci rahasia untuk session login ---
app.secret_key = os.getenv("SECRET_KEY", "LfB@(Vbzdtw5^Fp/q=U4{88y[NOn}<")

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
# Variabel baru untuk admin login
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")


# --- FUNGSI KONEKSI GOOGLE SHEETS ---
def get_sheet():
    try:
        if not GOOGLE_CREDENTIALS_BASE64:
            print("Environment variable GOOGLE_CREDENTIALS_BASE64 tidak ditemukan.")
            return None
        creds_json_str = base64.b64decode(GOOGLE_CREDENTIALS_BASE64).decode('utf-8')
        creds_dict = json.loads(creds_json_str)
        scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
        creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, scope)
        client = gspread.authorize(creds)
        sheet = client.open_by_key(SHEET_ID).worksheet(SHEET_NAME)
        print("Berhasil terhubung ke Google Sheets.")
        return sheet
    except Exception as e:
        print(f"GAGAL KONEK KE GOOGLE SHEETS: {e}")
        return None

# --- FUNGSI HELPER & EMAIL ---
def time_to_minutes(time_str):
    if isinstance(time_str, str) and ':' in time_str:
        h, m = map(int, time_str.split(':'))
        return h * 60 + m
    return 0

def send_email(to_address, subject, html_body, qr_image_bytes=None):
    try:
        port = int(SMTP_PORT or 587)
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
            print(f"Email berhasil dikirim ke {to_address}")
    except Exception as e:
        print(f"Gagal mengirim email: {e}")

def create_approval_email_body(data, row_id):
    approve_url = f"{APP_URL}/approve?id={row_id}"
    reject_url = f"{APP_URL}/reject?id={row_id}"
    return f"""<p>Ada permintaan booking lab baru...</p>
    <a href="{approve_url}">SETUJUI</a>
    <a href="{reject_url}">TOLAK</a>"""

def create_approved_email_body(user_data, checkin_url):
    formatted_date = datetime.strptime(user_data.get('tanggalBooking', ''), '%Y-%m-%d').strftime('%d/%m/%Y')
    return f"""<html><body><h2>Halo {user_data.get('nama')},</h2>
      <p>...telah disetujui...</p>
      <div style="padding: 20px;"><img src="cid:qr_code_image" alt="QR Code"></div>
      <p>Atau klik link ini: <a href="{checkin_url}">Link Check-in Manual</a></p></body></html>"""

def create_rejected_email_body(data):
    formatted_date = datetime.strptime(data.get('tanggalBooking', ''), '%Y-%m-%d').strftime('%d/%m/%Y')
    return f"""<h2>Halo {data.get('nama')},</h2>
    <p>...permintaan booking lab Anda tidak dapat disetujui...</p>"""


# --- DECORATOR UNTUK MELINDUNGI HALAMAN ---
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# --- ENDPOINTS / ROUTES ---

@app.route('/')
def home():
    return render_template('index.html')

# --- PERUBAHAN: Halaman Dashboard sekarang PUBLIK ---
@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

# --- PERUBAHAN: Halaman Scan sekarang PUBLIK ---
@app.route('/scan')
def scan_qr():
    return render_template('scan.html')

# --- Rute Login dengan logika verifikasi (Tetap sama) ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['username']
        password = request.form['password']
        
        if email == ADMIN_USERNAME and password == ADMIN_PASSWORD:
            session['logged_in'] = True
            # Nanti kita akan arahkan ke halaman admin khusus
            return redirect(url_for('dashboard')) # Untuk sementara, arahkan ke dashboard
        else:
            flash('Invalid Credentials. Please try again.', 'error')
            return redirect(url_for('login'))
    
    return render_template('login.html')

# --- Rute Logout baru (Tetap sama) ---
@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    return redirect(url_for('login'))

@app.route('/booking')
def booking_form():
    return render_template('index.html')

# --- (Semua Rute API Anda tetap sama) ---
@app.route('/api/getBookedSlots', methods=['GET'])
def get_booked_slots():
    sheet = get_sheet()
    if not sheet: return jsonify({'status': 'gagal', 'message': 'Koneksi ke database gagal'}), 503
    try:
        tanggal = request.args.get('tanggal')
        if not tanggal: return jsonify({'status': 'gagal', 'message': 'Parameter tanggal tidak ditemukan'}), 400
        all_records = sheet.get_all_records()
        booked_slots = [{'start': r.get('Waktu Mulai'), 'end': r.get('Waktu Selesai')} for r in all_records if str(r.get('Tanggal Booking')) == tanggal and r.get('Status') in ["Disetujui", "Menunggu Persetujuan", "Datang"]]
        return jsonify({'status': 'sukses', 'data': booked_slots})
    except Exception as e: return jsonify({'status': 'gagal', 'message': str(e)}), 500

@app.route('/api/getDashboardData', methods=['GET'])
def get_dashboard_data():
    sheet = get_sheet()
    if not sheet: return jsonify({'status': 'gagal', 'message': 'Koneksi ke database gagal'}), 503
    try:
        all_records = sheet.get_all_records()
        clean_records = [record for record in all_records if record.get('ID Baris')]
        return jsonify({'status': 'sukses', 'data': clean_records})
    except Exception as e: return jsonify({'status': 'gagal', 'message': str(e)}), 500

@app.route('/api/submitBooking', methods=['POST'])
def handle_form_submission():
    sheet = get_sheet()
    if not sheet: return jsonify({'status': 'gagal', 'message': 'Koneksi ke database gagal'}), 503
    try:
        data = request.form.to_dict()
        all_records = sheet.get_all_records()
        new_start = time_to_minutes(data['waktuMulai'])
        new_end = time_to_minutes(data['waktuSelesai'])
        for record in all_records:
            if str(record.get('Tanggal Booking')) == data['tanggalBooking'] and record.get('Status') in ["Disetujui", "Menunggu Persetujuan", "Datang"]:
                existing_start = time_to_minutes(record.get('Waktu Mulai'))
                existing_end = time_to_minutes(record.get('Waktu Selesai'))
                if new_start < existing_end and existing_start < new_end: return jsonify({'status': 'gagal', 'message': 'Jadwal pada jam tersebut sudah terisi.'})
        purpose = data.get('bookingPurpose')
        final_purpose = data.get('otherPurpose', 'Other - tidak spesifik') if purpose == 'Other' else purpose
        data['finalPurpose'] = final_purpose
        import uuid
        row_id = str(uuid.uuid4())
        new_row = [
            datetime.now().isoformat(), data['nama'], data['idPengguna'], data['emailPengguna'],
            data['tanggalBooking'], data['waktuMulai'], data['waktuSelesai'],
            final_purpose, "Menunggu Persetujuan", row_id
        ]
        sheet.append_row(new_row, value_input_option='USER_ENTERED')
        email_body = create_approval_email_body(data, row_id)
        send_email(LAB_HEAD_EMAIL, f"Permintaan Booking Lab Baru: {data['nama']}", email_body)
        return jsonify({'status': 'sukses', 'message': 'Permintaan booking terkirim!'})
    except Exception as e: return jsonify({'status': 'gagal', 'message': str(e)}), 500

@app.route('/<action>', methods=['GET'])
def handle_action(action):
    row_id = request.args.get('id')
    if not row_id: return "Error: ID tidak ditemukan.", 400
    
    sheet = get_sheet()
    if not sheet: return render_template('konfirmasi.html', message="Koneksi ke database gagal.", status="gagal"), 503

    try:
        cell = sheet.find(row_id, in_column=10) 
        if not cell: return render_template('konfirmasi.html', message="Data booking tidak ditemukan atau sudah diproses.", status="gagal"), 404
        
        row_values = sheet.row_values(cell.row)
        user_data = {'nama': row_values[1], 'emailPengguna': row_values[3], 'tanggalBooking': row_values[4], 'waktuMulai': row_values[5], 'waktuSelesai': row_values[6]}
        status_col = 9
        
        if action == 'approve':
            sheet.update_cell(cell.row, status_col, "Disetujui")
            checkin_url = f"{APP_URL}/checkin?id={row_id}"
            qr_img = qrcode.make(checkin_url)
            img_bytes = BytesIO()
            qr_img.save(img_bytes, format='PNG')
            img_bytes.seek(0)
            email_body = create_approved_email_body(user_data, checkin_url)
            send_email(user_data['emailPengguna'], "Booking Lab Anda Telah Disetujui!", email_body, qr_image_bytes=img_bytes.read())
            message = f"Booking untuk {user_data['nama']} telah berhasil DISETUJUI."
            return render_template('konfirmasi.html', message=message, status="sukses")
            
        elif action == 'reject':
            sheet.update_cell(cell.row, status_col, "Ditolak")
            email_body = create_rejected_email_body(user_data)
            send_email(user_data['emailPengguna'], "Permintaan Booking Lab Anda Ditolak", email_body)
            message = f"Booking untuk {user_data['nama']} telah DITOLAK."
            return render_template('konfirmasi.html', message=message, status="gagal")

        elif action == 'checkin':
            sheet.update_cell(cell.row, status_col, "Datang")
            tanggal = datetime.strptime(user_data['tanggalBooking'], '%Y-%m-%d').strftime('%d/%m/%Y')
            message = f"Check-in atas nama {user_data['nama']} untuk jadwal {tanggal}, {user_data['waktuMulai']} - {user_data['waktuSelesai']} telah berhasil."
            return render_template('konfirmasi.html', message=message, status="sukses")
        
        elif action == 'checkout':
            sheet.update_cell(cell.row, status_col, "Selesai")
            message = f"Check-out atas nama {user_data['nama']} telah berhasil. Terima kasih!"
            return render_template('konfirmasi.html', message=message, status="sukses")

        else: return "Aksi tidak valid.", 400
    except Exception as e: return render_template('konfirmasi.html', message=f"Terjadi kesalahan: {e}", status="gagal"), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)


// --- KONFIGURASI ---
const BASE_URL = "http://127.0.0.1:5000";

// --- ELEMEN DOM ---
const form = document.getElementById('bookingForm');
const statusMessage = document.getElementById('statusMessage');
const submitButton = document.getElementById('submitButton');
const namaInput = document.getElementById('nama');
const idInput = document.getElementById('idPengguna');
const emailInput = document.getElementById('emailPengguna');
const tanggalBookingInput = document.getElementById('tanggalBooking');
const waktuMulaiSelect = document.getElementById('waktuMulai');
const waktuSelesaiSelect = document.getElementById('waktuSelesai');
const purposeSelect = document.getElementById('bookingPurpose');
const otherPurposeContainer = document.getElementById('other-purpose-container');
const otherPurposeInput = document.getElementById('otherPurpose');

let bookedSlotsForSelectedDate = [];

// --- FUNGSI HELPER ---
function timeToMinutes(time) {
    if (typeof time !== 'string' || !time.includes(':')) return 0;
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

async function fetchBookedSlots(date) {
    if (!date) {
        bookedSlotsForSelectedDate = [];
        populateTimeSlots();
        return;
    }
    statusMessage.innerText = "Checking schedule...";
    statusMessage.className = '';
    submitButton.disabled = true;
    try {
        const response = await fetch(`${BASE_URL}/api/getBookedSlots?tanggal=${date}`);
        const result = await response.json();
        if (result.status === 'sukses') {
            bookedSlotsForSelectedDate = result.data.map(slot => ({
                start: timeToMinutes(slot.start),
                end: timeToMinutes(slot.end)
            }));
            statusMessage.innerText = "Schedule loaded. Please select a time.";
            statusMessage.className = 'status-sukses';
        } else { throw new Error(result.message || 'Failed to fetch data.'); }
    } catch (error) {
        console.error('Error fetching booked slots:', error);
        statusMessage.innerText = `Failed to load schedule. Please try again later.`;
        statusMessage.className = 'status-gagal';
        bookedSlotsForSelectedDate = [];
    } finally {
        populateTimeSlots();
    }
}

// ======================================================================
// FUNGSI DIPERBARUI: populateTimeSlots dengan validasi waktu lampau
// ======================================================================
function populateTimeSlots() {
    const lastSelectedStart = waktuMulaiSelect.value;
    const lastSelectedEnd = waktuSelesaiSelect.value;
    waktuMulaiSelect.innerHTML = '<option value="">Select Time</option>';
    waktuSelesaiSelect.innerHTML = '<option value="">Select Time</option>';

    // Dapatkan tanggal dan waktu saat ini untuk perbandingan
    const now = new Date();
    const currentDateStr = now.toISOString().split('T')[0];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const selectedDateStr = tanggalBookingInput.value;
    const isToday = (selectedDateStr === currentDateStr);

    const startTime = 8 * 60, endTime = 17 * 60, interval = 30;

    for (let i = startTime; i <= endTime; i += interval) {
        const hours = Math.floor(i / 60).toString().padStart(2, '0');
        const minutes = (i % 60).toString().padStart(2, '0');
        const timeString = `${hours}:${minutes}`;
        const slotTimeInMinutes = i;

        // Cek apakah slot sudah dibooking
        let isBooked = false;
        for (const slot of bookedSlotsForSelectedDate) {
            if (slotTimeInMinutes >= slot.start && slotTimeInMinutes < slot.end) {
                isBooked = true;
                break;
            }
        }

        // LOGIKA BARU: Cek apakah waktu slot sudah terlewat untuk hari ini
        let isPastTime = false;
        if (isToday && slotTimeInMinutes < currentMinutes) {
            isPastTime = true;
        }

        // Logika untuk dropdown Waktu Mulai
        if (i < endTime) {
            const startOption = new Option(timeString, timeString);
            if (isBooked || isPastTime) {
                startOption.disabled = true;
                // Beri label yang sesuai kenapa nonaktif
                if (isBooked) {
                    startOption.innerText = `${timeString} (Booked)`;
                } else if (isPastTime) {
                    startOption.innerText = `${timeString} (Passed)`;
                }
            }
            waktuMulaiSelect.add(startOption);
        }

        // Logika untuk dropdown Waktu Selesai
        if (i > startTime) {
            const endOption = new Option(timeString, timeString);
            let isEndBooked = false; // Cek agar tidak bisa memilih waktu selesai di tengah booking orang
            for (const slot of bookedSlotsForSelectedDate) {
                if (slotTimeInMinutes > slot.start && slotTimeInMinutes <= slot.end) {
                    isEndBooked = true;
                    break;
                }
            }
            
            // Waktu selesai juga tidak boleh waktu yang sudah lewat
            let isEndPastTime = false;
            if (isToday && slotTimeInMinutes <= currentMinutes) { // Waktu selesai bisa pas dengan waktu sekarang
                isEndPastTime = true;
            }

            if(isEndBooked || isEndPastTime) {
                endOption.disabled = true;
                if (isEndBooked) {
                    endOption.innerText = `${timeString} (Booked)`;
                } else if (isEndPastTime) {
                    endOption.innerText = `${timeString} (Passed)`;
                }
            }
            waktuSelesaiSelect.add(endOption);
        }
    }
    waktuMulaiSelect.value = lastSelectedStart;
    waktuSelesaiSelect.value = lastSelectedEnd;
    validateForm();
}


function validateForm() { /* ... (tidak berubah dari sebelumnya) ... */ }
document.addEventListener('DOMContentLoaded', () => { /* ... (tidak berubah dari sebelumnya) ... */ });
tanggalBookingInput.addEventListener('change', function() { /* ... (tidak berubah dari sebelumnya) ... */ });
form.addEventListener('input', validateForm);
purposeSelect.addEventListener('change', function() { /* ... (tidak berubah dari sebelumnya) ... */ });
form.addEventListener('submit', function(e) { /* ... (tidak berubah dari sebelumnya) ... */ });


// KODE LENGKAP UNTUK FUNGSI YANG DISINGKAT DI ATAS (UNTUK REFERENSI)
function validateForm() {
    let allValid = true;
    let message = 'Time slot is available. Ready to submit.';
    const nameRegex = /^[A-Za-z\s]+$/;
    if (namaInput.value.trim() !== '' && !nameRegex.test(namaInput.value)) {
        message = 'Name can only contain letters and spaces.';
        allValid = false;
    }
    const idRegex = /^[0-9]+$/;
    if (idInput.value.trim() !== '' && !idRegex.test(idInput.value)) {
        message = 'NIM / User ID can only contain numbers.';
        allValid = false;
    }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@my\.sampoernauniversity\.ac\.id$/;
    if (emailInput.value.trim() !== '' && !emailRegex.test(emailInput.value)) {
        message = 'Email must use @my.sampoernauniversity.ac.id domain.';
        allValid = false;
    }
    const isNamaFilled = namaInput.value.trim() !== '';
    const isIdFilled = idInput.value.trim() !== '';
    const isEmailFilled = emailInput.value.trim() !== '';
    const isTanggalFilled = tanggalBookingInput.value !== '';
    const isWaktuMulaiFilled = waktuMulaiSelect.value !== '';
    const isWaktuSelesaiFilled = waktuSelesaiSelect.value !== '';
    const isPurposeFilled = purposeSelect.value !== '';
    let isOtherPurposeValid = true;
    if (purposeSelect.value === 'Other') {
        isOtherPurposeValid = otherPurposeInput.value.trim() !== '';
    }
    let isTimeDurationValid = false;
    if (isWaktuMulaiFilled && isWaktuSelesaiFilled) {
        const startTimeInMinutes = timeToMinutes(waktuMulaiSelect.value);
        const endTimeInMinutes = timeToMinutes(waktuSelesaiSelect.value);
        const duration = endTimeInMinutes - startTimeInMinutes;
        if (duration <= 0 || duration > 120) {
            allValid = false;
            message = 'End time must be after start time and duration max 2 hours.';
        } else {
            isTimeDurationValid = true;
        }
    }
    if (allValid && isNamaFilled && isIdFilled && isEmailFilled && isTanggalFilled && isWaktuMulaiFilled && isWaktuSelesaiFilled && isPurposeFilled && isOtherPurposeValid && isTimeDurationValid) {
        submitButton.disabled = false;
        statusMessage.innerText = message;
        statusMessage.className = 'status-sukses';
    } else {
        submitButton.disabled = true;
        if (isNamaFilled || isIdFilled || isEmailFilled) {
             statusMessage.innerText = message;
             statusMessage.className = 'status-gagal';
        }
    }
}
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    tanggalBookingInput.setAttribute('min', todayStr);
    populateTimeSlots();
});
tanggalBookingInput.addEventListener('change', function() {
    fetchBookedSlots(this.value);
});
purposeSelect.addEventListener('change', function() {
    if (this.value === 'Other') {
        otherPurposeContainer.classList.remove('hidden');
        otherPurposeInput.required = true;
    } else {
        otherPurposeContainer.classList.add('hidden');
        otherPurposeInput.required = false;
        otherPurposeInput.value = '';
    }
    validateForm();
});
form.addEventListener('submit', function(e) {
    e.preventDefault();
    validateForm(); 
    if (submitButton.disabled) {
        alert('Please fill in all required fields correctly before submitting.');
        return;
    }
    submitButton.disabled = true;
    submitButton.innerText = "Sending...";
    fetch(`${BASE_URL}/api/submitBooking`, {
        method: 'POST',
        body: new FormData(form)
    })
    .then(response => response.json())
    .then(data => {
        statusMessage.innerText = data.message;
        statusMessage.className = data.status === 'sukses' ? 'status-sukses' : 'status-gagal';
        if (data.status === 'sukses') {
            form.reset();
            otherPurposeContainer.classList.add('hidden');
            otherPurposeInput.required = false;
            bookedSlotsForSelectedDate = [];
            populateTimeSlots();
        }
    })
    .catch(error => {
        console.error('Error:', error);
        statusMessage.innerText = 'An error occurred! Failed to connect to the server.';
        statusMessage.className = 'status-gagal';
    })
    .finally(() => {
        submitButton.innerText = "Send Booking Request";
        validateForm();
    });
});
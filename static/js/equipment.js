document.addEventListener('DOMContentLoaded', () => {
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
    const jumlahOrangInput = document.getElementById('jumlahOrang');

    let bookedSlotsForSelectedDate = [];

    // --- FUNGSI HELPER ---
    function timeToMinutes(time) {
        if (typeof time !== 'string' || !time.includes(':')) return 0;
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    }

    // --- FUNGSI API ---
    async function fetchBookedSlots(date) {
        if (!date) {
            bookedSlotsForSelectedDate = [];
            populateTimeSlots();
            return;
        }
        statusMessage.innerText = "Checking schedule...";
        submitButton.disabled = true;
        try {
            const response = await fetch(`/api/getBookedSlots?tanggal=${date}`);
            const result = await response.json();
            if (result.status === 'sukses') {
                bookedSlotsForSelectedDate = result.data.map(slot => ({
                    start: timeToMinutes(slot.start),
                    end: timeToMinutes(slot.end)
                }));
                statusMessage.innerText = "Schedule loaded. Please select a time.";
                statusMessage.className = 'status-sukses';
            } else { throw new Error(result.message); }
        } catch (error) {
            console.error('Error fetching booked slots:', error);
            statusMessage.innerText = `Failed to load schedule. Please try again.`;
            statusMessage.className = 'status-gagal';
            bookedSlotsForSelectedDate = [];
        } finally {
            populateTimeSlots();
        }
    }

    // --- FUNGSI DOM & VALIDASI ---
    function populateTimeSlots() {
        waktuMulaiSelect.innerHTML = '<option value="">Select Time</option>';
        waktuSelesaiSelect.innerHTML = '<option value="">Select Time</option>';

        const now = new Date();
        const isToday = (tanggalBookingInput.value === now.toISOString().split('T')[0]);
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const startTime = 8 * 60, endTime = 17 * 60, interval = 30;

        for (let i = startTime; i <= endTime; i += interval) {
            const timeString = `${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`;
            const isBooked = bookedSlotsForSelectedDate.some(slot => i >= slot.start && i < slot.end);
            const isPastTime = isToday && (i < currentMinutes);

            if (i < endTime) { 
                const option = new Option(timeString, timeString);
                if (isBooked || isPastTime) {
                    option.disabled = true;
                    option.innerText += isBooked ? ' (Booked)' : ' (Passed)';
                }
                waktuMulaiSelect.add(option);
            }
            if (i > startTime) { 
                const option = new Option(timeString, timeString);
                const isEndBooked = bookedSlotsForSelectedDate.some(slot => i > slot.start && i <= slot.end);
                const isEndPastTime = isToday && (i <= currentMinutes);
                if (isEndBooked || isEndPastTime) {
                    option.disabled = true;
                    option.innerText += isEndBooked ? ' (Booked)' : ' (Passed)';
                }
                waktuSelesaiSelect.add(option);
            }
        }
        validateForm(); 
    }

    function validateForm() {
        let isFormValid = true;
        let validationMessage = 'Please fill all required fields correctly.';

        const emailRegex = /^[a-zA-Z0-9._%+-]+@(my\.)?sampoernauniversity\.ac\.id$/;
        if (emailInput.value && !emailRegex.test(emailInput.value)) {
            validationMessage = 'Error: Email must use @my.sampoernauniversity.ac.id or @sampoernauniversity.ac.id domain.';
            isFormValid = false;
        }
        // --- AKHIR PERUBAHAN ---

        // Validasi Durasi Waktu
        const startTime = timeToMinutes(waktuMulaiSelect.value);
        const endTime = timeToMinutes(waktuSelesaiSelect.value);
        if (startTime && endTime) {
            if (startTime >= endTime) {
                validationMessage = 'Error: End time must be after start time.';
                isFormValid = false;
            } else if ((endTime - startTime) > 120) {
                validationMessage = 'Error: Maximum booking duration is 2 hours.';
                isFormValid = false;
            }
        }
        
        // Validasi Jumlah Orang
        const jumlahOrang = parseInt(jumlahOrangInput.value, 10);
        if (isNaN(jumlahOrang) || jumlahOrang < 1) {
            if (jumlahOrangInput.value.trim() !== '') { 
                validationMessage = 'Error: Number of people must be at least 1.';
            }
            isFormValid = false;
        }

        // Cek semua field wajib
        const isAllFilled = [...form.querySelectorAll('[required]')].every(input => {
            if (input.type === 'number') return input.value.trim() !== '' && parseInt(input.value, 10) > 0;
            return input.value.trim() !== '';
        });
        
        if (isAllFilled && isFormValid) {
            submitButton.disabled = false;
            statusMessage.innerText = 'All fields are valid. Ready to submit.';
            statusMessage.className = 'status-sukses';
        } else {
            submitButton.disabled = true;
            if (namaInput.value || idInput.value || emailInput.value || tanggalBookingInput.value) {
                 statusMessage.innerText = validationMessage;
                 statusMessage.className = 'status-gagal';
            } else {
                 statusMessage.innerText = 'Please select a date to see available time slots.';
                 statusMessage.className = '';
            }
        }
    }

    // --- INISIALISASI EVENT LISTENERS ---

    const today = new Date().toISOString().split('T')[0];
    tanggalBookingInput.setAttribute('min', today);

    tanggalBookingInput.addEventListener('change', () => fetchBookedSlots(tanggalBookingInput.value));
    
    purposeSelect.addEventListener('change', () => {
        otherPurposeContainer.classList.toggle('hidden', purposeSelect.value !== 'Other');
        otherPurposeInput.required = (purposeSelect.value === 'Other');
        validateForm();
    });

    form.querySelectorAll('input, select').forEach(element => {
        element.addEventListener('input', validateForm);
    });

    // --- EVENT SUBMIT FORM ---
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        validateForm(); 
        if (submitButton.disabled) {
            statusMessage.innerText = 'Please fill in all required fields correctly before submitting.';
            statusMessage.className = 'status-gagal';
            return;
        }

        submitButton.disabled = true;
        submitButton.innerText = "Sending...";
        
        fetch(`/api/submitBooking`, {
            method: 'POST',
            body: new FormData(form)
        })
        .then(response => response.json())
        .then(data => {
            statusMessage.innerText = data.message;
            statusMessage.className = data.status === 'sukses' ? 'status-sukses' : 'status-gagal';
            if (data.status === 'sukses') {
                form.reset();
                jumlahOrangInput.value = '1'; 
                otherPurposeContainer.classList.add('hidden');
                otherPurposeInput.required = false;
                fetchBookedSlots(tanggalBookingInput.value); 
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

    // Inisialisasi awal
    fetchBookedSlots(tanggalBookingInput.value);
});


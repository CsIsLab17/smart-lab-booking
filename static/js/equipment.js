document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMEN DOM ---
    const form = document.getElementById('equipmentForm');
    const statusMessage = document.getElementById('statusMessage');
    const submitButton = document.getElementById('submitButton');

    // Input Info Peminjam
    const emailInput = document.getElementById('emailPengguna');
    const waInput = document.getElementById('waNumber');
    
    // Input Waktu
    const pickupInput = document.getElementById('pickupDateTime');
    const returnInput = document.getElementById('returnDateTime');

    // Input Kuantitas Alat (semua input angka di dalam item)
    const itemInputs = form.querySelectorAll('.equipment-item input[type="number"]');

    // --- FUNGSI VALIDASI ---

    /**
     * Mengatur tanggal & waktu minimum untuk input pickup (24 jam dari sekarang).
     */
    function setMinPickupDateTime() {
        const now = new Date();
        // Tambahkan 24 jam (dalam milidetik)
        now.setTime(now.getTime() + 24 * 60 * 60 * 1000); 
        
        // Format ke string YYYY-MM-DDTHH:MM yang dibutuhkan oleh <input datetime-local>
        // Kita perlu menyesuaikan dengan timezone lokal, bukan UTC
        const localISOTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000))
                            .toISOString()
                            .slice(0, 16);
        
        pickupInput.setAttribute('min', localISOTime);
    }

    /**
     * Fungsi utama untuk memvalidasi seluruh form.
     */
    function validateForm() {
        let isFormValid = true;
        let validationMessage = 'Please fill all required fields correctly.';

        // 1. Validasi Email
        const emailRegex = /^[a-zA-Z0-9._%+-]+@my\.sampoernauniversity\.ac\.id$/;
        if (emailInput.value && !emailRegex.test(emailInput.value)) {
            validationMessage = 'Error: Email must use @my.sampoernauniversity.ac.id domain.';
            isFormValid = false;
        }

        // 2. Validasi WhatsApp
        const waRegex = /^62\d{9,13}$/; // Format 62...
        if (waInput.value && !waRegex.test(waInput.value)) {
            validationMessage = 'Error: WhatsApp number must start with 62 (e.g., 6281234...).';
            isFormValid = false;
        }

        // 3. Validasi Tanggal & Waktu
        const now = new Date();
        // Beri toleransi 1 menit untuk menghindari error pembulatan
        const minPickupDate = new Date(now.getTime() + 24 * 60 * 60 * 1000 - 60000); 
        const pickupDate = new Date(pickupInput.value);
        const returnDate = new Date(returnInput.value);

        if (pickupInput.value && pickupDate < minPickupDate) {
            validationMessage = 'Error: Pickup must be at least 24 hours from now.';
            isFormValid = false;
        } else if (pickupInput.value && returnInput.value && returnDate <= pickupDate) {
            validationMessage = 'Error: Return date must be after pickup date.';
            isFormValid = false;
        }

        // 4. Validasi Kuantitas Alat
        let totalItems = 0;
        itemInputs.forEach(input => {
            totalItems += parseInt(input.value, 10) || 0;
        });

        // 5. Cek semua field wajib
        const isAllFilled = [...form.querySelectorAll('[required]')].every(input => input.value.trim() !== '');
        
        // --- Atur Status Tombol & Pesan ---
        if (isAllFilled && isFormValid && totalItems > 0) {
            submitButton.disabled = false;
            statusMessage.innerText = 'All fields are valid. Ready to submit.';
            statusMessage.className = 'status-sukses';
        } else {
            submitButton.disabled = true;
            
            // Tentukan pesan error prioritas
            if (isAllFilled && totalItems === 0) {
                validationMessage = 'Error: You must request at least one piece of equipment.';
            } else if (!isAllFilled && (emailInput.value || waInput.value || pickupInput.value)) {
                 validationMessage = 'Please fill all required fields.';
            }
            
            // Tampilkan pesan jika ada input, atau jika pesan default
            if(emailInput.value || waInput.value || pickupInput.value || totalItems > 0) {
                statusMessage.innerText = validationMessage;
                statusMessage.className = 'status-gagal';
            } else {
                statusMessage.innerText = 'Please fill out the form to request equipment.';
                statusMessage.className = '';
            }
        }
    }

    // --- INISIALISASI EVENT LISTENERS ---

    // Set tanggal minimum saat halaman dimuat
    setMinPickupDateTime();
    
    // Validasi form secara real-time
    form.querySelectorAll('input, textarea, select').forEach(element => {
        element.addEventListener('input', validateForm);
        element.addEventListener('change', validateForm);
    });
    
    // Atur tanggal minimum 'return' berdasarkan tanggal 'pickup'
    pickupInput.addEventListener('change', () => {
        if(pickupInput.value) {
            // Set waktu kembali minimal 1 jam setelah pickup
            const pickupDate = new Date(pickupInput.value);
            pickupDate.setTime(pickupDate.getTime() + 60 * 60 * 1000); // tambah 1 jam
            
            const minReturnTime = new Date(pickupDate.getTime() - (pickupDate.getTimezoneOffset() * 60000))
                                .toISOString()
                                .slice(0, 16);
            returnInput.setAttribute('min', minReturnTime);
        }
        validateForm();
    });

    // --- EVENT SUBMIT FORM (INI BAGIAN PENTING) ---
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        validateForm(); // Lakukan validasi terakhir
        if (submitButton.disabled) {
            statusMessage.innerText = 'Please fill in all required fields correctly.';
            statusMessage.className = 'status-gagal';
            return;
        }

        submitButton.disabled = true;
        submitButton.innerText = "Sending...";
        
        // Buat objek FormData dari form
        const formData = new FormData(form);
        
        // --- PERUBAHAN UTAMA: Kumpulkan data alat ---
        // Buat objek untuk menyimpan daftar alat yang dipinjam
        const itemsBorrowed = {};
        itemInputs.forEach(input => {
            const quantity = parseInt(input.value, 10) || 0;
            if (quantity > 0) {
                // Gunakan atribut 'name' dari input (cth: "Crimping Tool") sebagai kunci
                itemsBorrowed[input.name] = quantity;
            }
        });
        
        // Tambahkan data JSON alat ke FormData sebagai satu string
        // 'app.py' akan menerima ini sebagai 'itemsBorrowed'
        formData.append('itemsBorrowed', JSON.stringify(itemsBorrowed));
        // --- AKHIR PERUBAHAN ---

        // Kirim FormData yang sudah dimodifikasi ke API
        fetch(`/api/submitEquipmentBooking`, {
            method: 'POST',
            body: formData 
        })
        .then(response => response.json())
        .then(data => {
            // Gunakan 'status: "success"' (dari app.py) untuk cek
            statusMessage.innerText = data.message;
            statusMessage.className = data.status === 'success' ? 'status-sukses' : 'status-gagal';
            
            if (data.status === 'success') {
                form.reset();
                setMinPickupDateTime(); // Set ulang min date
                // Set ulang nilai default kuantitas menjadi 0
                itemInputs.forEach(input => input.value = '0');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            statusMessage.innerText = 'An error occurred! Failed to connect to the server.';
            statusMessage.className = 'status-gagal';
        })
        .finally(() => {
            submitButton.innerText = "Send Borrowing Request";
            validateForm(); // Validasi ulang untuk menonaktifkan tombol
        });
    });

    // Validasi awal saat halaman dimuat
    validateForm();
});


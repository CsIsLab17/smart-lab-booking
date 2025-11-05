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
    const itemLabels = form.querySelectorAll('.equipment-item .item-stock-label');
    
    // Variabel untuk menyimpan stok
    let currentAvailableStock = {};
    let isFetchingStock = false;

    // --- FUNGSI API ---

    /**
     * Mengambil stok alat yang tersedia dari backend berdasarkan rentang waktu.
     */
    async function fetchEquipmentAvailability() {
        const pickup = pickupInput.value;
        const returnDate = returnInput.value;

        // Hanya jalankan jika kedua tanggal valid
        if (!pickup || !returnDate || new Date(returnDate) <= new Date(pickup)) {
            resetStockView();
            validateForm();
            return;
        }

        isFetchingStock = true;
        submitButton.disabled = true;
        statusMessage.innerText = 'Checking item availability...';
        statusMessage.className = 'status-processing';
        
        try {
            const response = await fetch(`/api/getEquipmentAvailability?pickup=${pickup}&return_date=${returnDate}`);
            const result = await response.json();

            if (result.status === 'sukses') {
                currentAvailableStock = result.data;
                statusMessage.innerText = 'Stock loaded. Please select your items.';
                statusMessage.className = 'status-sukses';
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Error fetching stock:', error);
            currentAvailableStock = {};
            statusMessage.innerText = error.message || 'Failed to check stock. Please try again.';
            statusMessage.className = 'status-gagal';
        } finally {
            isFetchingStock = false;
            updateFormAvailability();
            validateForm();
        }
    }

    // --- FUNGSI DOM & VALIDASI ---

    /**
     * Memperbarui tampilan form berdasarkan stok yang tersedia (dari currentAvailableStock).
     */
    function updateFormAvailability() {
        itemLabels.forEach(label => {
            const itemName = label.dataset.itemName; // Mengambil nama item dari 'data-item-name'
            
            if (itemName in currentAvailableStock) {
                const stock = currentAvailableStock[itemName];
                const inputEl = form.querySelector(`input[name="${itemName}"]`);

                if (stock > 0) {
                    label.innerText = `(${stock} available)`;
                    label.style.color = '#0055D4';
                    inputEl.disabled = false;
                    inputEl.max = stock;
                } else {
                    label.innerText = '(Out of Stock)';
                    label.style.color = '#D4002A';
                    inputEl.disabled = true;
                    inputEl.value = 0;
                }
            } else if (label.closest('.cannot-borrow-item')) {
                 label.innerText = '(Not for Loan)';
                 label.style.color = '#888';
            } else {
                label.innerText = '(Unavailable)';
                label.style.color = '#D4002A';
            }
        });
    }

    /**
     * Mereset tampilan stok jika tanggal tidak valid.
     */
    function resetStockView() {
        itemLabels.forEach(label => {
             if (label.closest('.cannot-borrow-item')) {
                 label.innerText = '(Not for Loan)';
                 label.style.color = '#888';
             } else {
                label.innerText = '(Select Dates)';
                label.style.color = '#888';
             }
        });
        itemInputs.forEach(input => {
            if (!input.closest('.cannot-borrow-item')) {
                input.disabled = true; // Nonaktifkan input jika tanggal tidak valid
                input.value = 0;
            }
        });
        currentAvailableStock = {};
    }

    /**
     * Mengatur tanggal & waktu minimum untuk input pickup (24 jam dari sekarang).
     */
    function setMinPickupDateTime() {
        const now = new Date();
        now.setTime(now.getTime() + 24 * 60 * 60 * 1000); // Tambah 24 jam
        const localISOTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000))
                            .toISOString()
                            .slice(0, 16);
        pickupInput.setAttribute('min', localISOTime);
    }

    /**
     * Fungsi utama untuk memvalidasi seluruh form.
     */
    function validateForm() {
        if (isFetchingStock) return; // Jangan validasi saat sedang mengambil data

        let isFormValid = true;
        let validationMessage = 'Please fill all required fields correctly.';

        // 1. Validasi Email
        const emailRegex = /^[a-zA-Z0-9._%+-]+@(my\.)?sampoernauniversity\.ac\.id$/;
        if (emailInput.value && !emailRegex.test(emailInput.value)) {
            validationMessage = 'Error: Email must use SU domain (@my.sampoernauniversity.ac.id or @sampoernauniversity.ac.id).';
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
        const minPickupDate = new Date(now.getTime() + 24 * 60 * 60 * 1000 - 60000); // Toleransi 1 menit
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
            if (input.closest('.cannot-borrow-item')) return; // Abaikan item yg tidak bisa dipinjam
            
            const quantity = parseInt(input.value, 10) || 0;
            totalItems += quantity;

            // Cek apakah kuantitas melebihi stok
            const itemName = input.name;
            if (itemName in currentAvailableStock) {
                const maxStock = currentAvailableStock[itemName];
                if (quantity > maxStock) {
                    validationMessage = `Error: Quantity for ${itemName} exceeds available stock (${maxStock}).`;
                    isFormValid = false;
                }
            }
        });

        // 5. Cek semua field wajib
        const isAllFilled = [...form.querySelectorAll('[required]')].every(input => input.value.trim() !== '');
        
        // --- Atur Status Tombol & Pesan ---
        if (isAllFilled && isFormValid && totalItems > 0) {
            submitButton.disabled = false;
            if (statusMessage.className !== 'status-gagal') {
                statusMessage.innerText = 'All fields are valid. Ready to submit.';
                statusMessage.className = 'status-sukses';
            }
        } else {
            submitButton.disabled = true;
            if (isAllFilled && totalItems === 0) {
                validationMessage = 'Error: You must request at least one piece of equipment.';
            } else if (!isAllFilled && (emailInput.value || waInput.value || pickupInput.value)) {
                 validationMessage = 'Please fill all required fields.';
            }
            
            if(emailInput.value || waInput.value || pickupInput.value || totalItems > 0) {
                if (isFormValid) { // Jika form valid tapi belum lengkap
                     statusMessage.innerText = validationMessage;
                     statusMessage.className = 'status-gagal';
                }
            } else if (!pickupInput.value || !returnInput.value) {
                statusMessage.innerText = 'Please select pickup and return dates to check stock.';
                statusMessage.className = '';
            } else {
                statusMessage.innerText = 'Please fill out the form to request equipment.';
                statusMessage.className = '';
            }
        }
    }

    // --- INISIALISASI EVENT LISTENERS ---

    // Set tanggal minimum saat halaman dimuat
    setMinPickupDateTime();
    resetStockView(); // Panggil ini untuk menonaktifkan input di awal
    
    // Validasi form secara real-time
    form.querySelectorAll('input, textarea, select').forEach(element => {
        element.addEventListener('input', validateForm);
    });

    // Panggil API saat tanggal/waktu berubah
    pickupInput.addEventListener('change', fetchEquipmentAvailability);
    returnInput.addEventListener('change', fetchEquipmentAvailability);
    
    // Atur tanggal minimum 'return' berdasarkan tanggal 'pickup'
    pickupInput.addEventListener('change', () => {
        if(pickupInput.value) {
            const pickupDate = new Date(pickupInput.value);
            pickupDate.setTime(pickupDate.getTime() + 60 * 60 * 1000); // tambah 1 jam
            
            const minReturnTime = new Date(pickupDate.getTime() - (pickupDate.getTimezoneOffset() * 60000))
                                .toISOString()
                                .slice(0, 16);
            returnInput.setAttribute('min', minReturnTime);
        }
    });

    // --- EVENT SUBMIT FORM ---
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        validateForm();
        if (submitButton.disabled) {
            statusMessage.innerText = 'Please fill in all required fields correctly.';
            statusMessage.className = 'status-gagal';
            return;
        }

        submitButton.disabled = true;
        submitButton.innerText = "Sending...";
        
        const formData = new FormData(form);
        const itemsBorrowed = {};
        itemInputs.forEach(input => {
            if (input.closest('.cannot-borrow-item')) return;
            const quantity = parseInt(input.value, 10) || 0;
            if (quantity > 0) {
                itemsBorrowed[input.name] = quantity;
            }
        });
        
        formData.append('itemsBorrowed', JSON.stringify(itemsBorrowed));

        fetch(`/api/submitEquipmentBooking`, {
            method: 'POST',
            body: formData 
        })
        .then(response => response.json())
        .then(data => {
            statusMessage.innerText = data.message;
            statusMessage.className = data.status === 'success' ? 'status-sukses' : 'status-gagal';
            
            if (data.status === 'success') {
                form.reset();
                setMinPickupDateTime();
                itemInputs.forEach(input => input.value = '0');
                resetStockView();
                validateForm();
            }
        })
        .catch(error => {
            console.error('Error:', error);
            statusMessage.innerText = 'An error occurred! Failed to connect to the server.';
            statusMessage.className = 'status-gagal';
        })
        .finally(() => {
            submitButton.innerText = "Send Borrowing Request";
            validateForm();
        });
    });

    validateForm();
});
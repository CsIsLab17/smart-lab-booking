// Menunggu hingga seluruh halaman HTML selesai dimuat
document.addEventListener('DOMContentLoaded', function () {

    // --- KONFIGURASI BARU ---
    const BASE_URL = "http://127.0.0.1:5000"; // Menentukan alamat server

    const resultContainer = document.getElementById('result');
    const checkoutContainer = document.getElementById('checkout-container');
    const checkoutButton = document.getElementById('checkoutButton');
    let lastScanTime = 0;
    const cooldown = 5000; // 5 detik cooldown untuk mencegah scan berulang
    let currentBookingId = null; // Variabel untuk menyimpan ID booking saat ini

    // Fungsi yang akan dijalankan ketika QR code berhasil dipindai
    function onScanSuccess(decodedText, decodedResult) {
        const now = Date.now();
        if (now - lastScanTime < cooldown) {
            return; // Abaikan jika scan terjadi terlalu cepat
        }
        lastScanTime = now;

        resultContainer.innerHTML = `✅ QR Code terdeteksi! Memproses check-in...`;
        resultContainer.className = 'processing';

        // Ekstrak ID dari URL yang dipindai
        try {
            const url = new URL(decodedText);
            currentBookingId = url.searchParams.get("id");
            if (!currentBookingId) throw new Error("ID tidak valid.");
        } catch (e) {
            resultContainer.innerHTML = `❌ QR Code tidak valid.`;
            resultContainer.className = 'error';
            return;
        }

        // Gunakan fetch untuk mengunjungi URL check-in
        fetch(decodedText)
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok.');
                return response.text();
            })
            .then(htmlResponse => {
                // Ekstrak pesan dari halaman konfirmasi HTML
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlResponse, "text/html");
                const message = doc.querySelector('p').textContent;
                
                resultContainer.innerHTML = `<span class="icon">✔️</span> ${message}`;
                resultContainer.className = 'success';
                checkoutContainer.style.display = 'block'; // Tampilkan tombol check-out
                checkoutButton.disabled = false;
                checkoutButton.innerText = 'Check Out';
            })
            .catch(error => {
                console.error('Check-in Error:', error);
                resultContainer.innerHTML = `❌ Gagal melakukan check-in. Silakan coba lagi.`;
                resultContainer.className = 'error';
            });
    }

    // Fungsi yang akan dijalankan jika scan gagal
    function onScanFailure(error) {
        // Bisa diabaikan
    }

    // Event listener untuk tombol check-out
    checkoutButton.addEventListener('click', function() {
        if (!currentBookingId) return;

        this.disabled = true;
        this.innerText = 'Processing...';

        // --- PERBAIKAN ---
        // Menggunakan BASE_URL untuk membuat URL yang lengkap dan benar
        const checkoutUrl = `${BASE_URL}/checkout?id=${currentBookingId}`;

        fetch(checkoutUrl)
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok.');
                return response.text();
            })
            .then(htmlResponse => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlResponse, "text/html");
                const message = doc.querySelector('p').textContent;

                resultContainer.innerHTML = `<span class="icon">👋</span> ${message}`;
                resultContainer.className = 'success';
                checkoutContainer.style.display = 'none'; // Sembunyikan tombol setelah berhasil
            })
            .catch(error => {
                console.error('Checkout Error:', error);
                resultContainer.innerHTML = '❌ Gagal melakukan check-out. Coba lagi.';
                resultContainer.className = 'error';
                this.disabled = false;
                this.innerText = 'Check Out';
            });
    });

    // Membuat instance scanner baru
    let html5QrcodeScanner = new Html5QrcodeScanner(
        "reader",
        { 
            fps: 10,
            qrbox: { width: 250, height: 250 }
        },
        false
    );
    
    // Mulai proses pemindaian
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
});
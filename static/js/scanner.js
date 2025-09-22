document.addEventListener('DOMContentLoaded', function () {

    const resultContainer = document.getElementById('result');
    const checkoutContainer = document.getElementById('checkout-container');
    const checkoutButton = document.getElementById('checkoutButton');
    let lastScanTime = 0;
    const cooldown = 5000;
    let currentBookingId = null;

    function onScanSuccess(decodedText, decodedResult) {
        const now = Date.now();
        if (now - lastScanTime < cooldown) {
            return;
        }
        lastScanTime = now;

        resultContainer.innerHTML = `✅ QR Code terdeteksi! Memproses check-in...`;
        resultContainer.className = 'processing';

        try {
            const url = new URL(decodedText);
            currentBookingId = url.searchParams.get("id");
            if (!currentBookingId) throw new Error("ID tidak valid.");
        } catch (e) {
            resultContainer.innerHTML = `❌ QR Code tidak valid.`;
            resultContainer.className = 'error';
            return;
        }

        // Fetch ke URL lengkap dari QR Code (ini sudah benar)
        fetch(decodedText)
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok.');
                return response.text();
            })
            .then(htmlResponse => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlResponse, "text/html");
                const message = doc.querySelector('p').textContent;
                
                resultContainer.innerHTML = `<span class="icon">✔️</span> ${message}`;
                resultContainer.className = 'success';
                checkoutContainer.style.display = 'block';
                checkoutButton.disabled = false;
                checkoutButton.innerText = 'Check Out';
            })
            .catch(error => {
                console.error('Check-in Error:', error);
                resultContainer.innerHTML = `❌ Gagal melakukan check-in. Silakan coba lagi.`;
                resultContainer.className = 'error';
            });
    }

    function onScanFailure(error) {
        // Abaikan
    }

    checkoutButton.addEventListener('click', function() {
        if (!currentBookingId) return;

        this.disabled = true;
        this.innerText = 'Processing...';

        // PERBAIKAN: Menggunakan URL relatif untuk checkout
        const checkoutUrl = `/checkout?id=${currentBookingId}`;

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
                checkoutContainer.style.display = 'none';
            })
            .catch(error => {
                console.error('Checkout Error:', error);
                resultContainer.innerHTML = '❌ Gagal melakukan check-out. Coba lagi.';
                resultContainer.className = 'error';
                this.disabled = false;
                this.innerText = 'Check Out';
            });
    });

    let html5QrcodeScanner = new Html5QrcodeScanner(
        "reader",
        { 
            fps: 10,
            qrbox: { width: 250, height: 250 }
        },
        false
    );
    
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
});
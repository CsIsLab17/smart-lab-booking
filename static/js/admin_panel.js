document.addEventListener('DOMContentLoaded', () => {

    // --- Form 1: Admin Lab Booking ---
    const labForm = document.getElementById('adminLabForm');
    const labStatus = document.getElementById('labStatusMessage');
    const labSubmitBtn = document.getElementById('adminLabSubmit');

    labForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        labSubmitBtn.disabled = true;
        labSubmitBtn.innerText = "Booking...";
        labStatus.className = '';
        labStatus.innerText = '';

        try {
            const formData = new FormData(labForm);
            const response = await fetch('/api/admin_lab_booking', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            
            if (result.status === 'success') {
                labStatus.innerText = result.message;
                labStatus.className = 'status-sukses';
                labForm.reset();
            } else {
                throw new Error(result.message);
            }

        } catch (error) {
            labStatus.innerText = error.message || 'An error occurred.';
            labStatus.className = 'status-gagal';
        } finally {
            labSubmitBtn.disabled = false;
            labSubmitBtn.innerText = "Book Lab (Admin)";
        }
    });

    // --- Form 2: Admin Equipment Booking ---
    const equipForm = document.getElementById('adminEquipmentForm');
    const equipStatus = document.getElementById('equipStatusMessage');
    const equipSubmitBtn = document.getElementById('adminEquipSubmit');

    equipForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        equipSubmitBtn.disabled = true;
        equipSubmitBtn.innerText = "Borrowing...";
        equipStatus.className = '';
        equipStatus.innerText = '';

        try {
            const formData = new FormData(equipForm);
            const response = await fetch('/api/admin_equipment_booking', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            
            if (result.status === 'success') {
                equipStatus.innerText = result.message;
                equipStatus.className = 'status-sukses';
                equipForm.reset();
            } else {
                throw new Error(result.message);
            }

        } catch (error) {
            equipStatus.innerText = error.message || 'An error occurred.';
            equipStatus.className = 'status-gagal';
        } finally {
            equipSubmitBtn.disabled = false;
            equipSubmitBtn.innerText = "Borrow Equipment (Admin)";
        }
    });

});


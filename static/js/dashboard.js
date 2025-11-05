document.addEventListener('DOMContentLoaded', function() {
    // API Endpoints
    const LAB_DATA_API = '/api/getDashboardData';
    const EQUIPMENT_DATA_API = '/api/getEquipmentDashboardData';

    let charts = {}; // Object to store chart instances

    /**
     * Main function to fetch all data and update the dashboard.
     */
    async function updateDashboard() {
        try {
            // Fetch both sets of data in parallel
            const [labResponse, equipResponse] = await Promise.all([
                fetch(LAB_DATA_API),
                fetch(EQUIPMENT_DATA_API)
            ]);

            const labResult = await labResponse.json();
            const equipResult = await equipResponse.json();

            // Process Lab Data
            if (labResult.status === 'sukses') {
                const labData = labResult.data;
                renderCurrentStatus(labData);
                
                // Filter for completed bookings for charts and table
                const completedBookings = labData.filter(b => b.Status === 'Selesai');
                renderPurposeChart(completedBookings);
                renderDailyChart(completedBookings);
                renderHourlyChart(completedBookings);
                renderBookingTable(completedBookings);
            } else {
                console.error("Failed to fetch lab data:", labResult.message);
            }

            // Process Equipment Data
            if (equipResult.status === 'sukses') {
                renderEquipmentTable(equipResult.data);
            } else {
                console.error("Failed to fetch equipment data:", equipResult.message);
            }

        } catch (error) {
            console.error("Error connecting to the server:", error);
        }
    }

    /**
     * Renders the current status of the lab.
     */
    function renderCurrentStatus(data) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const todayStr = now.toISOString().split('T')[0];

        const currentUser = data.find(booking => {
            const bookingDate = booking ? booking['Tanggal Booking'] : null;
            const status = booking ? booking['Status'] : null;
            // Status considered "in-use"
            if (bookingDate !== todayStr || (status !== 'Disetujui' && status !== 'Datang')) {
                return false;
            }
            const startTime = timeToMinutes(booking['Waktu Mulai']);
            const endTime = timeToMinutes(booking['Waktu Selesai']);
            return currentTime >= startTime && currentTime < endTime;
        });

        const statusEl = document.getElementById('current-status');
        if (currentUser) {
            statusEl.className = 'status-occupied';
            statusEl.innerHTML = `<span class="status-icon">🔴</span> <span class="status-text">Lab is currently in use by <strong>${currentUser['Nama']}</strong> until ${currentUser['Waktu Selesai']}.</span>`;
        } else {
            statusEl.className = 'status-free';
            statusEl.innerHTML = `<span class="status-icon">✅</span> <span class="status-text">The lab is currently free.</span>`;
        }
    }
    
    /**
     * Renders the booking purpose doughnut chart (based on completed bookings).
     */
    function renderPurposeChart(completedData) {
        const ctx = document.getElementById('purposeChart').getContext('2d');
        const purposes = completedData.map(b => b['Booking Purpose']);
        const purposeCounts = purposes.reduce((acc, purpose) => {
            if (purpose) {
                acc[purpose] = (acc[purpose] || 0) + 1;
            }
            return acc;
        }, {});

        if (charts.purpose) charts.purpose.destroy();
        charts.purpose = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(purposeCounts),
                datasets: [{
                    data: Object.values(purposeCounts),
                    backgroundColor: ['#0033A0', '#0055D4', '#4D82D6', '#86A8E0'],
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    /**
     * Renders the daily bookings bar chart (based on completed bookings).
     */
    function renderDailyChart(completedData) {
        const ctx = document.getElementById('dailyChart').getContext('2d');
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dailyCounts = Array(7).fill(0);
        
        completedData.forEach(booking => {
            if (booking['Tanggal Booking']) {
                try {
                    // Menggunakan getUTCDay() agar konsisten tanpa memandang timezone
                    const dayIndex = new Date(booking['Tanggal Booking']).getUTCDay(); 
                    dailyCounts[dayIndex]++;
                } catch(e) {
                    console.warn("Invalid date format in sheet: ", booking['Tanggal Booking']);
                }
            }
        });

        if (charts.daily) charts.daily.destroy();
        charts.daily = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dayNames,
                datasets: [{
                    label: 'Completed Bookings per Day',
                    data: dailyCounts,
                    backgroundColor: '#4D82D6',
                    borderColor: '#0033A0',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }
    
    /**
     * Renders the peak hours line chart (based on completed bookings).
     */
    function renderHourlyChart(completedData) {
        const ctx = document.getElementById('hourlyChart').getContext('2d');
        const hourlyCounts = {};
        for (let i = 8; i < 17; i++) {
            hourlyCounts[`${String(i).padStart(2, '0')}:00`] = 0;
        }

        completedData.forEach(booking => {
            if (booking['Waktu Mulai'] && booking['Waktu Selesai']) {
                const startHour = parseInt(booking['Waktu Mulai'].split(':')[0]);
                const endHour = parseInt(booking['Waktu Selesai'].split(':')[0]);
                for (let hour = startHour; hour < endHour; hour++) {
                    const hourKey = `${String(hour).padStart(2, '0')}:00`;
                    if(hourlyCounts.hasOwnProperty(hourKey)) {
                        hourlyCounts[hourKey]++;
                    }
                }
            }
        });

        if (charts.hourly) charts.hourly.destroy();
        charts.hourly = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Object.keys(hourlyCounts),
                datasets: [{
                    label: 'Peak Hours (Completed)',
                    data: Object.values(hourlyCounts),
                    backgroundColor: 'rgba(0, 85, 212, 0.2)',
                    borderColor: '#0033A0',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }

    /**
     * Renders the recent completed lab bookings table.
     */
    function renderBookingTable(completedData) {
        const tableBody = document.querySelector('#bookingTable tbody');
        tableBody.innerHTML = '';
        
        const recentBookings = completedData
            .filter(b => b.Timestamp)
            .sort((a, b) => new Date(b['Timestamp']) - new Date(a['Timestamp']))
            .slice(0, 10);
            
        if (recentBookings.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No completed bookings found.</td></tr>';
            return;
        }
            
        recentBookings.forEach(booking => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${booking['Nama'] || ''}</td>
                <td>${booking['Tanggal Booking'] || ''}</td>
                <td>${(booking['Waktu Mulai'] || '')} - ${(booking['Waktu Selesai'] || '')}
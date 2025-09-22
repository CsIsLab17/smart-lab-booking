document.addEventListener('DOMContentLoaded', function() {
    // PERBAIKAN: Menghapus URL absolut dan menggunakan URL relatif
    const API_URL = '/api/getDashboardData';

    let charts = {};

    async function updateDashboard() {
        try {
            const response = await fetch(API_URL);
            const result = await response.json();

            if (result.status === 'sukses') {
                const data = result.data;
                renderCurrentStatus(data);
                renderPurposeChart(data);
                renderDailyChart(data);
                renderHourlyChart(data);
                renderBookingTable(data);
            } else {
                console.error("Failed to fetch dashboard data:", result.message);
            }
        } catch (error) {
            console.error("Error connecting to the server:", error);
        }
    }

    function renderCurrentStatus(data) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const todayStr = now.toISOString().split('T')[0];

        const currentUser = data.find(booking => {
            // PERBAIKAN: Memastikan semua properti ada sebelum diakses
            const bookingDate = booking ? booking['Tanggal Booking'] : null;
            const status = booking ? booking['Status'] : null;
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
    
    function renderPurposeChart(data) {
        const ctx = document.getElementById('purposeChart').getContext('2d');
        const purposes = data.filter(b => b.Status === 'Disetujui').map(b => b['Booking Purpose']);
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
                    backgroundColor: ['#0033A0', '#0055D4', '#4D82D6'],
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function renderDailyChart(data) {
        const ctx = document.getElementById('dailyChart').getContext('2d');
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dailyCounts = Array(7).fill(0);
        
        data.filter(b => b.Status === 'Disetujui').forEach(booking => {
            if (booking['Tanggal Booking']) {
                const dayIndex = new Date(booking['Tanggal Booking']).getDay();
                dailyCounts[dayIndex]++;
            }
        });

        if (charts.daily) charts.daily.destroy();
        charts.daily = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dayNames,
                datasets: [{
                    label: 'Bookings per Day',
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
    
    function renderHourlyChart(data) {
        const ctx = document.getElementById('hourlyChart').getContext('2d');
        const hourlyCounts = {};
        for (let i = 8; i < 17; i++) {
            hourlyCounts[`${String(i).padStart(2, '0')}:00`] = 0;
        }

        data.filter(b => b.Status === 'Disetujui').forEach(booking => {
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
                    label: 'Peak Hours',
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

    function renderBookingTable(data) {
        const tableBody = document.querySelector('#bookingTable tbody');
        tableBody.innerHTML = '';
        
        const recentBookings = data
            .filter(b => b.Status === 'Disetujui' && b.Timestamp)
            .sort((a, b) => new Date(b['Timestamp']) - new Date(a['Timestamp']))
            .slice(0, 10);
            
        recentBookings.forEach(booking => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${booking['Nama'] || ''}</td>
                <td>${booking['Tanggal Booking'] || ''}</td>
                <td>${(booking['Waktu Mulai'] || '')} - ${(booking['Waktu Selesai'] || '')}</td>
                <td>${booking['Booking Purpose'] || ''}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    function timeToMinutes(timeStr) {
        if (!timeStr || !timeStr.includes(':')) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    updateDashboard();
    setInterval(updateDashboard, 30000);
});
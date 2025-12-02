document.addEventListener('DOMContentLoaded', function() {
    const API_URL = '/api/getDashboardData';
    let charts = {};
    // calendar state to support month navigation
    let calendarState = {
        month: (new Date()).getMonth(), // 0-11
        year: (new Date()).getFullYear()
    };

    async function updateDashboard() {
        try {
            const response = await fetch(API_URL);
            const result = await response.json();

            if (result.status === 'sukses') {
                const data = result.data;
                renderCurrentStatus(data);
                // Memanggil fungsi render dengan data yang sudah difilter
                const completedBookings = data.filter(b => b.Status === 'Selesai');
                renderPurposeChart(completedBookings);
                renderDailyChart(completedBookings);
                renderHourlyChart(completedBookings);
                renderBookingTable(completedBookings);
                // render calendar using full data (not only completed)
                renderCalendar(data);
            } else {
                console.error("Failed to fetch dashboard data:", result.message);
            }
        } catch (error) {
            console.error("Error connecting to the server:", error);
        }
    }

    // Fungsi status lab saat ini tidak berubah, karena harus real-time
    function renderCurrentStatus(data) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const todayStr = now.toISOString().split('T')[0];

        const currentUser = data.find(booking => {
            const bookingDate = booking ? booking['Tanggal Booking'] : null;
            const status = booking ? booking['Status'] : null;
            // Status yang dianggap sedang berjalan adalah "Disetujui" atau "Datang"
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

    
    
    // PERBAIKAN: Fungsi ini sekarang menerima data yang sudah difilter
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
                    backgroundColor: ['#0033A0', '#0055D4', '#4D82D6'],
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // PERBAIKAN: Fungsi ini sekarang menerima data yang sudah difilter
    function renderDailyChart(completedData) {
        const ctx = document.getElementById('dailyChart').getContext('2d');
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dailyCounts = Array(7).fill(0);
        
        completedData.forEach(booking => {
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
    
    // PERBAIKAN: Fungsi ini sekarang menerima data yang sudah difilter
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

    // PERBAIKAN: Fungsi ini sekarang menerima data yang sudah difilter
    function renderBookingTable(completedData) {
        const tableBody = document.querySelector('#bookingTable tbody');
        tableBody.innerHTML = '';
        
        const recentBookings = completedData
            .filter(b => b.Timestamp) // Memastikan ada timestamp untuk diurutkan
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

    // Utility: truncate text to a maximum length and add ellipsis
    function truncateText(str, maxLen = 18) {
        if (!str) return '';
        if (str.length <= maxLen) return str;
        return str.slice(0, maxLen - 1) + '…';
    }

    // Render a simple month calendar and annotate days that have bookings
    function renderCalendar(allBookings, targetId = 'bookingCalendar') {
        const container = document.getElementById(targetId);
        if (!container) return; // nothing to render into

        const state = calendarState;

        function startOfMonth(year, month) {
            return new Date(year, month, 1);
        }

        function daysInMonth(year, month) {
            return new Date(year, month + 1, 0).getDate();
        }

        function monthName(monthIndex) {
            return new Date(0, monthIndex).toLocaleString('default', { month: 'long' });
        }

        // find bookings for a given date (YYYY-MM-DD)
        function bookingsOn(dateStr) {
            return allBookings.filter(b => b['Tanggal Booking'] === dateStr);
        }

        // build header with nav
        container.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '8px';

        const title = document.createElement('div');
        title.textContent = `${monthName(state.month)} ${state.year}`;
        title.style.fontWeight = '600';

        const nav = document.createElement('div');
        const prev = document.createElement('button');
        prev.textContent = '<';
        prev.className = 'cal-prev';
        prev.onclick = () => { changeMonth(-1); };
        const next = document.createElement('button');
        next.textContent = '>';
        next.className = 'cal-next';
        next.onclick = () => { changeMonth(1); };

        nav.appendChild(prev);
        nav.appendChild(next);
        header.appendChild(title);
        header.appendChild(nav);
        container.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'calendar-grid';
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
        grid.style.gap = '6px';

        // weekday headings
        const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        weekdays.forEach(d => {
            const cell = document.createElement('div');
            cell.textContent = d;
            cell.style.fontSize = '12px';
            cell.style.textAlign = 'center';
            cell.style.fontWeight = '600';
            grid.appendChild(cell);
        });

        const firstDay = startOfMonth(state.year, state.month).getDay();
        const totalDays = daysInMonth(state.year, state.month);

        // empty cells before first day
        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement('div');
            empty.className = 'calendar-cell empty';
            empty.style.minHeight = '60px';
            grid.appendChild(empty);
        }

        // day cells
        for (let day = 1; day <= totalDays; day++) {
            const date = new Date(state.year, state.month, day);
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const iso = `${y}-${m}-${d}`;

            const cell = document.createElement('div');
            cell.className = 'calendar-cell';
            cell.style.border = '1px solid rgba(0,0,0,0.06)';
            cell.style.padding = '6px';
            cell.style.minHeight = '60px';
            cell.style.boxSizing = 'border-box';
            cell.style.position = 'relative';

            const dayLabel = document.createElement('div');
            dayLabel.textContent = String(day);
            dayLabel.style.fontSize = '13px';
            dayLabel.style.fontWeight = '600';
            dayLabel.style.marginBottom = '6px';
            cell.appendChild(dayLabel);

            const dayBookings = bookingsOn(iso);
            if (dayBookings.length) {
                const list = document.createElement('div');
                list.style.display = 'flex';
                list.style.flexDirection = 'column';
                list.style.gap = '4px';

                // Only show bookings with an active/approved status,
                // sorted by Waktu Mulai (earliest first).
                const visibleBookings = dayBookings
                    .filter(b => ['Disetujui', 'Datang', 'Selesai'].includes(b['Status']))
                    .sort((a, b) => {
                        const ta = timeToMinutes(a['Waktu Mulai'] || '00:00');
                        const tb = timeToMinutes(b['Waktu Mulai'] || '00:00');
                        return ta - tb;
                    });

                visibleBookings.slice(0,5).forEach(b => {
                    const item = document.createElement('div');
                    const displayName = truncateText(b['Nama'] || '', 15);
                    const start = b['Waktu Mulai'] || '';
                    const end = b['Waktu Selesai'] || '';
                    const text = `${start} — ${end} ${displayName}`.trim();
                    item.textContent = text;
                    item.style.fontSize = '12px';
                    item.style.overflow = 'hidden';
                    item.style.textOverflow = 'ellipsis';
                    item.style.whiteSpace = 'nowrap';
                    item.title = `${b['Nama'] || ''} — ${start} to ${end}`;
                    list.appendChild(item);
                });

                const extra = Math.max(0, visibleBookings.length - 5);
                if (extra > 0) {
                    const more = document.createElement('div');
                    more.textContent = `+${extra} more`;
                    more.style.fontSize = '11px';
                    more.style.color = '#666';
                    list.appendChild(more);
                }

                cell.appendChild(list);
            }

            grid.appendChild(cell);
        }

        container.appendChild(grid);

        function changeMonth(delta) {
            state.month += delta;
            if (state.month < 0) { state.month = 11; state.year -= 1; }
            if (state.month > 11) { state.month = 0; state.year += 1; }
            renderCalendar(allBookings, targetId);
        }
    }

    updateDashboard();
    setInterval(updateDashboard, 30000);
});
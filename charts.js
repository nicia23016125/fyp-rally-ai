// Move this entire block to: public/js/admin-charts.js
document.addEventListener('DOMContentLoaded', () => {
    const updateBtn = document.getElementById('updateBtn');
    let reviewChart;

    const updateDashboard = async () => {
        const start = document.getElementById('startDate').value;
        const end = document.getElementById('endDate').value;

        if (!start || !end) return alert("Please select both dates");

        const response = await fetch(`/api/admin/stats?startDate=${start}&endDate=${end}`);
        const data = await response.json();

        // Update Text Fields
        document.getElementById('stat-users').innerText = data.summary.newUsers;
        document.getElementById('stat-subs').innerText = data.summary.newSubs;
        document.getElementById('stat-earnings').innerText = $${Number(data.summary.earnings).toLocaleString()};
        document.getElementById('stat-renewals').innerText = data.renewalCount;
        document.getElementById('stat-reviews').innerText = data.totalReviews;

        renderChart(data.chartData);
    };

    const renderChart = (chartData) => {
        const ctx = document.getElementById('reviewChart').getContext('2d');
        if (reviewChart) reviewChart.destroy();

        reviewChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartData.map(d => d.month),
                datasets: [
                    { label: 'Good', data: chartData.map(d => d.good), backgroundColor: '#10b981' },
                    { label: 'Bad', data: chartData.map(d => d.bad), backgroundColor: '#ef4444' }
                ]
            }
        });
    };

    updateBtn.addEventListener('click', updateDashboard);
});
// ============================================================
// FOREX NEWS TRADER v2
// ============================================================

const state = {
    news: [],
    filteredNews: [],
    watchlist: JSON.parse(localStorage.getItem('watchlist') || '["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"]'),
    prices: {},
    selectedDate: new Date().toISOString().split('T')[0]
};

const API = {
    thisWeek: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
    lastWeek: 'https://nfs.faireconomy.media/ff_calendar_lastweek.json',
    nextWeek: 'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
    forex: 'https://api.exchangerate.host/latest'
};

// ============================================================
// FETCH NEWS (3 minggu: last, this, next)
// ============================================================
async function fetchNews() {
    setStatus('Fetching news...');
    try {
        const [thisWeek, lastWeek, nextWeek] = await Promise.all([
            fetch(API.thisWeek).then(r => r.json()).catch(() => []),
            fetch(API.lastWeek).then(r => r.json()).catch(() => []),
            fetch(API.nextWeek).then(r => r.json()).catch(() => [])
        ]);
        
        const all = [...lastWeek, ...thisWeek, ...nextWeek];
        
        state.news = all.map(item => ({
            title: item.title,
            country: item.country,
            currency: item.country,
            date: item.date,
            dateOnly: item.date ? item.date.split('T')[0] : '',
            time: item.date ? new Date(item.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '',
            impact: (item.impact || 'low').toLowerCase(),
            forecast: item.forecast || '-',
            previous: item.previous || '-',
            actual: item.actual || '-'
        })).filter(n => n.dateOnly);
        
        state.news.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        setStatus('✓ ' + state.news.length + ' news loaded');
        applyFilter();
        populateNewsSelect();
        renderDailySummary();
    } catch (e) {
        setStatus('✗ Error fetching news');
        console.error(e);
    }
}

// ============================================================
// FETCH PRICES
// ============================================================
async function fetchPrices() {
    try {
        const res = await fetch(API.forex + '?base=USD');
        const data = await res.json();
        const rates = data.rates || {};
        state.prices = {
            EURUSD: (1 / (rates.EUR || 1)).toFixed(5),
            GBPUSD: (1 / (rates.GBP || 1)).toFixed(5),
            USDJPY: (rates.JPY || 1).toFixed(3),
            AUDUSD: (1 / (rates.AUD || 1)).toFixed(5),
            USDCAD: (rates.CAD || 1).toFixed(5),
            USDCHF: (rates.CHF || 1).toFixed(5),
            NZDUSD: (1 / (rates.NZD || 1)).toFixed(5)
        };
        renderWatchlist();
    } catch (e) {
        console.error(e);
    }
}

// ============================================================
// FILTER
// ============================================================
function applyFilter() {
    const impact = document.getElementById('filter-impact').value;
    const currency = document.getElementById('filter-currency').value;
    const date = document.getElementById('filter-date').value;
    
    state.filteredNews = state.news.filter(n => {
        if (impact !== 'all' && n.impact !== impact) return false;
        if (currency !== 'all' && n.currency !== currency) return false;
        if (date && n.dateOnly !== date) return false;
        return true;
    });
    
    renderCalendar();
}

// ============================================================
// RENDER CALENDAR
// ============================================================
function renderCalendar() {
    const el = document.getElementById('calendar-list');
    if (state.filteredNews.length === 0) {
        el.innerHTML = '<div class="empty">Tidak ada news yang cocok. Coba ganti filter atau tanggal.</div>';
        return;
    }
    
    el.innerHTML = state.filteredNews.map(n => 
        '<div class="news-item ' + n.impact + '">' +
        '<div class="news-header"><span class="news-currency">' + n.currency + '</span><span class="news-time">' + n.dateOnly + ' ' + n.time + '</span></div>' +
        '<div class="news-title">' + n.title + '</div>' +
        '<div class="news-data">' +
        '<div><div class="label">Forecast</div><div class="value forecast">' + n.forecast + '</div></div>' +
        '<div><div class="label">Previous</div><div class="value previous">' + n.previous + '</div></div>' +
        '<div><div class="label">Actual</div><div class="value actual">' + n.actual + '</div></div>' +
        '</div></div>'
    ).join('');
}

// ============================================================
// DAILY SUMMARY
// ============================================================
function renderDailySummary() {
    const date = document.getElementById('daily-date').value || new Date().toISOString().split('T')[0];
    const dayNews = state.news.filter(n => n.dateOnly === date);
    
    const el = document.getElementById('daily-result');
    
    if (dayNews.length === 0) {
        el.innerHTML = '<div class="empty">Tidak ada news di tanggal ' + date + '.</div>';
        return;
    }
    
    // Hitung sentimen per mata uang
    const currencySentiment = {};
    dayNews.forEach(n => {
        if (!currencySentiment[n.currency]) {
            currencySentiment[n.currency] = { bullish: 0, bearish: 0, neutral: 0, news: [] };
        }
        const forecast = parseFloat(n.forecast);
        const previous = parseFloat(n.previous);
        const actual = parseFloat(n.actual);
        
        let bias = 'neutral';
        if (!isNaN(actual) && !isNaN(forecast)) {
            if (actual > forecast) bias = 'bullish';
            else if (actual < forecast) bias = 'bearish';
        } else if (!isNaN(forecast) && !isNaN(previous)) {
            if (forecast > previous) bias = 'bullish';
            else if (forecast < previous) bias = 'bearish';
        }
        
        currencySentiment[n.currency][bias]++;
        currencySentiment[n.currency].news.push({ ...n, bias });
    });
    
    // Stats
    const highImpact = dayNews.filter(n => n.impact === 'high').length;
    const mediumImpact = dayNews.filter(n => n.impact === 'medium').length;
    const lowImpact = dayNews.filter(n => n.impact === 'low').length;
    
    let html = '<div class="analysis-section"><h3>Ringkasan ' + date + '</h3>' +
        '<div class="day-summary">' +
        '<div class="day-stat"><div class="label">Total News</div><div class="value">' + dayNews.length + '</div></div>' +
        '<div class="day-stat"><div class="label">High</div><div class="value" style="color:#e17055">' + highImpact + '</div></div>' +
        '<div class="day-stat"><div class="label">Medium</div><div class="value" style="color:#fdcb6e">' + mediumImpact + '</div></div>' +
        '<div class="day-stat"><div class="label">Low</div><div class="value" style="color:#74b9ff">' + lowImpact + '</div></div>' +
        '</div></div>';
    
    // Sentimen per mata uang
    html += '<div class="analysis-section"><h3>Sentimen per Mata Uang</h3>';
    for (const [currency, data] of Object.entries(currencySentiment)) {
        const total = data.bullish + data.bearish + data.neutral;
        let overall = 'neutral';
        if (data.bullish > data.bearish) overall = 'bullish';
        else if (data.bearish > data.bullish) overall = 'bearish';
        
        html += '<div class="analysis-row">' +
            '<span class="label">' + currency + '</span>' +
            '<span class="value sentiment-' + overall + '">' + overall.toUpperCase() + ' (' + data.bullish + '↑ ' + data.bearish + '↓ ' + data.neutral + '→)</span>' +
            '</div>';
    }
    html += '</div>';
    
    // Entry recommendation
    html += '<div class="analysis-section"><h3>Rekomendasi Entry</h3>';
    for (const [currency, data] of Object.entries(currencySentiment)) {
        let overall = 'neutral';
        if (data.bullish > data.bearish) overall = 'bullish';
        else if (data.bearish > data.bullish) overall = 'bearish';
        
        const pairs = getAffectedPairs(currency);
        const entries = pairs.map(pair => {
            const key = pair.replace('/', '');
            const price = parseFloat(state.prices[key]) || 1;
            return generateEntry(pair, price, overall);
        });
        
        html += '<div style="margin-bottom:16px"><strong style="color:#6c5ce7">' + currency + ' — ' + overall.toUpperCase() + '</strong>';
        html += entries.map(e => 
            '<div class="entry-box"><div class="pair">' + e.pair + '</div>' +
            '<div class="entry-row buy">BUY @ ' + e.buy + '</div>' +
            '<div class="entry-row">SL: ' + e.sl + '</div>' +
            '<div class="entry-row">TP1: ' + e.tp1 + '</div>' +
            '<div class="entry-row">TP2: ' + e.tp2 + '</div>' +
            '<div class="entry-row">R:R = ' + e.rr + '</div></div>'
        ).join('');
        html += '</div>';
    }
    html += '</div>';
    
    // List news
    html += '<div class="analysis-section"><h3>Daftar News</h3>';
    html += dayNews.map(n => 
        '<div class="news-item ' + n.impact + '">' +
        '<div class="news-header"><span class="news-currency">' + n.currency + '</span><span class="news-time">' + n.time + '</span></div>' +
        '<div class="news-title">' + n.title + '</div>' +
        '<div class="news-data">' +
        '<div><div class="label">Forecast</div><div class="value forecast">' + n.forecast + '</div></div>' +
        '<div><div class="label">Previous</div><div class="value previous">' + n.previous + '</div></div>' +
        '<div><div class="label">Actual</div><div class="value actual">' + n.actual + '</div></div>' +
        '</div></div>'
    ).join('');
    html += '</div>';
    
    el.innerHTML = html;
}

// ============================================================
// POPULATE NEWS SELECT
// ============================================================
function populateNewsSelect() {
    const sel = document.getElementById('select-news');
    const date = document.getElementById('filter-date').value;
    let filtered = state.news;
    if (date) filtered = filtered.filter(n => n.dateOnly === date);
    
    sel.innerHTML = '<option value="">-- Pilih News --</option>' +
        filtered.map((n, i) => 
            '<option value="' + i + '">' + n.dateOnly + ' — ' + n.currency + ' — ' + n.title + '</option>'
        ).join('');
}

// ============================================================
// ANALISA NEWS SPESIFIK
// ============================================================
function analyzeNews(index) {
    const date = document.getElementById('filter-date').value;
    let filtered = state.news;
    if (date) filtered = filtered.filter(n => n.dateOnly === date);
    
    const news = filtered[index];
    if (!news) return;
    
    const forecast = parseFloat(news.forecast);
    const previous = parseFloat(news.previous);
    const actual = parseFloat(news.actual);
    
    let sentiment = 'neutral';
    let reason = 'Forecast sama dengan previous. Tidak ada ekspektasi perubahan.';
    if (!isNaN(forecast) && !isNaN(previous)) {
        if (forecast > previous) {
            sentiment = 'bullish';
            reason = 'Forecast (' + forecast + ') > Previous (' + previous + '). Ekspektasi naik. Mata uang cenderung menguat.';
        } else if (forecast < previous) {
            sentiment = 'bearish';
            reason = 'Forecast (' + forecast + ') < Previous (' + previous + '). Ekspektasi turun. Mata uang cenderung melemah.';
        }
    }
    
    let actualAnalysis = 'Actual belum dirilis.';
    if (!isNaN(actual) && !isNaN(forecast)) {
        if (actual > forecast) {
            actualAnalysis = 'Actual (' + actual + ') > Forecast (' + forecast + '). Data lebih baik. ' + news.currency + ' cenderung MENGUAT.';
        } else if (actual < forecast) {
            actualAnalysis = 'Actual (' + actual + ') < Forecast (' + forecast + '). Data lebih buruk. ' + news.currency + ' cenderung MELEMAH.';
        } else {
            actualAnalysis = 'Actual = Forecast. Data sesuai ekspektasi. Reaksi terbatas.';
        }
    }
    
    const pairs = getAffectedPairs(news.currency);
    const entries = pairs.map(pair => {
        const key = pair.replace('/', '');
        const price = parseFloat(state.prices[key]) || 1;
        return generateEntry(pair, price, sentiment);
    });
    
    const el = document.getElementById('news-result');
    el.innerHTML = 
        '<div class="analysis-section"><h3>News</h3>' +
        '<div class="analysis-row"><span class="label">Tanggal</span><span class="value">' + news.dateOnly + ' ' + news.time + '</span></div>' +
        '<div class="analysis-row"><span class="label">Mata Uang</span><span class="value">' + news.currency + '</span></div>' +
        '<div class="analysis-row"><span class="label">Judul</span><span class="value">' + news.title + '</span></div>' +
        '<div class="analysis-row"><span class="label">Impact</span><span class="value">' + news.impact.toUpperCase() + '</span></div>' +
        '<div class="analysis-row"><span class="label">Forecast</span><span class="value">' + news.forecast + '</span></div>' +
        '<div class="analysis-row"><span class="label">Previous</span><span class="value">' + news.previous + '</span></div>' +
        '<div class="analysis-row"><span class="label">Actual</span><span class="value">' + news.actual + '</span></div>' +
        '</div>' +
        '<div class="analysis-section"><h3>Sentimen</h3>' +
        '<div class="analysis-row"><span class="label">Bias</span><span class="value sentiment-' + sentiment + '">' + sentiment.toUpperCase() + '</span></div>' +
        '<div class="analysis-row"><span class="label">Alasan</span><span class="value">' + reason + '</span></div>' +
        '<div class="analysis-row"><span class="label">Actual vs Forecast</span><span class="value">' + actualAnalysis + '</span></div>' +
        '</div>' +
        '<div class="analysis-section"><h3>Rekomendasi Entry</h3>' +
        entries.map(e => 
            '<div class="entry-box"><div class="pair">' + e.pair + '</div>' +
            '<div class="entry-row buy">BUY @ ' + e.buy + '</div>' +
            '<div class="entry-row">SL: ' + e.sl + '</div>' +
            '<
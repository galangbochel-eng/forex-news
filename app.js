// ============================================================
// FOREX NEWS TRADER
// ============================================================

const state = {
    news: [],
    filteredNews: [],
    watchlist: JSON.parse(localStorage.getItem('watchlist') || '["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"]'),
    prices: {},
    selectedNews: null
};

// ============================================================
// API ENDPOINTS
// ============================================================
const API = {
    calendar: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
    forex: 'https://api.exchangerate.host/latest',
    metals: 'https://api.metals.live/v1/spot'
};

// ============================================================
// FETCH NEWS
// ============================================================
async function fetchNews() {
    setStatus('Fetching news...');
    try {
        const res = await fetch(API.calendar);
        const data = await res.json();
        
        state.news = data.map(item => ({
            title: item.title,
            country: item.country,
            currency: item.country,
            date: item.date,
            time: new Date(item.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            impact: (item.impact || 'low').toLowerCase(),
            forecast: item.forecast || '-',
            previous: item.previous || '-',
            actual: item.actual || '-'
        }));
        
        // Sort by date
        state.news.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        setStatus(`✓ ${state.news.length} news loaded`);
        applyFilter();
        populateNewsSelect();
    } catch (e) {
        setStatus('✗ Error fetching news');
        console.error(e);
    }
}

// ============================================================
// FETCH PRICES
// ============================================================
async function fetchPrices() {
    setStatus('Fetching prices...');
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
        setStatus('✓ Prices loaded');
    } catch (e) {
        setStatus('✗ Error fetching prices');
        console.error(e);
    }
}

// ============================================================
// FILTER
// ============================================================
function applyFilter() {
    const impact = document.getElementById('filter-impact').value;
    const currency = document.getElementById('filter-currency').value;
    
    state.filteredNews = state.news.filter(n => {
        if (impact !== 'all' && n.impact !== impact) return false;
        if (currency !== 'all' && n.currency !== currency) return false;
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
        el.innerHTML = '<div class="empty">Tidak ada news yang cocok.</div>';
        return;
    }
    
    el.innerHTML = state.filteredNews.map((n, i) => `
        <div class="news-item ${n.impact}">
            <div class="news-header">
                <span class="news-currency">${n.currency}</span>
                <span class="news-time">${n.time}</span>
            </div>
            <div class="news-title">${n.title}</div>
            <div class="news-data">
                <div>
                    <div class="label">Forecast</div>
                    <div class="value forecast">${n.forecast}</div>
                </div>
                <div>
                    <div class="label">Previous</div>
                    <div class="value previous">${n.previous}</div>
                </div>
                <div>
                    <div class="label">Actual</div>
                    <div class="value actual">${n.actual}</div>
                </div>
            </div>
        </div>
    `).join('');
}

// ============================================================
// POPULATE NEWS SELECT (untuk analisa)
// ============================================================
function populateNewsSelect() {
    const sel = document.getElementById('select-news');
    sel.innerHTML = '<option value="">-- Pilih News --</option>' +
        state.news.filter(n => n.impact === 'high' || n.impact === 'medium').map((n, i) => 
            `<option value="${i}">${n.currency} — ${n.title} (${n.time})</option>`
        ).join('');
}

// ============================================================
// ANALISA
// ============================================================
function analyzeNews(index) {
    const news = state.news.filter(n => n.impact === 'high' || n.impact === 'medium')[index];
    if (!news) return;
    
    const forecast = parseFloat(news.forecast);
    const previous = parseFloat(news.previous);
    const actual = parseFloat(news.actual);
    
    // Sentimen
    let sentiment = 'neutral';
    let sentimentReason = 'Forecast sama dengan previous. Tidak ada ekspektasi perubahan.';
    
    if (!isNaN(forecast) && !isNaN(previous)) {
        if (forecast > previous) {
            sentiment = 'bullish';
            sentimentReason = `Forecast (${forecast}) > Previous (${previous}). Ekspektasi naik. Mata uang cenderung menguat.`;
        } else if (forecast < previous) {
            sentiment = 'bearish';
            sentimentReason = `Forecast (${forecast}) < Previous (${previous}). Ekspektasi turun. Mata uang cenderung melemah.`;
        }
    }
    
    // Kalo ada actual, bandingin sama forecast
    let actualAnalysis = '';
    if (!isNaN(actual) && !isNaN(forecast)) {
        if (actual > forecast) {
            actualAnalysis = `Actual (${actual}) > Forecast (${forecast}). Data lebih baik dari ekspektasi. Mata uang ${news.currency} cenderung MENGUAT.`;
        } else if (actual < forecast) {
            actualAnalysis = `Actual (${actual}) < Forecast (${forecast}). Data lebih buruk dari ekspektasi. Mata uang ${news.currency} cenderung MELEMAH.`;
        } else {
            actualAnalysis = `Actual = Forecast. Data sesuai ekspektasi. Reaksi market cenderung terbatas.`;
        }
    } else {
        actualAnalysis = 'Actual belum dirilis. Analisa berdasarkan forecast vs previous.';
    }
    
    // Pair yang terpengaruh
    const pairs = getAffectedPairs(news.currency);
    
    // Rekomendasi entry
    const entries = pairs.map(pair => {
        const price = state.prices[pair.replace('/', '')] || 0;
        return generateEntry(pair, price, sentiment, news.impact);
    });
    
    // Render
    const el = document.getElementById('analysis-result');
    el.innerHTML = `
        <div class="analysis-section">
            <h3>News</h3>
            <div class="analysis-row">
                <span class="label">Mata Uang</span>
                <span class="value">${news.currency}</span>
            </div>
            <div class="analysis-row">
                <span class="label">Judul</span>
                <span class="value">${news.title}</span>
            </div>
            <div class="analysis-row">
                <span class="label">Impact</span>
                <span class="value">${news.impact.toUpperCase()}</span>
            </div>
            <div class="analysis-row">
                <span class="label">Forecast</span>
                <span class="value">${news.forecast}</span>
            </div>
            <div class="analysis-row">
                <span class="label">Previous</span>
                <span class="value">${news.previous}</span>
            </div>
            <div class="analysis-row">
                <span class="label">Actual</span>
                <span class="value">${news.actual}</span>
            </div>
        </div>
        
        <div class="analysis-section">
            <h3>Sentimen</h3>
            <div class="analysis-row">
                <span class="label">Bias</span>
                <span class="value sentiment-${sentiment}">${sentiment.toUpperCase()}</span>
            </div>
            <div class="analysis-row">
                <span class="label">Alasan</span>
                <span class="value">${sentimentReason}</span>
            </div>
            <div class="analysis-row">
                <span class="label">Actual vs Forecast</span>
                <span class="value">${actualAnalysis}</span>
            </div>
        </div>
        
        <div class="analysis-section">
            <h3>Rekomendasi Entry</h3>
            ${entries.map(e => `
                <div class="entry-box">
                    <div class="pair">${e.pair}</div>
                    <div class="entry-row buy">BUY @ ${e.buy}</div>
                    <div class="entry-row">SL: ${e.sl}</div>
                    <div class="entry-row">TP1: ${e.tp1}</div>
                    <div class="entry-row">TP2: ${e.tp2}</div>
                    <div class="entry-row">R:R = ${e.rr}</div>
                </div>
            `).join('')}
        </div>
    `;
}

// ============================================================
// GET AFFECTED PAIRS
// ============================================================
function getAffectedPairs(currency) {
    const map = {
        USD: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'XAU/USD'],
        EUR: ['EUR/USD', 'EUR/GBP', 'EUR/JPY'],
        GBP: ['GBP/USD', 'EUR/GBP', 'GBP/JPY'],
        JPY: ['USD/JPY', 'EUR/JPY', 'GBP/JPY'],
        AUD: ['AUD/USD', 'AUD/JPY'],
        CAD: ['USD/CAD', 'CAD/JPY'],
        CHF: ['USD/CHF', 'EUR/CHF'],
        NZD: ['NZD/USD'],
        XAU: ['XAU/USD']
    };
    return map[currency] || [currency + '/USD'];
}

// ============================================================
// GENERATE ENTRY
// ============================================================
function generateEntry(pair, price, sentiment, impact) {
    // Pake ATR sederhana (0.5% dari harga)
    const atr = price * 0.005;
    const pip = pair.includes('JPY') ? 0.01 : 0.0001;
    
    let buy, sl, tp1, tp2;
    
    if (sentiment === 'bullish') {
        buy = price;
        sl = price - atr * 1.5;
        tp1 = price + atr * 1.5;
        tp2 = price + atr * 3;
    } else if (sentiment === 'bearish') {
        buy = price;
        sl = price + atr * 1.5;
        tp1 = price - atr * 1.5;
        tp2 = price - atr * 3;
    } else {
        buy = price;
        sl = price - atr;
        tp1 = price + atr;
        tp2 = price + atr * 2;
    }
    
    const rr = ((Math.abs(tp1 - price)) / (Math.abs(sl - price))).toFixed(2);
    
    return {
        pair,
        buy: buy.toFixed(pair.includes('JPY') ? 3 : 5),
        sl: sl.toFixed(pair.includes('JPY') ? 3 : 5),
        tp1: tp1.toFixed(pair.includes('JPY') ? 3 : 5),
        tp2: tp2.toFixed(pair.includes('JPY') ? 3 : 5),
        rr: '1:' + rr
    };
}

// ============================================================
// WATCHLIST
// ============================================================
function renderWatchlist() {
    const el = document.getElementById('watchlist-list');
    if (state.watchlist.length === 0) {
        el.innerHTML = '<div class="empty">Belum ada pair.</div>';
        return;
    }
    
    el.innerHTML = state.watchlist.map(pair => {
        const key = pair.replace('/', '');
        const price = state.prices[key] || '—';
        return `
            <div class="watch-item">
                <span class="pair">${pair}</span>
                <span class="price">${price}</span>
                <button class="remove" onclick="removeWatch('${pair}')">×</button>
            </div>
        `;
    }).join('');
}

function addWatch() {
    const pair = prompt('Masukkan pair (contoh: EUR/USD):');
    if (pair && !state.watchlist.includes(pair)) {
        state.watchlist.push(pair);
        localStorage.setItem('watchlist', JSON.stringify(state.watchlist));
        renderWatchlist();
    }
}

function removeWatch(pair) {
    state.watchlist = state.watchlist.filter(p => p !== pair);
    localStorage.setItem('watchlist', JSON.stringify(state.watchlist));
    renderWatchlist();
}

// ============================================================
// UTILS
// ============================================================
function setStatus(msg) {
    document.getElementById('status').textContent = msg;
}

// ============================================================
// TABS
// ============================================================
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
});

// ============================================================
// EVENT LISTENERS
// ============================================================
document.getElementById('filter-impact').addEventListener('change', applyFilter);
document.getElementById('filter-currency').addEventListener('change', applyFilter);
document.getElementById('btn-analyze').addEventListener('click', () => {
    const idx = document.getElementById('select-news').value;
    if (idx !== '') analyzeNews(parseInt(idx));
});
document.getElementById('btn-add-watch').addEventListener('click', addWatch);

// ============================================================
// INIT
// ============================================================
fetchNews();
fetchPrices();
setInterval(fetchPrices, 60000); // Update harga tiap 60 detik
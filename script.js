let currentTab = 'live'; // 'live' oppure 'backtest'

let liveTrades = JSON.parse(localStorage.getItem('smc_live_trades')) || [];
let backtestTrades = JSON.parse(localStorage.getItem('smc_backtest_trades')) || [];

const tradeForm = document.getElementById('trade-form');
const tradeList = document.getElementById('trade-list');

// CAMBIO TAB (Live / Backtest)
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    if(tab === 'live') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('form-title').innerText = "Nuova Operazione (Live)";
        document.getElementById('table-title').innerText = "Storico Operazioni Live";
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('form-title').innerText = "Nuova Operazione (Backtest)";
        document.getElementById('table-title').innerText = "Storico Operazioni Backtest";
    }
    updateUI();
}

// CALCOLO AUTOMATICO R:R
function calculateRR() {
    const entry = parseFloat(document.getElementById('entry').value);
    const sl = parseFloat(document.getElementById('sl').value);
    const tp = parseFloat(document.getElementById('tp').value);
    const direction = document.getElementById('direction').value;

    if (entry && sl && tp) {
        let risk = Math.abs(entry - sl);
        let reward = Math.abs(tp - entry);
        if (risk > 0) {
            let rrRatio = (reward / risk).toFixed(2);
            document.getElementById('rr-auto').value = `1:${rrRatio}`;
            return rrRatio;
        }
    }
    document.getElementById('rr-auto').value = "1:0.00";
    return 0;
}

['entry', 'sl', 'tp', 'direction'].forEach(id => {
    document.getElementById(id).addEventListener('input', calculateRR);
});

// CALCOLATORE DI LOTTAGGIO
function calculateLots() {
    const balance = parseFloat(document.getElementById('calc-balance').value);
    const riskPct = parseFloat(document.getElementById('calc-risk-pct').value);
    const slPips = parseFloat(document.getElementById('calc-sl-pips').value);

    if (balance && riskPct && slPips && slPips > 0) {
        const riskAmount = balance * (riskPct / 100);
        // Calcolo indicativo basato su $10/pip per 1 lotto standard Forex
        const lotSize = (riskAmount / (slPips * 10)).toFixed(2);
        document.getElementById('calc-result').innerText = `${lotSize} Lotti`;
    } else {
        document.getElementById('calc-result').innerText = `0.00 Lotti`;
    }
}

['calc-balance', 'calc-risk-pct', 'calc-sl-pips'].forEach(id => {
    document.getElementById(id).addEventListener('input', calculateLots);
});

// CONVERTITORE IMMAGINI (Base64 per salvare localmente)
function fileToBase64(file) {
    return new Promise((resolve) => {
        if (!file) resolve(null);
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
    });
}

// ELIMINAZIONE TRADE
function deleteTrade(index) {
    if(confirm("Vuoi davvero eliminare questa operazione?")) {
        if (currentTab === 'live') {
            liveTrades.splice(index, 1);
            localStorage.setItem('smc_live_trades', JSON.stringify(liveTrades));
        } else {
            backtestTrades.splice(index, 1);
            localStorage.setItem('smc_backtest_trades', JSON.stringify(backtestTrades));
        }
        updateUI();
    }
}

// AGGIORNA INTERFACCIA E DASHBOARD
function updateUI() {
    const trades = currentTab === 'live' ? liveTrades : backtestTrades;
    tradeList.innerHTML = '';

    let totalPL = 0;
    let totalRR = 0;
    let winCount = 0;
    let lossCount = 0;

    trades.forEach((trade, index) => {
        totalPL += parseFloat(trade.pnl || 0);
        totalRR += parseFloat(trade.rr || 0);
        if (trade.result === 'WIN') winCount++;
        if (trade.result === 'LOSS') lossCount++;

        const row = document.createElement('tr');
        let resultClass = trade.result === 'WIN' ? 'win' : (trade.result === 'LOSS' ? 'loss' : 'be');

        row.innerHTML = `
            <td>${trade.date ? new Date(trade.date).toLocaleDateString() : '-'}</td>
            <td><strong>${trade.asset}</strong></td>
            <td>${trade.direction}</td>
            <td>${trade.poi}</td>
            <td>1:${trade.rr}</td>
            <td class="${resultClass}">${trade.pnl}€</td>
            <td class="${resultClass}">${trade.result}</td>
            <td>
                ${trade.imgBefore ? `<a href="${trade.imgBefore}" target="_blank" style="color:#38bdf8">Prima</a>` : '-'}
                ${trade.imgAfter ? ` | <a href="${trade.imgAfter}" target="_blank" style="color:#38bdf8">Dopo</a>` : ''}
            </td>
            <td><button class="delete-btn" onclick="deleteTrade(${index})">🗑️</button></td>
        `;
        tradeList.appendChild(row);
    });

    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? ((winCount / totalTrades) * 100).toFixed(1) : 0;
    const avgRR = totalTrades > 0 ? (totalRR / totalTrades).toFixed(2) : '0.00';
    const profitFactor = lossCount > 0 ? (winCount / lossCount).toFixed(2) : winCount;

    document.getElementById('win-rate').innerText = `${winRate}%`;
    document.getElementById('avg-rr').innerText = `1:${avgRR}`;
    document.getElementById('profit-factor').innerText = profitFactor;
    document.getElementById('total-pl').innerText = `${totalPL.toFixed(2)}€`;
}

// INVIAR FORM
tradeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fileBefore = document.getElementById('file-before').files[0];
    const fileAfter = document.getElementById('file-after').files[0];

    const imgBeforeBase64 = await fileToBase64(fileBefore);
    const imgAfterBase64 = await fileToBase64(fileAfter);

    const rrRatio = calculateRR();

    const newTrade = {
        date: document.getElementById('trade-date').value,
        asset: document.getElementById('asset').value,
        direction: document.getElementById('direction').value,
        session: document.getElementById('session').value,
        entry: document.getElementById('entry').value,
        sl: document.getElementById('sl').value,
        tp: document.getElementById('tp').value,
        result: document.getElementById('result').value,
        rr: rrRatio,
        pnl: document.getElementById('pnl').value,
        poi: document.getElementById('poi').value,
        trigger: document.getElementById('trigger').value,
        liquidity: document.getElementById('liquidity').value,
        imgBefore: imgBeforeBase64,
        imgAfter: imgAfterBase64,
        notes: document.getElementById('notes').value
    };

    if (currentTab === 'live') {
        liveTrades.unshift(newTrade);
        localStorage.setItem('smc_live_trades', JSON.stringify(liveTrades));
    } else {
        backtestTrades.unshift(newTrade);
        localStorage.setItem('smc_backtest_trades', JSON.stringify(backtestTrades));
    }

    updateUI();
    tradeForm.reset();
    document.getElementById('rr-auto').value = "1:0.00";
});

updateUI();

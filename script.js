let currentTab = 'live';
let userEmail = localStorage.getItem('journal_user_email') || '';

// GESTIONE MODALE EMAIL
const emailModal = document.getElementById('email-modal');
const userEmailInput = document.getElementById('user-email-input');
const saveEmailBtn = document.getElementById('save-email-btn');
const userDisplayEmail = document.getElementById('user-display-email');
const changeEmailBtn = document.getElementById('change-email-btn');

function checkEmail() {
    if (!userEmail) {
        emailModal.style.display = 'flex';
    } else {
        emailModal.style.display = 'none';
        userDisplayEmail.innerText = userEmail;
    }
}

saveEmailBtn.addEventListener('click', () => {
    const val = userEmailInput.value.trim();
    if (val && val.includes('@')) {
        userEmail = val;
        localStorage.setItem('journal_user_email', userEmail);
        checkEmail();
        updateUI();
    } else {
        alert("Inserisci un'email valida!");
    }
});

changeEmailBtn.addEventListener('click', () => {
    userEmail = '';
    localStorage.removeItem('journal_user_email');
    checkEmail();
});

checkEmail();

// DATI SALVATI CHIAVE DINAMICA UTENTE
function getStorageKey(type) {
    return `smc_${userEmail}_${type}_trades`;
}

function getTrades(type) {
    if (!userEmail) return [];
    return JSON.parse(localStorage.getItem(getStorageKey(type))) || [];
}

function saveTrades(type, data) {
    if (!userEmail) return;
    localStorage.setItem(getStorageKey(type), JSON.stringify(data));
}

// CAMBIO TAB
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
    return "0.00";
}

['entry', 'sl', 'tp'].forEach(id => {
    document.getElementById(id).addEventListener('input', calculateRR);
});

// CALCOLATORE LOTTAGGIO
function calculateLots() {
    const balance = parseFloat(document.getElementById('calc-balance').value);
    const riskPct = parseFloat(document.getElementById('calc-risk-pct').value);
    const slPips = parseFloat(document.getElementById('calc-sl-pips').value);

    if (balance && riskPct && slPips && slPips > 0) {
        const riskAmount = balance * (riskPct / 100);
        const lotSize = (riskAmount / (slPips * 10)).toFixed(2);
        document.getElementById('calc-result').innerText = `${lotSize} Lotti`;
    } else {
        document.getElementById('calc-result').innerText = `0.00 Lotti`;
    }
}

['calc-balance', 'calc-risk-pct', 'calc-sl-pips'].forEach(id => {
    document.getElementById(id).addEventListener('input', calculateLots);
});

// CONVERTITORE IMMAGINI A LINK APRIBILE
function fileToDataURL(file) {
    return new Promise((resolve) => {
        if (!file) resolve(null);
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
}

// APRI FOTO IN SCHEDA
function openImage(dataUrl) {
    const w = window.open();
    w.document.write(`<img src="${dataUrl}" style="max-width:100%; height:auto; background:#000;">`);
}

// ELIMINAZIONE TRADE
function deleteTrade(index) {
    if(confirm("Vuoi eliminare questa operazione?")) {
        let trades = getTrades(currentTab);
        trades.splice(index, 1);
        saveTrades(currentTab, trades);
        updateUI();
    }
}

// UPDATE UI
function updateUI() {
    const trades = getTrades(currentTab);
    const tradeList = document.getElementById('trade-list');
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
            <td class="notes-cell" title="${trade.notes || ''}">${trade.notes || '-'}</td>
            <td>
                ${trade.imgBefore ? `<button class="img-btn" onclick="openImage('${trade.imgBefore}')">Prima</button>` : ''}
                ${trade.imgAfter ? ` <button class="img-btn" onclick="openImage('${trade.imgAfter}')">Dopo</button>` : ''}
                ${!trade.imgBefore && !trade.imgAfter ? '-' : ''}
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

// INVIA FORM
document.getElementById('trade-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const fileBefore = document.getElementById('file-before').files[0];
    const fileAfter = document.getElementById('file-after').files[0];

    const imgBeforeBase64 = await fileToDataURL(fileBefore);
    const imgAfterBase64 = await fileToDataURL(fileAfter);

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

    let trades = getTrades(currentTab);
    trades.unshift(newTrade);
    saveTrades(currentTab, trades);

    updateUI();
    document.getElementById('trade-form').reset();
    document.getElementById('rr-auto').value = "1:0.00";
});

updateUI();

// Recupera i trade salvati o crea un array vuoto
let trades = JSON.parse(localStorage.getItem('smc_trades')) || [];

const tradeForm = document.getElementById('trade-form');
const tradeList = document.getElementById('trade-list');

// Funzione per salvare e aggiornare l'interfaccia
function updateUI() {
    // Salva in memoria locale
    localStorage.setItem('smc_trades', JSON.stringify(trades));
    
    // Pulisci tabella
    tradeList.innerHTML = '';

    let totalPL = 0;
    let totalRR = 0;
    let winCount = 0;

    trades.forEach((trade, index) => {
        totalPL += parseFloat(trade.pnl);
        totalRR += parseFloat(trade.rr);
        if (trade.result === 'WIN') winCount++;

        const row = document.createElement('tr');
        
        let resultClass = 'be';
        if(trade.result === 'WIN') resultClass = 'win';
        if(trade.result === 'LOSS') resultClass = 'loss';

        row.innerHTML = `
            <td>${new Date(trade.date).toLocaleDateString()}</td>
            <td><strong>${trade.asset}</strong></td>
            <td>${trade.direction} (${trade.session})</td>
            <td>${trade.poi}</td>
            <td>1:${trade.rr}</td>
            <td class="${resultClass}">${trade.pnl}€</td>
            <td class="${resultClass}">${trade.result}</td>
            <td>
                ${trade.imgBefore ? `<a href="${trade.imgBefore}" target="_blank" style="color:#38bdf8">Prima</a>` : ''}
                ${trade.imgAfter ? ` | <a href="${trade.imgAfter}" target="_blank" style="color:#38bdf8">Dopo</a>` : ''}
            </td>
        `;
        tradeList.appendChild(row);
    });

    // Calcolo Statistiche Dashboard
    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? ((winCount / totalTrades) * 100).toFixed(1) : 0;
    const avgRR = totalTrades > 0 ? (totalRR / totalTrades).toFixed(2) : '0.00';

    document.getElementById('win-rate').innerText = `${winRate}%`;
    document.getElementById('avg-rr').innerText = `1:${avgRR}`;
    document.getElementById('total-pl').innerText = `${totalPL.toFixed(2)}€`;
}

// Evento Invio Form
tradeForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const newTrade = {
        date: document.getElementById('trade-date').value,
        asset: document.getElementById('asset').value,
        direction: document.getElementById('direction').value,
        session: document.getElementById('session').value,
        entry: document.getElementById('entry').value,
        sl: document.getElementById('sl').value,
        tp: document.getElementById('tp').value,
        risk: document.getElementById('risk').value,
        result: document.getElementById('result').value,
        rr: document.getElementById('rr').value,
        pnl: document.getElementById('pnl').value,
        poi: document.getElementById('poi').value,
        trigger: document.getElementById('trigger').value,
        liquidity: document.getElementById('liquidity').value,
        trend: document.getElementById('trend').value,
        imgBefore: document.getElementById('img-before').value,
        imgAfter: document.getElementById('img-after').value,
        notes: document.getElementById('notes').value
    };

    trades.unshift(newTrade); // Aggiunge in cima alla lista
    updateUI();
    tradeForm.reset();
});

// Carica i dati all'avvio
updateUI();
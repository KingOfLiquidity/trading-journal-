// CARICAMENTO EMAIL SALVATA
document.getElementById('userEmail').value = localStorage.getItem('journal_user_email') || '';

let trades = JSON.parse(localStorage.getItem('trading_journal_data')) || [];

function saveUserEmail() {
    const email = document.getElementById('userEmail').value.trim();
    if (!email) {
        alert("Inserisci un'email valida");
        return;
    }
    if (!email.includes('@')) {
        alert("L'email non è valida");
        return;
    }
    localStorage.setItem('journal_user_email', email);
    showNotification('✅ Email salvata');
}

// MOLTIPLICATORI PER DIFFERENTI ASSET CLASSES
const assetMultipliers = {
    'forex_standard': 10,      // EUR/USD, GBP/USD (1 pip = $10/lotto)
    'forex_jpy': 8,            // USD/JPY e coppie JPY (1 pip = $8/lotto circa)
    'gold': 10,                // XAUUSD (1 pip = $10/lotto)
    'indices_es': 50,          // E-mini S&P 500 ($50/punto)
    'indices_nq': 20,          // E-mini Nasdaq ($20/punto)
    'indices_dax': 25,         // DAX futures (€25/punto)
    'crypto_btc': 100,         // BTC futures (scalate)
    'crypto_eth': 50,          // ETH futures
};

// CALCOLATORE LOTTAGGIO CORRETTO PER ASSET CLASSES
function calculateLotSize() {
    const balance = parseFloat(document.getElementById('calcBalance').value);
    const riskPercent = parseFloat(document.getElementById('calcRisk').value);
    const slPips = parseFloat(document.getElementById('calcSlPips').value);
    const assetType = document.getElementById('calcAssetType').value;

    if (!balance || !riskPercent || !slPips || slPips <= 0) {
        alert("Inserisci valori validi per il calcolo.");
        return;
    }

    // Validazione asset type
    if (!assetMultipliers[assetType]) {
        alert("Tipo di asset non riconosciuto. Seleziona un'opzione valida.");
        return;
    }

    const riskAmount = balance * (riskPercent / 100);
    const multiplier = assetMultipliers[assetType];
    const lotSize = riskAmount / (slPips * multiplier);
    const totalRiskExposure = slPips * multiplier * lotSize;

    document.getElementById('lotResultText').innerText = lotSize.toFixed(3);
    document.getElementById('riskAmountText').innerHTML = `
        <div style="margin-top: 8px; font-size: 0.95em;">
            <div>💰 Rischio Capitale: ${riskAmount.toFixed(2)} €/$</div>
            <div>📊 Esposizione SL: ${totalRiskExposure.toFixed(2)} €/$</div>
            <div style="font-size: 0.85em; color: #888; margin-top: 5px;">
                ${assetType.includes('indices') ? '⚠️ Contratti futures (non lotti)' : 
                  assetType.includes('crypto') ? '⚠️ Contratti perpetui (scalare prudentemente)' : 
                  '✅ Lotti standard forex'}
            </div>
        </div>
    `;
    document.getElementById('calcResult').style.display = 'block';
}

// COMPRESSIONE AD ALTA EFFICIENZA (EVITA CRASH CHROME E RIGONFIAMENTO MEMORIA)
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        // Validazione tipo file
        if (!file.type.startsWith('image/')) {
            reject(new Error("Seleziona un file immagine valido"));
            return;
        }

        // Validazione dimensione file (max 2MB)
        const MAX_FILE_SIZE = 2 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
            reject(new Error("Immagine troppo grande (max 2MB)"));
            return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 400;
                const MAX_HEIGHT = 400;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height = Math.round((height * MAX_WIDTH) / width);
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width = Math.round((width * MAX_HEIGHT) / height);
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.25)); // Compressione aggressiva
            };
            img.onerror = error => reject(new Error("Errore nel caricamento dell'immagine"));
        };
        reader.onerror = error => reject(new Error("Errore nella lettura del file"));
    });
}

// AGGIORNAMENTO STATISTICHE
function updateStats() {
    const total = trades.length;
    if (total === 0) {
        document.getElementById('statTotal').innerText = "0";
        document.getElementById('statWinRate').innerText = "0%";
        document.getElementById('statWLB').innerText = "0 / 0 / 0";
        document.getElementById('statRR').innerText = "0 R";
        if (document.getElementById('statProfit')) {
            document.getElementById('statProfit').innerText = "0 €/$";
        }
        return;
    }

    let wins = 0, losses = 0, be = 0, totalRR = 0, profitLoss = 0;

    trades.forEach(t => {
        if (t.result === 'WIN') {
            wins++;
            const rrVal = parseFloat(t.rr.replace('1:', '')) || 1;
            totalRR += rrVal;
            profitLoss += parseFloat(t.profit || 0);
        } else if (t.result === 'LOSS') {
            losses++;
            totalRR -= 1;
            profitLoss -= parseFloat(t.profit || 0);
        } else {
            be++;
        }
    });

    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    document.getElementById('statTotal').innerText = total;
    document.getElementById('statWinRate').innerText = `${winRate}%`;
    document.getElementById('statWLB').innerText = `${wins} / ${losses} / ${be}`;
    document.getElementById('statRR').innerText = `${totalRR >= 0 ? '+' : ''}${totalRR.toFixed(1)} R`;
    
    // Profitto/Perdita (se disponibile)
    if (document.getElementById('statProfit')) {
        const profitDisplay = profitLoss >= 0 ? `+${profitLoss.toFixed(2)}` : `${profitLoss.toFixed(2)}`;
        const profitColor = profitLoss >= 0 ? '#22c55e' : '#ef4444';
        document.getElementById('statProfit').innerText = profitDisplay;
        document.getElementById('statProfit').style.color = profitColor;
    }
}

// RENDERING TABELLA
function renderTrades() {
    const tbody = document.getElementById('tradeTableBody');
    tbody.innerHTML = '';

    if (trades.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:20px;">Nessun trade salvato.</td></tr>`;
        updateStats();
        return;
    }

    trades.forEach((trade, index) => {
        const tr = document.createElement('tr');
        let badgeClass = 'badge-win';
        if (trade.result === 'LOSS') badgeClass = 'badge-loss';
        if (trade.result === 'BE') badgeClass = 'badge-be';

        const imgHtml = trade.image 
            ? `<img src="${escapeHtml(trade.image)}" class="img-thumb" onclick="openModal(this.src)" alt="Trade photo" style="cursor:pointer; max-width:50px; border-radius:4px;">` 
            : '-';

        const profitDisplay = trade.profit ? `${trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)}` : '-';

        tr.innerHTML = `
            <td>${escapeHtml(trade.date)}</td>
            <td><strong>${escapeHtml(trade.asset)}</strong></td>
            <td>${escapeHtml(trade.strategy)}</td>
            <td>${escapeHtml(trade.direction)}</td>
            <td><span class="badge ${badgeClass}">${escapeHtml(trade.result)}</span></td>
            <td>${escapeHtml(trade.rr)}</td>
            <td style="color: ${trade.profit >= 0 ? '#22c55e' : '#ef4444'};">${profitDisplay}</td>
            <td>${imgHtml}</td>
            <td>${escapeHtml(trade.notes || '-')}</td>
            <td><button class="btn-danger" style="padding:4px 8px;" onclick="deleteTrade(${index})">🗑️</button></td>
        `;
        tbody.appendChild(tr);
    });

    updateStats();
}

// FUNZIONE PER ESCAPE HTML (SICUREZZA CONTRO XSS)
function escapeHtml(text) {
    if (typeof text !== 'string') return String(text);
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// INSERIMENTO TRADE
document.getElementById('tradeForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    let imageData = "";
    const fileInput = document.getElementById('imageFile');
    if (fileInput.files && fileInput.files[0]) {
        try {
            imageData = await fileToBase64(fileInput.files[0]);
        } catch (err) {
            alert("Errore nel caricamento della foto: " + err.message);
            console.error("Errore foto", err);
            return;
        }
    }

    const newTrade = {
        date: document.getElementById('date').value,
        asset: document.getElementById('asset').value.toUpperCase().trim(),
        strategy: document.getElementById('strategy').value.trim(),
        direction: document.getElementById('direction').value,
        result: document.getElementById('result').value,
        rr: document.getElementById('rr').value,
        profit: parseFloat(document.getElementById('profit')?.value || 0) || 0,
        image: imageData,
        notes: document.getElementById('notes').value.trim(),
        timestamp: new Date().toISOString()
    };

    trades.unshift(newTrade);
    saveData();
    renderTrades();

    this.reset();
    document.getElementById('date').valueAsDate = new Date();
    
    showNotification('✅ Trade salvato con successo!');
});

// NOTIFICA CON AUTO-DISMISS
function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #22c55e;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        z-index: 9999;
        animation: slideIn 0.3s ease-in-out;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    notification.innerText = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, 2500);
}

// SALVATAGGIO CON PROTEZIONE ANTI-CRASH
function saveData() {
    try {
        const dataToSave = JSON.stringify(trades);
        
        // Verifica dimensione (localStorage ~ 5-10MB limit)
        if (dataToSave.length > 8 * 1024 * 1024) {
            console.warn('⚠️ Dati in prossimità del limite di storage');
            showNotification('⚠️ Storage quasi pieno. Esporta un backup.');
        }
        
        localStorage.setItem('trading_journal_data', dataToSave);
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            alert("❌ Spazio di memoria locale PIENO! Scarica un backup per liberare spazio.");
            exportJSON();
        } else {
            console.error('Errore salvataggio:', e);
        }
    }
}

function deleteTrade(index) {
    if (confirm("⚠️ Vuoi davvero eliminare questo trade? (Non recuperabile)")) {
        trades.splice(index, 1);
        saveData();
        renderTrades();
        showNotification('🗑️ Trade eliminato');
    }
}

function openModal(imgSrc) {
    const modal = document.getElementById('imgModal');
    document.getElementById('modalImg').src = imgSrc;
    modal.classList.add('show');
    modal.style.display = 'flex'; // Assicura visibilità
}

function closeModal(event) {
    const modal = document.getElementById('imgModal');
    if (event.target === modal || event.target.classList.contains('close-modal')) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

// ESPORTAZIONE CSV
function exportCSV() {
    if (trades.length === 0) {
        alert("Nessun trade da esportare!");
        return;
    }

    const email = localStorage.getItem('journal_user_email') || 'Account_Generico';
    let csvRows = [
        `"Account Trader: ${email}"`,
        `"Esportato: ${new Date().toLocaleString()}"`,
        '',
        "Data,Asset,Strategia,Direzione,Esito,R:R,Profitto,Note"
    ];
    
    trades.forEach(t => {
        const cleanNotes = (t.notes || '').replace(/"/g, '""').replace(/\n/g, ' ');
        const profit = t.profit ? t.profit.toFixed(2) : '0.00';
        csvRows.push(
            `"${t.date}","${t.asset}","${t.strategy}","${t.direction}","${t.result}","${t.rr}","${profit}","${cleanNotes}"`
        );
    });

    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Trading_Journal_${email}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotification('📥 CSV esportato');
}

// BACKUP JSON CON TIMESTAMP
function exportJSON() {
    if (trades.length === 0) {
        alert("Nessun dato da salvare!");
        return;
    }

    const email = localStorage.getItem('journal_user_email') || 'Account_Generico';
    const backupObject = {
        userEmail: email,
        exportDate: new Date().toISOString(),
        exportTimestamp: new Date().getTime(),
        tradeCount: trades.length,
        trades: trades
    };

    const blob = new Blob([JSON.stringify(backupObject, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute("download", `backup_journal_${email}_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotification('💾 Backup scaricato');
}

// RIPRISTINO BACKUP INTELLIGENTE
function importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            let importedTrades = [];
            
            // Supporta 3 formati diversi
            if (Array.isArray(importedData)) {
                // Formato 1: Array semplice (vecchio)
                importedTrades = importedData;
            } else if (importedData && Array.isArray(importedData.trades)) {
                // Formato 2: Oggetto con trades (nuovo)
                importedTrades = importedData.trades;
                if (importedData.userEmail) {
                    localStorage.setItem('journal_user_email', importedData.userEmail);
                    document.getElementById('userEmail').value = importedData.userEmail;
                }
            } else {
                alert("❌ File di backup non valido o formato sconosciuto.");
                return;
            }

            // Validazione integrità dati
            if (!Array.isArray(importedTrades) || importedTrades.length === 0) {
                alert("⚠️ Nessun trade trovato nel backup.");
                return;
            }

            // Merge o replace?
            const merge = confirm(
                `📊 Trovati ${importedTrades.length} trade nel backup.\n\n` +
                `Attualmente hai ${trades.length} trade.\n\n` +
                `Clicca OK per AGGIUNGERE i trade importati.\n` +
                `Clicca ANNULLA per SOSTITUIRE tutti i trade.`
            );

            if (merge) {
                trades = [...importedTrades, ...trades]; // Merge: importati prima
            } else {
                trades = importedTrades; // Replace
            }

            saveData();
            renderTrades();
            showNotification(`📂 ${importedTrades.length} trade importati!`);
        } catch (err) {
            console.error('Import error:', err);
            alert("❌ Errore durante la lettura del file backup.\n\nVerifica che sia un file JSON valido.");
        }
        event.target.value = '';
    };

    reader.readAsText(file);
}

// AUTO-SAVE PERIODICO (ogni 30 secondi)
setInterval(() => {
    if (trades.length > 0) {
        saveData();
    }
}, 30000);

// Inizializza la data di oggi
document.getElementById('date').valueAsDate = new Date();

// Event listener per modale
document.getElementById('imgModal').addEventListener('click', closeModal);

// Load stats on page load
renderTrades();

// Avviso se storage è quasi pieno
window.addEventListener('beforeunload', () => {
    try {
        const used = JSON.stringify(trades).length;
        if (used > 7 * 1024 * 1024) {
            console.warn('⚠️ Storage: ' + (used / 1024 / 1024).toFixed(1) + 'MB');
        }
    } catch (e) {
        console.error('Errore controllo storage:', e);
    }
});

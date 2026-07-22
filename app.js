document.getElementById('date').valueAsDate = new Date();

// CARICAMENTO EMAIL SALVATA
document.getElementById('userEmail').value = localStorage.getItem('journal_user_email') || '';

let trades = JSON.parse(localStorage.getItem('trading_journal_data')) || [];

function saveUserEmail() {
    const email = document.getElementById('userEmail').value.trim();
    localStorage.setItem('journal_user_email', email);
}

// CALCOLATORE LOTTAGGIO
function calculateLotSize() {
    const balance = parseFloat(document.getElementById('calcBalance').value);
    const riskPercent = parseFloat(document.getElementById('calcRisk').value);
    const slPips = parseFloat(document.getElementById('calcSlPips').value);
    const assetType = document.getElementById('calcAssetType').value;

    if (!balance || !riskPercent || !slPips || slPips <= 0) {
        alert("Inserisci valori validi per il calcolo.");
        return;
    }

    const riskAmount = balance * (riskPercent / 100);
    let lotSize = (assetType === 'forex') ? (riskAmount / (slPips * 10)) : (riskAmount / slPips);

    document.getElementById('lotResultText').innerText = lotSize.toFixed(2);
    document.getElementById('riskAmountText').innerText = `Rischio Effettivo: ${riskAmount.toFixed(2)} €/$`;
    document.getElementById('calcResult').style.display = 'block';
}

// COMPRESSIONE AD ALTA EFFICIENZA (EVITA CRASH CHROME E RIGONFIAMENTO MEMORIA)
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 400; // Ridotto a 400px per alleggerire la RAM
                let scale = 1;
                
                if (img.width > MAX_WIDTH) {
                    scale = MAX_WIDTH / img.width;
                }

                canvas.width = img.width * scale;
                canvas.height = img.height * scale;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                // Compressione JPEG al 30% per risparmiare memoria
                resolve(canvas.toDataURL('image/jpeg', 0.3)); 
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
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
        return;
    }

    let wins = 0, losses = 0, be = 0, totalRR = 0;

    trades.forEach(t => {
        if (t.result === 'WIN') {
            wins++;
            const rrVal = parseFloat(t.rr.replace('1:', '')) || 1;
            totalRR += rrVal;
        } else if (t.result === 'LOSS') {
            losses++;
            totalRR -= 1;
        } else {
            be++;
        }
    });

    const winRate = Math.round((wins / total) * 100);

    document.getElementById('statTotal').innerText = total;
    document.getElementById('statWinRate').innerText = `${winRate}%`;
    document.getElementById('statWLB').innerText = `${wins} / ${losses} / ${be}`;
    document.getElementById('statRR').innerText = `${totalRR >= 0 ? '+' : ''}${totalRR.toFixed(1)} R`;
}

// RENDERING TABELLA
function renderTrades() {
    const tbody = document.getElementById('tradeTableBody');
    tbody.innerHTML = '';

    if (trades.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:20px;">Nessun trade salvato.</td></tr>`;
        updateStats();
        return;
    }

    trades.forEach((trade, index) => {
        const tr = document.createElement('tr');
        let badgeClass = 'badge-win';
        if (trade.result === 'LOSS') badgeClass = 'badge-loss';
        if (trade.result === 'BE') badgeClass = 'badge-be';

        const imgHtml = trade.image 
            ? `<img src="${trade.image}" class="img-thumb" onclick="openModal('${trade.image}')">` 
            : '-';

        tr.innerHTML = `
            <td>${trade.date}</td>
            <td><strong>${trade.asset}</strong></td>
            <td>${trade.strategy}</td>
            <td>${trade.direction}</td>
            <td><span class="badge ${badgeClass}">${trade.result}</span></td>
            <td>${trade.rr}</td>
            <td>${imgHtml}</td>
            <td>${trade.notes || '-'}</td>
            <td><button class="btn-danger" style="padding:4px 8px;" onclick="deleteTrade(${index})">🗑️</button></td>
        `;
        tbody.appendChild(tr);
    });

    updateStats();
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
            console.error("Errore foto", err);
        }
    }

    const newTrade = {
        date: document.getElementById('date').value,
        asset: document.getElementById('asset').value.toUpperCase().trim(),
        strategy: document.getElementById('strategy').value.trim(),
        direction: document.getElementById('direction').value,
        result: document.getElementById('result').value,
        rr: document.getElementById('rr').value,
        image: imageData,
        notes: document.getElementById('notes').value.trim()
    };

    trades.unshift(newTrade);
    saveData();
    renderTrades();

    this.reset();
    document.getElementById('date').valueAsDate = new Date();
});

// SALVATAGGIO CON PROTEZIONE ANTI-CRASH
function saveData() {
    try {
        localStorage.setItem('trading_journal_data', JSON.stringify(trades));
    } catch (e) {
        alert("Attenzione: Spazio di memoria locale pieno. Verrà scaricato un backup automatico dei dati per prevenire la perdita di informazioni.");
        exportJSON();
    }
}

function deleteTrade(index) {
    if (confirm("Vuoi davvero eliminare questo trade?")) {
        trades.splice(index, 1);
        saveData();
        renderTrades();
    }
}

function openModal(imgSrc) {
    document.getElementById('modalImg').src = imgSrc;
    document.getElementById('imgModal').style.display = 'flex';
}

// ESPORTAZIONE CSV
function exportCSV() {
    if (trades.length === 0) {
        alert("Nessun trade da esportare!");
        return;
    }

    const email = localStorage.getItem('journal_user_email') || 'Account_Generico';
    let csvRows = [`"Account Trader: ${email}"`],
    csvRows.push("Data,Asset,Strategia,Direzione,Esito,RR,Note");
    
    trades.forEach(t => {
        const cleanNotes = (t.notes || '').replace(/"/g, '""').replace(/\n/g, ' ');
        csvRows.push(`"${t.date}","${t.asset}","${t.strategy}","${t.direction}","${t.result}","${t.rr}","${cleanNotes}"`);
    });

    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Trading_Journal_${email}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// BACKUP JSON CON DETTAGLIO EMAIL ACCOUNT
function exportJSON() {
    if (trades.length === 0) {
        alert("Nessun dato da salvare!");
        return;
    }

    const email = localStorage.getItem('journal_user_email') || 'Account_Generico';
    const backupObject = {
        userEmail: email,
        exportDate: new Date().toISOString(),
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
}

// RIPRISTINO BACKUP COMPATIBILE CON VECCHI E NUOVI FORMATI
function importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            // Supporta sia l'importazione diretta di array che la struttura con account email
            if (Array.isArray(importedData)) {
                trades = importedData;
            } else if (importedData && Array.isArray(importedData.trades)) {
                trades = importedData.trades;
                if (importedData.userEmail) {
                    localStorage.setItem('journal_user_email', importedData.userEmail);
                    document.getElementById('userEmail').value = importedData.userEmail;
                }
            } else {
                alert("File di backup non valido.");
                return;
            }

            saveData();
            renderTrades();
            alert("Backup ricaricato con successo!");
        } catch (err) {
            alert("Errore durante la lettura del file di backup.");
        }
        event.target.value = '';
    };

    reader.readAsText(file);
}

renderTrades();

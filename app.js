// ========================================
// CARICAMENTO INIZIALE & STORAGE LOCAL
// ========================================
let trades = [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Carica email salvata
    const userEmailInput = document.getElementById('userEmail');
    if (userEmailInput) {
        userEmailInput.value = localStorage.getItem('journal_user_email') || '';
    }

    // 2. Carica i dati dal localStorage
    const storedTrades = localStorage.getItem('trading_journal_data');
    if (storedTrades) {
        try {
            trades = JSON.parse(storedTrades);
        } catch (e) {
            console.error("Errore nel parsing del localStorage:", e);
            trades = [];
        }
    }

    // 3. Esegui il render iniziale
    updateDashboard();
    renderTrades();

    // 4. Inizializza l'evento per la chiusura della modale
    const closeModalBtn = document.querySelector('.close-modal');
    if (closeModalBtn) {
        closeModalBtn.onclick = () => {
            const modal = document.getElementById('imgModal');
            if (modal) modal.style.display = "none";
        };
    }

    // 5. Prova a inizializzare Google API se gli script sono già stati caricati
    initGoogleAPI();
});

function saveUserEmail() {
    const userEmailInput = document.getElementById('userEmail');
    if (userEmailInput) {
        localStorage.setItem('journal_user_email', userEmailInput.value);
    }
}

function saveTradesToStorage() {
    localStorage.setItem('trading_journal_data', JSON.stringify(trades));
    updateDashboard();
    renderTrades();
}

// ========================================
// GOOGLE DRIVE INTEGRATION (GIS v3)
// ========================================
const GOOGLE_CONFIG = {
    CLIENT_ID: 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com', // <--- Incolla qui il tuo Client ID da Google Cloud Console
    SCOPES: 'https://www.googleapis.com/auth/drive.file'
};

let tokenClient = null;
let accessToken = null;
let googleDriveFolderId = localStorage.getItem('trading_journal_drive_folder');

function initGoogleAPI() {
    // Inizializza gapi se disponibile
    if (window.gapi && (!gapi.client || !gapi.client.drive)) {
        gapi.load('client', async () => {
            try {
                await gapi.client.init({});
                await gapi.client.load('drive', 'v3');
            } catch (err) {
                console.error("Errore caricamento gapi client:", err);
            }
        });
    }

    // Inizializza tokenClient per OAuth2 GIS v3
    if (window.google && window.google.accounts && window.google.accounts.oauth2 && !tokenClient) {
        try {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CONFIG.CLIENT_ID,
                scope: GOOGLE_CONFIG.SCOPES,
                callback: (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        accessToken = tokenResponse.access_token;
                        updateGoogleAuthUI(true);
                        showNotification('✅ Connesso a Google Drive');
                    }
                },
            });
        } catch (err) {
            console.error("Errore inizializzazione TokenClient:", err);
        }
    }
}

function updateGoogleAuthUI(isConnected) {
    const btn = document.getElementById('googleDriveBtn');
    const driveButtons = document.getElementById('driveButtons');
    
    if (btn) {
        btn.style.opacity = isConnected ? '1' : '0.5';
        btn.innerHTML = isConnected ? '✅ Connesso a Drive' : '☁️ Connetti a Drive';
    }

    if (driveButtons) {
        driveButtons.style.display = isConnected ? 'flex' : 'none';
    }
}

function toggleGoogleSignIn() {
    // Se non è pronto, riprova a inizializzarlo al momento del click
    if (!tokenClient) {
        initGoogleAPI();
    }

    if (!tokenClient) {
        alert('⚠️ Impossibile connettersi a Google Drive. Assicurati di aver inserito un Client ID valido nel codice e di usare un server locale (es. Live Server).');
        return;
    }
    
    if (accessToken) {
        accessToken = null;
        updateGoogleAuthUI(false);
        showNotification('👋 Disconnesso da Google Drive');
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

async function ensureDriveFolder() {
    if (googleDriveFolderId) return googleDriveFolderId;
    
    try {
        const res = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'Trading Journal Backups',
                mimeType: 'application/vnd.google-apps.folder'
            })
        });
        const data = await res.json();
        googleDriveFolderId = data.id;
        localStorage.setItem('trading_journal_drive_folder', googleDriveFolderId);
        return googleDriveFolderId;
    } catch (err) {
        console.error('Errore creazione cartella:', err);
        throw err;
    }
}

async function backupToGoogleDrive() {
    if (!accessToken) {
        alert('⚠️ Accedi a Google Drive prima di fare il backup.');
        toggleGoogleSignIn();
        return;
    }

    if (trades.length === 0) {
        alert("❌ Nessun trade da salvare!");
        return;
    }

    try {
        showNotification('⏳ Backup in corso...');
        
        const folderId = await ensureDriveFolder();
        const email = localStorage.getItem('journal_user_email') || 'Account_Generico';
        
        const backupObject = {
            userEmail: email,
            exportDate: new Date().toISOString(),
            tradeCount: trades.length,
            trades: trades
        };

        const fileName = `Trading_Journal_${email}_${new Date().toISOString().slice(0, 10)}.json`;
        
        const metadata = {
            name: fileName,
            parents: [folderId],
            mimeType: 'application/json'
        };

        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', new Blob([JSON.stringify(backupObject, null, 2)], { type: 'application/json' }));

        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: formData
        });

        const file = await res.json();

        if (file.id) {
            localStorage.setItem('trading_journal_latest_drive_backup', file.id);
            showNotification(`✅ Backup salvato su Drive: ${fileName}`);
        } else {
            throw new Error(file.error?.message || 'Errore durante l\'upload');
        }
        
    } catch (err) {
        console.error('Drive upload error:', err);
        alert('❌ Errore nel backup su Drive:\n' + err.message);
    }
}

// ========================================
// CONFIGURAZIONE ASSET METATRADER
// ========================================
const assetConfig = {
    'forex_standard': {
        name: 'Forex (EUR/USD, GBP/USD)',
        pipValue: 10,
        description: 'Lotti calcolati su Forex Standard (1 lotto = $10/pip)'
    },
    'forex_jpy': {
        name: 'Forex JPY (USD/JPY)',
        pipValue: 8,
        description: 'Lotti calcolati su Coppie JPY (1 lotto = ~$8/pip)'
    },
    'gold': {
        name: 'Oro (XAUUSD)',
        pipValue: 10,
        description: 'Lotti calcolati per Oro MT4/MT5 (1 lotto = 100 oz)'
    },
    'indices_es': {
        name: 'S&P 500 (US500)',
        pipValue: 1,
        description: 'Lotti/Contratti CFD Indici (1 punto = $1)'
    },
    'indices_nq': {
        name: 'Nasdaq 100 (US100)',
        pipValue: 1,
        description: 'Lotti/Contratti CFD Indici (1 punto = $1)'
    },
    'indices_dax': {
        name: 'DAX (GER40)',
        pipValue: 1,
        description: 'Lotti/Contratti CFD Indici (1 punto = €1)'
    },
    'crypto_btc': {
        name: 'Bitcoin (BTCUSD)',
        pipValue: 1,
        description: 'Lotti Crypto MT4/MT5 (1 lotto = 1 BTC)'
    },
    'crypto_eth': {
        name: 'Ethereum (ETHUSD)',
        pipValue: 1,
        description: 'Lotti Crypto MT4/MT5 (1 lotto = 1 ETH)'
    }
};

// ========================================
// CALCOLATORE LOTTAGGIO
// ========================================
function calculateLotSize() {
    const balance = parseFloat(document.getElementById('calcBalance').value);
    const riskPercent = parseFloat(document.getElementById('calcRisk').value);
    const slPips = parseFloat(document.getElementById('calcSlPips').value);
    const assetType = document.getElementById('calcAssetType').value;

    if (!balance || !riskPercent || !slPips || slPips <= 0) {
        alert("Compila tutti i campi con valori validi.");
        return;
    }

    if (!assetConfig[assetType]) {
        alert("Seleziona un asset valido.");
        return;
    }

    const config = assetConfig[assetType];
    const riskAmount = balance * (riskPercent / 100);
    const currency = config.name.includes('DAX') ? '€' : '$';
    
    const lotSize = riskAmount / (slPips * config.pipValue);
    
    const resultBox = document.getElementById('calcResult');
    if (resultBox) {
        resultBox.style.display = 'block';
    }

    const lotText = document.getElementById('lotResultText');
    if (lotText) {
        lotText.textContent = lotSize.toFixed(2);
    }

    const riskText = document.getElementById('riskAmountText');
    if (riskText) {
        riskText.innerHTML = `
            💰 <strong>Rischio Totale:</strong> ${riskAmount.toFixed(2)}${currency} (${riskPercent}%)<br>
            <span style="color: #22c55e; font-size: 0.85em; font-weight: bold;">✅ ${config.description}</span>
        `;
    }
}

// ========================================
// GESTIONE TRADES (FORM & TABELLA)
// ========================================
const tradeForm = document.getElementById('tradeForm');
if (tradeForm) {
    tradeForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const imageInput = document.getElementById('imageFile');
        let imageData = '';

        if (imageInput && imageInput.files && imageInput.files[0]) {
            imageData = await convertBase64(imageInput.files[0]);
        }

        const newTrade = {
            id: Date.now(),
            date: document.getElementById('date').value,
            asset: document.getElementById('asset').value.toUpperCase(),
            strategy: document.getElementById('strategy').value,
            direction: document.getElementById('direction').value,
            result: document.getElementById('result').value,
            rr: document.getElementById('rr').value,
            profit: parseFloat(document.getElementById('profit').value) || 0,
            image: imageData,
            notes: document.getElementById('notes').value
        };

        trades.unshift(newTrade);
        saveTradesToStorage();
        tradeForm.reset();
        showNotification('✅ Trade salvato con successo!');
    });
}

function convertBase64(file) {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.readAsDataURL(file);
        fileReader.onload = () => resolve(fileReader.result);
        fileReader.onerror = (error) => reject(error);
    });
}

function deleteTrade(id) {
    if (confirm("Sei sicuro di voler eliminare questo trade?")) {
        trades = trades.filter(t => t.id !== id);
        saveTradesToStorage();
        showNotification('🗑️ Trade eliminato.');
    }
}

function renderTrades() {
    const tbody = document.getElementById('tradeTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    trades.forEach(trade => {
        const tr = document.createElement('tr');
        
        let resultBadge = '';
        if (trade.result === 'WIN') resultBadge = '<span style="color:#22c55e; font-weight:bold;">🟢 WIN</span>';
        else if (trade.result === 'LOSS') resultBadge = '<span style="color:#ef4444; font-weight:bold;">🔴 LOSS</span>';
        else resultBadge = '<span style="color:#eab308; font-weight:bold;">🟡 BE</span>';

        const imgHTML = trade.image 
            ? `<button class="btn-secondary" style="padding: 2px 8px;" onclick="openImageModal('${trade.image}')">🖼️ Vedi</button>` 
            : '-';

        tr.innerHTML = `
            <td>${trade.date}</td>
            <td><strong>${trade.asset}</strong></td>
            <td>${trade.strategy}</td>
            <td>${trade.direction === 'LONG' ? '📈 LONG' : '📉 SHORT'}</td>
            <td>${resultBadge}</td>
            <td>${trade.rr}</td>
            <td style="color: ${trade.profit >= 0 ? '#22c55e' : '#ef4444'}; font-weight: bold;">
                ${trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)}
            </td>
            <td>${imgHTML}</td>
            <td>${trade.notes || '-'}</td>
            <td><button onclick="deleteTrade(${trade.id})" style="background:none; border:none; cursor:pointer; font-size:1.1em;">❌</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function updateDashboard() {
    const total = trades.length;
    const wins = trades.filter(t => t.result === 'WIN').length;
    const losses = trades.filter(t => t.result === 'LOSS').length;
    const be = trades.filter(t => t.result === 'BE').length;

    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : 0;
    const totalProfit = trades.reduce((acc, t) => acc + t.profit, 0);

    let totalRR = 0;
    trades.forEach(t => {
        if (t.result === 'WIN') {
            const parts = t.rr.split(':');
            if (parts.length === 2) totalRR += parseFloat(parts[1]);
        } else if (t.result === 'LOSS') {
            totalRR -= 1;
        }
    });

    const elTotal = document.getElementById('statTotal');
    const elWinRate = document.getElementById('statWinRate');
    const elWLB = document.getElementById('statWLB');
    const elRR = document.getElementById('statRR');
    const elProfit = document.getElementById('statProfit');

    if (elTotal) elTotal.textContent = total;
    if (elWinRate) elWinRate.textContent = `${winRate}%`;
    if (elWLB) elWLB.textContent = `${wins} / ${losses} / ${be}`;
    if (elRR) elRR.textContent = `${totalRR.toFixed(1)} R`;
    if (elProfit) {
        elProfit.textContent = `${totalProfit.toFixed(2)} €/$`;
        elProfit.style.color = totalProfit >= 0 ? '#22c55e' : '#ef4444';
    }
}

// ========================================
// MODALE IMMAGINI & NOTIFICHE
// ========================================
function openImageModal(src) {
    const modal = document.getElementById('imgModal');
    const modalImg = document.getElementById('modalImg');
    if (modal && modalImg) {
        modal.style.display = "flex";
        modalImg.src = src;
    }
}

function showNotification(msg) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        background: #1e293b; color: #fff; padding: 12px 20px;
        border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000; animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ========================================
// IMPORT / EXPORT LOCALE
// ========================================
function exportJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(trades, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `trading_journal_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
}

function importJSON(event) {
    const fileReader = new FileReader();
    fileReader.onload = function (e) {
        try {
            const importedTrades = JSON.parse(e.target.result);
            if (Array.isArray(importedTrades)) {
                trades = importedTrades;
                saveTradesToStorage();
                showNotification('✅ Backup importato con successo!');
            } else {
                alert('Formato file non valido.');
            }
        } catch (err) {
            alert('Errore nel caricamento del file JSON.');
        }
    };
    if (event.target.files && event.target.files[0]) {
        fileReader.readAsText(event.target.files[0]);
    }
}

function exportCSV() {
    if (trades.length === 0) {
        alert("Nessun trade da esportare.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,Data,Asset,Strategia,Direzione,Esito,RR,Profitto,Note\n";
    trades.forEach(t => {
        csvContent += `"${t.date}","${t.asset}","${t.strategy}","${t.direction}","${t.result}","${t.rr}","${t.profit}","${(t.notes || '').replace(/"/g, '""')}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `report_trading_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
}

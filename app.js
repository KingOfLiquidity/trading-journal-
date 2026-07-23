// CARICAMENTO EMAIL SALVATA
document.getElementById('userEmail').value = localStorage.getItem('journal_user_email') || '';

let trades = JSON.parse(localStorage.getItem('trading_journal_data')) || [];

// ========================================
// GOOGLE DRIVE INTEGRATION SETUP
// ========================================
const GOOGLE_CONFIG = {
    API_KEY: 'YOUR_API_KEY_HERE',          // TODO: Sostituisci con la tua API Key da Google Cloud Console
    CLIENT_ID: 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com',  // TODO: Sostituisci con il tuo Client ID
    SCOPES: ['https://www.googleapis.com/auth/drive.file']
};

let googleAuth = null;
let isGoogleSignedIn = false;
let googleDriveFolderId = null;

function initGoogleAPI() {
    if (!window.gapi) {
        console.warn('⚠️ Google API non caricato. Verifica il tag <script>');
        return;
    }

    gapi.load('client:auth2', () => {
        gapi.client.init({
            apiKey: GOOGLE_CONFIG.API_KEY,
            clientId: GOOGLE_CONFIG.CLIENT_ID,
            scope: GOOGLE_CONFIG.SCOPES
        }).then(() => {
            googleAuth = gapi.auth2.getAuthInstance();
            googleDriveFolderId = localStorage.getItem('trading_journal_drive_folder');
            updateGoogleAuthUI();
            googleAuth.isSignedIn.listen(updateGoogleAuthUI);
        }).catch(err => {
            console.error('❌ Errore Google API init:', err);
            updateGoogleAuthUI();
        });
    });
}

function updateGoogleAuthUI() {
    isGoogleSignedIn = googleAuth?.isSignedIn.get() || false;
    const btn = document.getElementById('googleDriveBtn');
    const driveButtons = document.getElementById('driveButtons');
    
    if (btn) {
        btn.style.opacity = isGoogleSignedIn ? '1' : '0.5';
        btn.innerHTML = isGoogleSignedIn 
            ? '✅ Connesso a Drive' 
            : '☁️ Connetti a Drive';
    }

    if (driveButtons) {
        driveButtons.style.display = isGoogleSignedIn ? 'flex' : 'none';
    }
}

function toggleGoogleSignIn() {
    if (!googleAuth) {
        alert('⚠️ Google API non disponibile. Controlla la configurazione.');
        return;
    }
    
    if (isGoogleSignedIn) {
        googleAuth.signOut().then(() => {
            isGoogleSignedIn = false;
            updateGoogleAuthUI();
            showNotification('👋 Disconnesso da Google Drive');
        });
    } else {
        googleAuth.signIn().then(() => {
            isGoogleSignedIn = true;
            updateGoogleAuthUI();
            showNotification('✅ Connesso a Google Drive');
        }).catch(err => {
            console.error('Sign-in error:', err);
            alert('❌ Errore nell\'accesso: ' + err.error);
        });
    }
}

async function ensureDriveFolder() {
    if (googleDriveFolderId) return googleDriveFolderId;

    try {
        const response = await gapi.client.drive.files.create({
            resource: {
                name: 'Trading Journal Backups',
                mimeType: 'application/vnd.google-apps.folder'
            },
            fields: 'id'
        });
        
        googleDriveFolderId = response.result.id;
        localStorage.setItem('trading_journal_drive_folder', googleDriveFolderId);
        return googleDriveFolderId;
    } catch (err) {
        console.error('Errore creazione folder:', err);
        throw err;
    }
}

async function backupToGoogleDrive() {
    if (!isGoogleSignedIn) {
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
            exportTimestamp: new Date().getTime(),
            tradeCount: trades.length,
            trades: trades
        };

        const fileContent = JSON.stringify(backupObject, null, 2);
        const fileName = `Trading_Journal_${email}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`;

        const response = await gapi.client.drive.files.create({
            resource: {
                name: fileName,
                parents: [folderId],
                mimeType: 'application/json',
                description: `Trading Journal Backup - ${new Date().toLocaleString()}`
            },
            media: {
                mimeType: 'application/json',
                body: fileContent
            },
            fields: 'id, webViewLink'
        });

        const fileId = response.result.id;
        const driveLink = response.result.webViewLink;

        localStorage.setItem('trading_journal_latest_drive_backup', fileId);
        localStorage.setItem('trading_journal_latest_drive_link', driveLink);

        showNotification(`✅ Backup salvato: ${fileName.substring(0, 30)}...`);
        
        // Copia link negli appunti automaticamente
        await copyToClipboard(driveLink);
        
    } catch (err) {
        console.error('Drive upload error:', err);
        alert('❌ Errore nel backup su Drive:\n' + err.message);
    }
}

async function restoreFromGoogleDrive() {
    if (!isGoogleSignedIn) {
        alert('⚠️ Accedi a Google Drive prima di ripristinare.');
        toggleGoogleSignIn();
        return;
    }

    try {
        showNotification('⏳ Ripristino in corso...');
        
        const backupId = localStorage.getItem('trading_journal_latest_drive_backup');
        if (!backupId) {
            alert("❌ Nessun backup trovato su Drive.\n\nFai prima un backup con il pulsante '💾 Backup to Drive'");
            return;
        }

        const response = await gapi.client.drive.files.get({
            fileId: backupId,
            alt: 'media'
        });

        const importedData = response.result;
        let importedTrades = [];

        if (Array.isArray(importedData)) {
            importedTrades = importedData;
        } else if (importedData?.trades && Array.isArray(importedData.trades)) {
            importedTrades = importedData.trades;
            if (importedData.userEmail) {
                localStorage.setItem('journal_user_email', importedData.userEmail);
                document.getElementById('userEmail').value = importedData.userEmail;
            }
        }

        if (!Array.isArray(importedTrades) || importedTrades.length === 0) {
            alert("⚠️ Backup vuoto o formato non valido.");
            return;
        }

        const merge = confirm(
            `📊 Trovati ${importedTrades.length} trade dal backup.\n\n` +
            `Attualmente hai ${trades.length} trade.\n\n` +
            `✅ OK = AGGIUNGI ai trade esistenti\n` +
            `❌ ANNULLA = SOSTITUISCI tutti i trade`
        );

        trades = merge ? [...importedTrades, ...trades] : importedTrades;
        saveData();
        renderTrades();
        showNotification(`✅ ${importedTrades.length} trade ripristinati!`);
    } catch (err) {
        console.error('Drive restore error:', err);
        alert('❌ Errore nel ripristino:\n' + err.message);
    }
}

async function listGoogleDriveBackups() {
    if (!isGoogleSignedIn) {
        alert('⚠️ Accedi a Google Drive prima.');
        toggleGoogleSignIn();
        return;
    }

    try {
        const folderId = localStorage.getItem('trading_journal_drive_folder');
        if (!folderId) {
            alert("❌ Nessuna cartella di backup trovata su Drive.");
            return;
        }

        const response = await gapi.client.drive.files.list({
            q: `'${folderId}' in parents and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name, createdTime, webViewLink, size)',
            orderBy: 'createdTime desc',
            pageSize: 10
        });

        const files = response.result.files;
        if (!files || files.length === 0) {
            alert('❌ Nessun backup trovato su Drive.');
            return;
        }

        let list = '📋 Backup disponibili su Drive:\n\n';
        files.forEach((f, i) => {
            const date = new Date(f.createdTime).toLocaleString();
            const size = f.size ? (f.size / 1024).toFixed(1) + ' KB' : '?';
            list += `${i + 1}. ${f.name}\n   📅 ${date} | 💾 ${size}\n\n`;
        });

        alert(list);
    } catch (err) {
        console.error('List error:', err);
        alert('❌ Errore nell\'elenco backup:\n' + err.message);
    }
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showNotification('📋 Link copiato negli appunti!');
    } catch (err) {
        console.error('Copy error:', err);
    }
}

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

// ========================================
// CONFIGURAZIONE PRECISA PER ASSET CLASSES
// ========================================
const assetConfig = {
    // FOREX STANDARD (1:100 leverage tipico)
    'forex_standard': {
        name: 'EUR/USD, GBP/USD, USD/CHF',
        type: 'forex_pip',
        lotSize: 100000,              // 1 lotto standard = 100k unità
        pipValue: 10,                 // 1 pip = $10 per lotto
        pipDecimals: 4,               // EUR/USD ha 4 decimali (0.0001)
        description: '✅ Lotti standard Forex'
    },
    
    // FOREX JPY (1:100 leverage tipico - pip più grande)
    'forex_jpy': {
        name: 'USD/JPY, EUR/JPY, GBP/JPY',
        type: 'forex_pip',
        lotSize: 100000,
        pipValue: 8,                  // 1 pip JPY = ~$8 per lotto (perché JPY ha 2 decimali)
        pipDecimals: 2,               // USD/JPY ha 2 decimali (0.01)
        description: '✅ Forex coppie JPY'
    },
    
    // ORO XAUUSD (spot trading, non futures)
    'gold': {
        name: 'Oro (XAUUSD)',
        type: 'commodity_unit',
        lotSize: 1,                   // Spesso 1 lotto = 1 oz d'oro
        unitValue: 0.1,               // Valore di 1 unità movimento (tipicamente $0.10 per oz)
        unitDecimals: 1,              // XAUUSD ha 1 decimale (movimento minimo = $0.1)
        description: '📊 Commodity: 1 Oz'
    },
    
    // E-MINI S&P 500 FUTURES (Micro)
    'indices_es': {
        name: 'E-mini S&P 500 (ES)',
        type: 'futures_contract',
        contractMultiplier: 50,       // 1 punto × $50 = P&L
        pointValue: 1,                // Movimento di 1 punto indice
        tickValue: 12.50,             // 1 tick (0.25 punto) = $12.50
        minMove: 0.25,                // Minimo movimento
        description: '📊 Futures: $50/punto'
    },
    
    // E-MINI NASDAQ 100 FUTURES
    'indices_nq': {
        name: 'E-mini Nasdaq 100 (NQ)',
        type: 'futures_contract',
        contractMultiplier: 20,       // 1 punto × $20 = P&L
        pointValue: 1,
        tickValue: 5,                 // 1 tick (0.25 punto) = $5
        minMove: 0.25,
        description: '📊 Futures: $20/punto'
    },
    
    // DAX FUTURES
    'indices_dax': {
        name: 'DAX Futures (FDAX)',
        type: 'futures_contract',
        contractMultiplier: 25,       // 1 punto × €25 = P&L (in EUR)
        pointValue: 1,
        tickValue: 1,                 // 1 tick = €1
        minMove: 1,                   // Minimo movimento = 1 punto
        description: '📊 Futures: €25/punto'
    },
    
    // BITCOIN FUTURES PERPETUI (USDT/USD)
    'crypto_btc': {
        name: 'Bitcoin Perpetui (BTC)',
        type: 'crypto_perpetual',
        contractSize: 1,              // 1 contratto = 1 BTC
        quoteAsset: 'USDT',
        leverage: 20,                 // Leverage max (gestito dall'utente)
        description: '💰 Perpetui: 1 contratto = 1 BTC'
    },
    
    // ETHEREUM FUTURES PERPETUI (USDT/USD)
    'crypto_eth': {
        name: 'Ethereum Perpetui (ETH)',
        type: 'crypto_perpetual',
        contractSize: 1,              // 1 contratto = 1 ETH
        quoteAsset: 'USDT',
        leverage: 20,
        description: '💰 Perpetui: 1 contratto = 1 ETH'
    }
};

// ========================================
// CALCOLATORE LOTTAGGIO CORRETTO
// ========================================
function calculateLotSize() {
    const balance = parseFloat(document.getElementById('calcBalance').value);
    const riskPercent = parseFloat(document.getElementById('calcRisk').value);
    const slPips = parseFloat(document.getElementById('calcSlPips').value);
    const assetType = document.getElementById('calcAssetType').value;

    // Validazione input
    if (!balance || !riskPercent || !slPips || slPips <= 0) {
        alert("Inserisci valori validi per il calcolo.");
        return;
    }

    if (!assetConfig[assetType]) {
        alert("Tipo di asset non riconosciuto. Seleziona un'opzione valida.");
        return;
    }

    const config = assetConfig[assetType];
    const riskAmount = balance * (riskPercent / 100);
    
    let result = {};

    // ========== FOREX (Pip-based) ==========
    if (config.type === 'forex_pip') {
        // Formula: Lot Size = Risk Amount / (SL in Pips × Pip Value)
        const lotSize = riskAmount / (slPips * config.pipValue);
        const totalRiskExposure = slPips * config.pipValue * lotSize;
        
        result = {
            positionSize: lotSize.toFixed(3),
            unit: 'Lotti',
            riskAmount: riskAmount.toFixed(2),
            totalExposure: totalRiskExposure.toFixed(2),
            currency: '$',
            details: `
                <div style="margin-top: 8px; font-size: 0.95em;">
                    <div>💰 Rischio Capitale: ${riskAmount.toFixed(2)}$</div>
                    <div>📊 Esposizione SL: ${totalRiskExposure.toFixed(2)}$</div>
                    <div style="font-size: 0.85em; color: #666; margin-top: 8px;">
                        <strong>${config.name}</strong><br>
                        SL: ${slPips} pips × ${config.pipValue}$ = ${(slPips * config.pipValue).toFixed(2)}$ per lotto<br>
                        Lotti da aprire: ${lotSize.toFixed(3)}
                    </div>
                    <div style="font-size: 0.85em; color: #22c55e; margin-top: 5px; font-weight: bold;">✅ ${config.description}</div>
                </div>
            `
        };
    }

    // ========== MATERIE PRIME (Oro, etc - Unit Based) ==========
    else if (config.type === 'commodity_unit') {
        // Formula: Position Size = Risk Amount / (SL in Unità × Valore Unitario)
        const positionSize = riskAmount / (slPips * config.unitValue);
        const totalRiskExposure = slPips * config.unitValue * positionSize;
        
        result = {
            positionSize: positionSize.toFixed(2),
            unit: 'Oz',
            riskAmount: riskAmount.toFixed(2),
            totalExposure: totalRiskExposure.toFixed(2),
            currency: '$',
            details: `
                <div style="margin-top: 8px; font-size: 0.95em;">
                    <div>💰 Rischio Capitale: ${riskAmount.toFixed(2)}$</div>
                    <div>📊 Esposizione SL: ${totalRiskExposure.toFixed(2)}$</div>
                    <div style="font-size: 0.85em; color: #666; margin-top: 8px;">
                        <strong>${config.name}</strong><br>
                        SL: ${slPips} unità × ${config.unitValue}$ = ${(slPips * config.unitValue).toFixed(2)}$ per lotto<br>
                        Posizione: ${positionSize.toFixed(2)} Oz
                    </div>
                    <div style="font-size: 0.85em; color: #22c55e; margin-top: 5px; font-weight: bold;">✅ ${config.description}</div>
                </div>
            `
        };
    }

    // ========== FUTURES INDICI (Contract-based) ==========
    else if (config.type === 'futures_contract') {
        // Formula: Contract Size = Risk Amount / (SL in Punti × Moltiplicatore)
        const contracts = riskAmount / (slPips * config.contractMultiplier);
        const totalRiskExposure = slPips * config.contractMultiplier * contracts;
        
        result = {
            positionSize: contracts.toFixed(2),
            unit: 'Contratti',
            riskAmount: riskAmount.toFixed(2),
            totalExposure: totalRiskExposure.toFixed(2),
            currency: config.name.includes('DAX') ? '€' : '$',
            details: `
                <div style="margin-top: 8px; font-size: 0.95em;">
                    <div>💰 Rischio Capitale: ${riskAmount.toFixed(2)}${config.name.includes('DAX') ? '€' : '$'}</div>
                    <div>📊 Esposizione SL: ${totalRiskExposure.toFixed(2)}${config.name.includes('DAX') ? '€' : '$'}</div>
                    <div style="font-size: 0.85em; color: #666; margin-top: 8px;">
                        <strong>${config.name}</strong><br>
                        SL: ${slPips} punti × ${config.contractMultiplier}${config.name.includes('DAX') ? '€' : '$'}/punto = ${(slPips * config.contractMultiplier).toFixed(2)}${config.name.includes('DAX') ? '€' : '$'}/lotto<br>
                        Contratti: ${contracts.toFixed(2)} (es: ${Math.floor(contracts)} interi + ${Math.round((contracts - Math.floor(contracts)) * 100)}% del micro)
                    </div>
                    <div style="font-size: 0.85em; color: #22c55e; margin-top: 5px; font-weight: bold;">⚠️ ${config.description}</div>
                </div>
            `
        };
    }

    // ========== CRYPTO PERPETUI (Special handling) ==========
    else if (config.type === 'crypto_perpetual') {
        // Per i perpetui è più complesso: dipende dal prezzo corrente e dal leverage
        // Formula semplificata: Position Size = Risk Amount / (SL in USD × Leverage)
        // NB: SL qui è in USDT, non in unità della crypto
        
        const positionSize = (riskAmount / slPips).toFixed(4);  // Quantità di crypto
        const totalRiskExposure = slPips;  // SL in USDT è già il rischio
        
        result = {
            positionSize: positionSize,
            unit: 'Contratti',
            riskAmount: riskAmount.toFixed(2),
            totalExposure: totalRiskExposure.toFixed(2),
            currency: 'USDT',
            details: `
                <div style="margin-top: 8px; font-size: 0.95em;">
                    <div>💰 Rischio Capitale: ${riskAmount.toFixed(2)} USDT</div>
                    <div>📊 SL in USDT: ${totalRiskExposure.toFixed(2)} USDT</div>
                    <div style="font-size: 0.85em; color: #666; margin-top: 8px;">
                        <strong>${config.name}</strong><br>
                        Quantità: ${positionSize} ${config.name.includes('BTC') ? 'BTC' : 'ETH'}<br>
                        SL: ${slPips} USDT (inserisci il valore USDT del tuo stop)<br>
                        <strong style="color: #f59e0b;">⚠️ Nota:</strong> Inserisci SL in USDT, non in prezzo!
                    </div>
                    <div style="font-size: 0.85em; color: #f59e0b; margin-top: 5px; font-weight: bold;">⚠️ ${config.description}</div>
                    <div style="font-size: 0.8em; background: #fef3c7; padding: 6px; border-radius: 4px; margin-top: 6px;">
                        💡 <strong>Leverage:</strong> Puoi aumentare posizione con ${config.leverage}x. Questo calcolo è per 1x.
                    </div>
                </div>
            `
        };
    }

    // Visualizza risultato
    document.getElementById('lotResultText').innerText = `${result.positionSize} ${result.unit}`;
    document.getElementById('riskAmountText').innerHTML = result.details;
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
            console.error('Errore salvataggio:', err);
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

// Inizializza Google API quando pagina carica
document.addEventListener('DOMContentLoaded', () => {
    initGoogleAPI();
    
    // Inizializza la data di oggi
    document.getElementById('date').valueAsDate = new Date();
    
    // Event listener per modale
    document.getElementById('imgModal').addEventListener('click', closeModal);
    
    // Load stats on page load
    renderTrades();
});

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

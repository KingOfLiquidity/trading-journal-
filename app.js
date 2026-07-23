// CARICAMENTO EMAIL SALVATA
document.getElementById('userEmail').value = localStorage.getItem('journal_user_email') || '';
let trades = JSON.parse(localStorage.getItem('trading_journal_data')) || [];

// ========================================
// GOOGLE DRIVE INTEGRATION SETUP (GIS v3)
// ========================================
const GOOGLE_CONFIG = {
    CLIENT_ID: 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com', // TODO: Inserisci il tuo Client ID
    SCOPES: 'https://www.googleapis.com/auth/drive.file'
};

let tokenClient = null;
let accessToken = null;
let googleDriveFolderId = localStorage.getItem('trading_journal_drive_folder');

function initGoogleAPI() {
    // Inizializza il client Drive
    if (window.gapi) {
        gapi.load('client', async () => {
            await gapi.client.init({});
            await gapi.client.load('drive', 'v3');
        });
    }

    // Inizializza l'autenticazione OAuth2
    if (window.google) {
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
    if (!tokenClient) {
        alert('⚠️ Google API non ancora pronta. Attendi qualche secondo.');
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
        
        // Creazione richiesta multipart per inviare JSON puro
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
            showNotification(`✅ Backup salvato: ${fileName.substring(0, 25)}...`);
        } else {
            throw new Error(file.error?.message || 'Errore durante l\'upload');
        }
        
    } catch (err) {
        console.error('Drive upload error:', err);
        alert('❌ Errore nel backup su Drive:\n' + err.message);
    }
}

// ========================================
// CONFIGURAZIONE ASSET (STILE METATRADER)
// ========================================
// Ho mantenuto i tuoi ID originali così il tuo HTML continua a funzionare, 
// ma i valori sono mappati per produrre il lotto puro come su MT4/MT5.
const assetConfig = {
    'forex_standard': {
        name: 'Forex (EUR/USD, GBP/USD)',
        pipValue: 10, // 1 lotto standard = 10$ a pip
        description: 'Lotti calcolati su 1 pip = 10$'
    },
    'forex_jpy': {
        name: 'Forex JPY (USD/JPY)',
        pipValue: 8, // Approssimazione tipica
        description: 'Lotti calcolati su 1 pip = ~8$'
    },
    'gold': {
        name: 'Oro (XAUUSD)',
        pipValue: 10, // Su MT4 1 lotto = 100oz = 10$ per pip (0.10)
        description: 'Lotti calcolati stile MT4 (1 lotto = 100oz)'
    },
    'indices_es': {
        name: 'S&P 500 (US500)',
        pipValue: 1, // CFD Indici MT4: 1 lotto = 1$ a punto
        description: 'Lotti calcolati: 1 punto = 1$'
    },
    'indices_nq': {
        name: 'Nasdaq 100 (US100)',
        pipValue: 1,
        description: 'Lotti calcolati: 1 punto = 1$'
    },
    'indices_dax': {
        name: 'DAX (GER40)',
        pipValue: 1,
        description: 'Lotti calcolati: 1 punto = 1€'
    },
    'crypto_btc': {
        name: 'Bitcoin (BTCUSD)',
        pipValue: 1, // 1 lotto MT4 = 1 BTC = 1$ di P&L ogni 1$ di movimento
        description: 'Lotti calcolati: 1 lotto = 1 BTC'
    },
    'crypto_eth': {
        name: 'Ethereum (ETHUSD)',
        pipValue: 1,
        description: 'Lotti calcolati: 1 lotto = 1 ETH'
    }
};

// ========================================
// CALCOLATORE LOTTAGGIO UNIFICATO
// ========================================
function calculateLotSize() {
    const balance = parseFloat(document.getElementById('calcBalance').value);
    const riskPercent = parseFloat(document.getElementById('calcRisk').value);
    const slPips = parseFloat(document.getElementById('calcSlPips').value); // Che siano pip, punti o $ di SL
    const assetType = document.getElementById('calcAssetType').value;

    if (!balance || !riskPercent || !slPips || slPips <= 0) {
        alert("Inserisci valori validi per il calcolo.");
        return;
    }

    if (!assetConfig[assetType]) {
        alert("Tipo di asset non riconosciuto.");
        return;
    }

    const config = assetConfig[assetType];
    const riskAmount = balance * (riskPercent / 100);
    const currency = config.name.includes('DAX') ? '€' : '$';
    
    // Formula universale per lotti MetaTrader: Rischio in Denaro / (Stop Loss * Valore di 1 Lotto)
    const lotSize = riskAmount / (slPips * config.pipValue);
    
    // Il risultato restituisce SEMPRE "Lotti" come unità di misura, formattato a 2 o 3 decimali
    let result = {
        positionSize: lotSize.toFixed(2), 
        unit: 'Lotti',
        riskAmount: riskAmount.toFixed(2),
        currency: currency,
        details: `
            <div style="margin-top: 8px; font-size: 0.95em;">
                <div>💰 Rischio Capitale: ${riskAmount.toFixed(2)}${currency}</div>
                <div style="font-size: 0.85em; color: #666; margin-top: 8px;">
                    <strong>${config.name}</strong><br>
                    Distanza SL: ${slPips} pips/punti<br>
                </div>
                <div style="font-size: 0.85em; color: #22c55e; margin-top: 5px; font-weight: bold;">✅ ${config.description}</div>
            </div>
        `
    };

    // Stampa il risultato (adattalo al tuo HTML se necessario)
    console.log(result);
    // document.getElementById('resultOutput').innerHTML = result.positionSize + ' ' + result.unit;
}

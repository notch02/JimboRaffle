// JimboRaffle - Solana Raffle dApp
// Main JavaScript file for wallet integration and Solana Program interaction

import { SOLANA_NETWORK, COMMISSION_WALLET, COMMISSION_PERCENTAGE, PROGRAM_ID } from './config.js';

// ===== GLOBAL STATE =====
let walletConnected = false;
let walletPublicKey = null;
let connection = null;
let raffles = []; // Store raffles (in production, fetch from blockchain)

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    initializeSolana();
    setupEventListeners();
    updatePrizePreview();

    // Load raffles (mock data for now - replace with blockchain fetch)
    loadRaffles();
});

// ===== SOLANA INITIALIZATION =====
function initializeSolana() {
    const endpoint = SOLANA_NETWORK === 'mainnet-beta'
        ? 'https://api.mainnet-beta.solana.com'
        : 'https://api.devnet.solana.com';

    connection = new solanaWeb3.Connection(endpoint, 'confirmed');
    console.log(`Connected to Solana ${SOLANA_NETWORK}`);
}

// ===== WALLET CONNECTION =====
async function connectWallet() {
    try {
        // Check if Phantom or Solflare is installed
        const provider = getWalletProvider();

        if (!provider) {
            alert('Please install Phantom or Solflare wallet extension!');
            window.open('https://phantom.app/', '_blank');
            return;
        }

        // Connect to wallet
        const resp = await provider.connect();
        walletPublicKey = resp.publicKey;
        walletConnected = true;

        console.log('Wallet connected:', walletPublicKey.toString());
        updateWalletUI();
        loadMyRaffles();

    } catch (error) {
        console.error('Error connecting wallet:', error);
        alert('Failed to connect wallet. Please try again.');
    }
}

async function disconnectWallet() {
    try {
        const provider = getWalletProvider();
        if (provider) {
            await provider.disconnect();
        }

        walletConnected = false;
        walletPublicKey = null;
        updateWalletUI();

        console.log('Wallet disconnected');
    } catch (error) {
        console.error('Error disconnecting wallet:', error);
    }
}

function getWalletProvider() {
    if (window.solana && window.solana.isPhantom) {
        return window.solana;
    } else if (window.solflare && window.solflare.isSolflare) {
        return window.solflare;
    }
    return null;
}

function updateWalletUI() {
    const walletButton = document.getElementById('walletButton');

    if (walletConnected && walletPublicKey) {
        const address = walletPublicKey.toString();
        const shortAddress = `${address.slice(0, 4)}...${address.slice(-4)}`;
        walletButton.innerHTML = `<span class="wallet-address">${shortAddress}</span>`;
        walletButton.onclick = disconnectWallet;
    } else {
        walletButton.textContent = 'Connect Wallet';
        walletButton.onclick = connectWallet;
    }
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    // Wallet button
    document.getElementById('walletButton').addEventListener('click', connectWallet);

    // Create raffle form
    document.getElementById('createRaffleForm').addEventListener('submit', handleCreateRaffle);

    // Join private raffle form
    document.getElementById('joinPrivateForm').addEventListener('submit', handleJoinPrivate);

    // Private raffle checkbox
    document.getElementById('isPrivate').addEventListener('change', (e) => {
        const inviteCodeGroup = document.getElementById('inviteCodeGroup');
        if (e.target.checked) {
            inviteCodeGroup.classList.remove('hidden');
            generateInviteCode();
        } else {
            inviteCodeGroup.classList.add('hidden');
        }
    });

    // Prize preview updates
    document.getElementById('ticketPrice').addEventListener('input', updatePrizePreview);
    document.getElementById('totalTickets').addEventListener('input', updatePrizePreview);
}

// ===== RAFFLE CREATION =====
async function handleCreateRaffle(e) {
    e.preventDefault();

    if (!walletConnected) {
        alert('Please connect your wallet first!');
        return;
    }

    const ticketPrice = parseFloat(document.getElementById('ticketPrice').value);
    const totalTickets = parseInt(document.getElementById('totalTickets').value);
    const isPrivate = document.getElementById('isPrivate').checked;
    const inviteCode = document.getElementById('inviteCodeDisplay').value;

    try {
        // Show loading state
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Creating...';
        submitBtn.disabled = true;

        // Convert SOL to lamports
        const ticketPriceLamports = ticketPrice * solanaWeb3.LAMPORTS_PER_SOL;

        // Create raffle on-chain
        await createRaffleOnChain(ticketPriceLamports, totalTickets, isPrivate, inviteCode);

        // Reset form
        e.target.reset();
        document.getElementById('inviteCodeGroup').classList.add('hidden');

        alert('Raffle created successfully!');

        // Reload raffles
        loadRaffles();

        submitBtn.textContent = originalText;
        submitBtn.disabled = false;

    } catch (error) {
        console.error('Error creating raffle:', error);
        alert('Failed to create raffle: ' + error.message);

        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Create Raffle';
        submitBtn.disabled = false;
    }
}

async function createRaffleOnChain(ticketPrice, totalTickets, isPrivate, inviteCode) {
    // NOTE: This is a simplified version. In production, you need to:
    // 1. Create instruction data using borsh serialization
    // 2. Create raffle account (PDA)
    // 3. Send transaction to Solana Program

    console.log('Creating raffle on-chain...');
    console.log('Ticket Price:', ticketPrice, 'lamports');
    console.log('Total Tickets:', totalTickets);
    console.log('Is Private:', isPrivate);
    console.log('Invite Code:', inviteCode);

    // For demo purposes, store locally
    // In production, this would be a transaction to the Solana Program
    const raffle = {
        id: Date.now().toString(),
        creator: walletPublicKey.toString(),
        ticketPrice: ticketPrice,
        totalTickets: totalTickets,
        soldTickets: 0,
        isPrivate: isPrivate,
        inviteCode: isPrivate ? inviteCode : null,
        participants: [],
        winner: null,
        status: 'active',
        prizePool: 0,
        createdAt: Date.now()
    };

    raffles.push(raffle);
    localStorage.setItem('raffles', JSON.stringify(raffles));

    // TODO: Replace with actual Solana Program transaction
    /*
    const instruction = new solanaWeb3.TransactionInstruction({
        keys: [
            { pubkey: walletPublicKey, isSigner: true, isWritable: true },
            { pubkey: rafflePDA, isSigner: false, isWritable: true },
            { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false }
        ],
        programId: new solanaWeb3.PublicKey(PROGRAM_ID),
        data: Buffer.from([...]) // Serialized instruction data
    });
    
    const transaction = new solanaWeb3.Transaction().add(instruction);
    const provider = getWalletProvider();
    const signed = await provider.signTransaction(transaction);
    const txid = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(txid);
    */
}

// ===== TICKET PURCHASE =====
async function buyTicket(raffleId, inviteCode = null) {
    if (!walletConnected) {
        alert('Please connect your wallet first!');
        return;
    }

    const raffle = raffles.find(r => r.id === raffleId);
    if (!raffle) {
        alert('Raffle not found!');
        return;
    }

    if (raffle.status !== 'active') {
        alert('This raffle is not active!');
        return;
    }

    if (raffle.soldTickets >= raffle.totalTickets) {
        alert('This raffle is full!');
        return;
    }

    if (raffle.isPrivate && raffle.inviteCode !== inviteCode) {
        alert('Invalid invite code!');
        return;
    }

    try {
        console.log('Buying ticket for raffle:', raffleId);

        // In production, send transaction to Solana Program
        // For demo, update locally
        raffle.soldTickets++;
        raffle.participants.push(walletPublicKey.toString());
        raffle.prizePool += raffle.ticketPrice;

        localStorage.setItem('raffles', JSON.stringify(raffles));

        alert('Ticket purchased successfully!');

        // Check if raffle is full and trigger draw
        if (raffle.soldTickets >= raffle.totalTickets) {
            setTimeout(() => drawWinner(raffleId), 1000);
        }

        // Reload raffles
        loadRaffles();

    } catch (error) {
        console.error('Error buying ticket:', error);
        alert('Failed to buy ticket: ' + error.message);
    }
}

// ===== WINNER SELECTION =====
async function drawWinner(raffleId) {
    const raffle = raffles.find(r => r.id === raffleId);
    if (!raffle) return;

    if (raffle.soldTickets < raffle.totalTickets) {
        alert('Raffle is not full yet!');
        return;
    }

    if (raffle.winner) {
        alert('Winner already drawn!');
        return;
    }

    try {
        console.log('Drawing winner for raffle:', raffleId);

        // Random winner selection (in production, done on-chain)
        const randomIndex = Math.floor(Math.random() * raffle.participants.length);
        const winnerAddress = raffle.participants[randomIndex];

        // Calculate prizes
        const totalPrize = raffle.prizePool;
        const commission = Math.floor((totalPrize * COMMISSION_PERCENTAGE) / 100);
        const winnerPrize = totalPrize - commission;

        raffle.winner = winnerAddress;
        raffle.status = 'completed';

        localStorage.setItem('raffles', JSON.stringify(raffles));

        console.log('Winner:', winnerAddress);
        console.log('Winner Prize:', winnerPrize / solanaWeb3.LAMPORTS_PER_SOL, 'SOL');
        console.log('Commission:', commission / solanaWeb3.LAMPORTS_PER_SOL, 'SOL');

        alert(`Winner drawn! 🎉\n\nWinner: ${winnerAddress.slice(0, 8)}...\nPrize: ${(winnerPrize / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4)} SOL`);

        // Reload raffles
        loadRaffles();

    } catch (error) {
        console.error('Error drawing winner:', error);
        alert('Failed to draw winner: ' + error.message);
    }
}

// ===== RAFFLE LOADING & DISPLAY =====
function loadRaffles() {
    // Load from localStorage (in production, fetch from blockchain)
    const stored = localStorage.getItem('raffles');
    if (stored) {
        raffles = JSON.parse(stored);
    } else {
        // Create some demo raffles
        raffles = createDemoRaffles();
        localStorage.setItem('raffles', JSON.stringify(raffles));
    }

    displayPublicRaffles();
    if (walletConnected) {
        loadMyRaffles();
    }
}

function createDemoRaffles() {
    return [
        {
            id: '1',
            creator: 'Demo1...',
            ticketPrice: 0.1 * solanaWeb3.LAMPORTS_PER_SOL,
            totalTickets: 10,
            soldTickets: 7,
            isPrivate: false,
            inviteCode: null,
            participants: ['addr1', 'addr2', 'addr3', 'addr4', 'addr5', 'addr6', 'addr7'],
            winner: null,
            status: 'active',
            prizePool: 0.7 * solanaWeb3.LAMPORTS_PER_SOL,
            createdAt: Date.now() - 3600000
        },
        {
            id: '2',
            creator: 'Demo2...',
            ticketPrice: 0.5 * solanaWeb3.LAMPORTS_PER_SOL,
            totalTickets: 20,
            soldTickets: 15,
            isPrivate: false,
            inviteCode: null,
            participants: Array(15).fill('addr'),
            winner: null,
            status: 'active',
            prizePool: 7.5 * solanaWeb3.LAMPORTS_PER_SOL,
            createdAt: Date.now() - 7200000
        }
    ];
}

function displayPublicRaffles() {
    const grid = document.getElementById('publicRafflesGrid');
    const publicRaffles = raffles.filter(r => !r.isPrivate && r.status === 'active');

    if (publicRaffles.length === 0) {
        grid.innerHTML = `
            <div class="card text-center" style="grid-column: 1 / -1;">
                <p class="text-secondary">No active public raffles at the moment.</p>
                <a href="#create-raffle" class="btn btn-primary mt-1">Create First Raffle</a>
            </div>
        `;
        return;
    }

    grid.innerHTML = publicRaffles.map(raffle => createRaffleCard(raffle)).join('');
}

function loadMyRaffles() {
    if (!walletConnected || !walletPublicKey) return;

    const grid = document.getElementById('myRafflesGrid');
    const myAddress = walletPublicKey.toString();

    const myRaffles = raffles.filter(r =>
        r.creator === myAddress || r.participants.includes(myAddress)
    );

    if (myRaffles.length === 0) {
        grid.innerHTML = `
            <div class="card text-center" style="grid-column: 1 / -1;">
                <p class="text-secondary">You haven't created or joined any raffles yet.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = myRaffles.map(raffle => createRaffleCard(raffle, true)).join('');
}

function createRaffleCard(raffle, showInviteCode = false) {
    const ticketPriceSOL = (raffle.ticketPrice / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4);
    const prizePoolSOL = (raffle.prizePool / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4);
    const progress = (raffle.soldTickets / raffle.totalTickets) * 100;
    const winnerPrize = raffle.prizePool * 0.93;
    const winnerPrizeSOL = (winnerPrize / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4);

    const badgeClass = raffle.isPrivate ? 'badge-private' : 'badge-public';
    const badgeText = raffle.isPrivate ? 'Private' : 'Public';
    const statusBadge = raffle.status === 'completed' ? '<span class="raffle-badge badge-completed">Completed</span>' : '';

    const inviteCodeHTML = showInviteCode && raffle.isPrivate && raffle.inviteCode ? `
        <div class="info-row">
            <span class="info-label">Invite Code:</span>
            <span class="info-value" style="font-family: monospace; font-size: 0.85rem;">${raffle.inviteCode}</span>
        </div>
    ` : '';

    const winnerHTML = raffle.winner ? `
        <div class="alert alert-success">
            <strong>🎉 Winner:</strong> ${raffle.winner.slice(0, 8)}...${raffle.winner.slice(-6)}
        </div>
    ` : '';

    const actionButton = raffle.status === 'active' && raffle.soldTickets < raffle.totalTickets
        ? `<button class="btn btn-success" style="width: 100%;" onclick="buyTicket('${raffle.id}')">
             Buy Ticket (${ticketPriceSOL} SOL)
           </button>`
        : '';

    return `
        <div class="card raffle-card">
            <div class="raffle-header">
                <span class="raffle-badge ${badgeClass}">${badgeText}</span>
                ${statusBadge}
            </div>
            
            <div class="raffle-info">
                <div class="info-row">
                    <span class="info-label">Ticket Price:</span>
                    <span class="info-value sol-amount">${ticketPriceSOL} SOL</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Prize Pool:</span>
                    <span class="info-value sol-amount">${prizePoolSOL} SOL</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Winner Gets:</span>
                    <span class="info-value sol-amount">${winnerPrizeSOL} SOL</span>
                </div>
                ${inviteCodeHTML}
            </div>
            
            <div class="progress-container">
                <div class="progress-label">
                    <span>Tickets Sold</span>
                    <span><strong>${raffle.soldTickets}</strong> / ${raffle.totalTickets}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
            </div>
            
            ${winnerHTML}
            ${actionButton}
        </div>
    `;
}

// ===== PRIVATE RAFFLE =====
function handleJoinPrivate(e) {
    e.preventDefault();

    const inviteCode = document.getElementById('privateInviteCode').value.trim();
    const raffle = raffles.find(r => r.inviteCode === inviteCode && r.isPrivate);

    const resultDiv = document.getElementById('privateRaffleResult');

    if (!raffle) {
        resultDiv.innerHTML = `
            <div class="alert alert-error">
                Raffle not found. Please check the invite code.
            </div>
        `;
        resultDiv.classList.remove('hidden');
        return;
    }

    resultDiv.innerHTML = createRaffleCard(raffle);
    resultDiv.classList.remove('hidden');
}

// ===== UTILITIES =====
function generateInviteCode() {
    // Generate random invite code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('inviteCodeDisplay').value = code;
}

function updatePrizePreview() {
    const ticketPrice = parseFloat(document.getElementById('ticketPrice').value) || 0;
    const totalTickets = parseInt(document.getElementById('totalTickets').value) || 0;

    const prizePool = ticketPrice * totalTickets;
    const platformFee = prizePool * (COMMISSION_PERCENTAGE / 100);
    const winnerPrize = prizePool - platformFee;

    document.getElementById('prizePoolPreview').textContent = prizePool.toFixed(4);
    document.getElementById('winnerPrizePreview').textContent = winnerPrize.toFixed(4);
    document.getElementById('platformFeePreview').textContent = platformFee.toFixed(4);
}

function closeRaffleModal() {
    document.getElementById('raffleModal').classList.remove('active');
}

// ===== EXPORT FOR GLOBAL ACCESS =====
window.buyTicket = buyTicket;
window.closeRaffleModal = closeRaffleModal;

// JimboRaffle - 100% On-Chain Implementation
// All data read directly from Solana blockchain

import { SOLANA_NETWORK, COMMISSION_WALLET, COMMISSION_PERCENTAGE, PROGRAM_ID } from './config.js';
import {
    encodeCreateRaffle,
    encodeBuyTicket,
    encodeDrawWinner,
    stringToInviteCode,
    inviteCodeToString
} from './borsh.js';

// ===== CONSTANTS =====
// Account size must match Rust program (supports up to 1000 participants)
const RAFFLE_ACCOUNT_SIZE = 32127; // Required for Vec<Pubkey> with max 1000 participants
const RPC_ENDPOINT = SOLANA_NETWORK === 'devnet'
    ? 'https://api.devnet.solana.com'
    : 'https://api.mainnet-beta.solana.com';

// ===== GLOBAL STATE =====
let walletConnected = false;
let walletPublicKey = null;
let connection = null;
let programId = null;

// ===== BORSH DECODER =====
class BorshReader {
    constructor(buffer) {
        this.buffer = new Uint8Array(buffer);
        this.offset = 0;
    }

    readU8() {
        const value = this.buffer[this.offset];
        this.offset += 1;
        return value;
    }

    readU32() {
        const value = this.buffer[this.offset] |
            (this.buffer[this.offset + 1] << 8) |
            (this.buffer[this.offset + 2] << 16) |
            (this.buffer[this.offset + 3] << 24);
        this.offset += 4;
        return value >>> 0;
    }

    readU64() {
        const low = this.readU32();
        const high = this.readU32();
        return low + high * 0x100000000;
    }

    readBool() {
        return this.readU8() !== 0;
    }

    readPubkey() {
        const bytes = this.buffer.slice(this.offset, this.offset + 32);
        this.offset += 32;
        return new solanaWeb3.PublicKey(bytes);
    }

    readFixedArray(length) {
        const arr = Array.from(this.buffer.slice(this.offset, this.offset + length));
        this.offset += length;
        return arr;
    }

    readVec(readItem) {
        const length = this.readU32();
        const items = [];
        for (let i = 0; i < length; i++) {
            items.push(readItem.call(this));
        }
        return items;
    }

    readOption(readItem) {
        const isSome = this.readU8();
        if (isSome === 0) return null;
        return readItem.call(this);
    }
}

// Decode RaffleStatus enum
function decodeRaffleStatus(reader) {
    const variant = reader.readU8();
    if (variant === 0) return 'Active';
    if (variant === 1) return 'Completed';
    if (variant === 2) return 'Cancelled';
    return 'Unknown';
}

// Decode Raffle struct
function decodeRaffle(data) {
    // Skip first 4 bytes (length prefix added by Rust program)
    const dataLen = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);

    // Start reading from byte 4 (after length prefix)
    const reader = new BorshReader(data.slice(4, 4 + dataLen));

    return {
        creator: reader.readPubkey(),
        ticketPrice: reader.readU64(),
        totalTickets: reader.readU32(),
        soldTickets: reader.readU32(),
        isPrivate: reader.readBool(),
        inviteCode: reader.readFixedArray(32),
        participants: reader.readVec(reader.readPubkey),
        winner: reader.readOption(reader.readPubkey),
        status: decodeRaffleStatus(reader),
        prizePool: reader.readU64()
    };
}

// ===== INITIALIZATION =====
function initializeSolana() {
    console.log('🔧 Initializing Solana connection...');
    connection = new solanaWeb3.Connection(RPC_ENDPOINT, 'confirmed');
    programId = new solanaWeb3.PublicKey(PROGRAM_ID);
    console.log('✅ Connected to:', SOLANA_NETWORK);
    console.log('📝 Program ID:', PROGRAM_ID);
}

document.addEventListener('DOMContentLoaded', () => {
    initializeSolana();
    setupEventListeners();
    updateWalletUI();
    loadRaffles(); // Load raffles even without wallet
});

// ===== WALLET FUNCTIONS =====
async function connectWallet() {
    try {
        const provider = getWalletProvider();
        if (!provider) {
            alert('Please install Phantom wallet!\n\nhttps://phantom.app');
            window.open('https://phantom.app/', '_blank');
            return;
        }

        const resp = await provider.connect();
        walletPublicKey = resp.publicKey;
        walletConnected = true;

        console.log('✅ Wallet:', walletPublicKey.toString());
        updateWalletUI();
        loadRaffles();
    } catch (error) {
        console.error('❌ Error:', error);
        alert('Failed to connect wallet');
    }
}

async function disconnectWallet() {
    try {
        const provider = getWalletProvider();
        if (provider) await provider.disconnect();

        walletConnected = false;
        walletPublicKey = null;
        updateWalletUI();
        loadRaffles();
    } catch (error) {
        console.error('Error:', error);
    }
}

function getWalletProvider() {
    if (window.solana?.isPhantom) return window.solana;
    if (window.solflare?.isSolflare) return window.solflare;
    return null;
}

function updateWalletUI() {
    const btn = document.getElementById('walletButton');
    if (walletConnected && walletPublicKey) {
        const addr = walletPublicKey.toString();
        btn.innerHTML = `<span class="wallet-address">${addr.slice(0, 4)}...${addr.slice(-4)}</span>`;
        btn.onclick = disconnectWallet;
    } else {
        btn.textContent = 'Connect Wallet';
        btn.onclick = connectWallet;
    }
}

// ===== BLOCKCHAIN QUERIES =====
async function fetchAllRaffles() {
    try {
        console.log('🔍 Fetching all raffles from blockchain...');

        const accounts = await connection.getProgramAccounts(programId, {
            filters: [
                {
                    dataSize: RAFFLE_ACCOUNT_SIZE
                }
            ]
        });

        console.log(`📊 Found ${accounts.length} raffle accounts`);

        const raffles = accounts.map(({ pubkey, account }) => {
            try {
                const raffleData = decodeRaffle(account.data);
                return {
                    address: pubkey.toString(),
                    ...raffleData,
                    inviteCodeString: raffleData.isPrivate ? inviteCodeToString(raffleData.inviteCode) : null
                };
            } catch (error) {
                console.error('Error decoding raffle:', pubkey.toString(), error);
                return null;
            }
        }).filter(r => r !== null);

        return raffles;
    } catch (error) {
        console.error('❌ Error fetching raffles:', error);
        return [];
    }
}

async function fetchRaffleByAddress(address) {
    try {
        const pubkey = new solanaWeb3.PublicKey(address);
        const accountInfo = await connection.getAccountInfo(pubkey);

        if (!accountInfo) {
            console.error('Raffle account not found');
            return null;
        }

        const raffleData = decodeRaffle(accountInfo.data);
        return {
            address: address,
            ...raffleData,
            inviteCodeString: raffleData.isPrivate ? inviteCodeToString(raffleData.inviteCode) : null
        };
    } catch (error) {
        console.error('❌ Error fetching raffle:', error);
        return null;
    }
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    document.getElementById('walletButton').addEventListener('click', connectWallet);
    document.getElementById('createRaffleForm').addEventListener('submit', handleCreateRaffle);
    document.getElementById('joinPrivateForm').addEventListener('submit', handleJoinPrivate);

    document.getElementById('isPrivate').addEventListener('change', (e) => {
        const group = document.getElementById('inviteCodeGroup');
        if (e.target.checked) {
            group.classList.remove('hidden');
            generateAndDisplayInviteCode();
        } else {
            group.classList.add('hidden');
        }
    });

    document.getElementById('ticketPrice').addEventListener('input', updatePrizePreview);
    document.getElementById('totalTickets').addEventListener('input', updatePrizePreview);
}

// ===== CREATE RAFFLE =====
async function handleCreateRaffle(e) {
    e.preventDefault();

    if (!walletConnected) {
        alert('⚠️ Connect wallet first!');
        return;
    }

    const ticketPrice = parseFloat(document.getElementById('ticketPrice').value);
    const totalTickets = parseInt(document.getElementById('totalTickets').value);
    const isPrivate = document.getElementById('isPrivate').checked;
    const inviteCodeStr = document.getElementById('inviteCodeDisplay').value;

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Creating on blockchain...';
    btn.disabled = true;

    try {
        const ticketPriceLamports = Math.floor(ticketPrice * solanaWeb3.LAMPORTS_PER_SOL);
        const inviteCode = isPrivate ? stringToInviteCode(inviteCodeStr) : new Array(32).fill(0);

        const signature = await createRaffleOnChain(ticketPriceLamports, totalTickets, isPrivate, inviteCode, inviteCodeStr);

        alert(`✅ Raffle created!\n\nTx: ${signature.slice(0, 8)}...${signature.slice(-8)}\n\nView: https://explorer.solana.com/tx/${signature}?cluster=${SOLANA_NETWORK}`);

        // Reset form
        e.target.reset();
        document.getElementById('inviteCodeGroup').classList.add('hidden');
        updatePrizePreview();

        // Reload raffles from blockchain
        setTimeout(() => loadRaffles(), 3000);

    } catch (error) {
        console.error('❌ Error:', error);
        alert(`❌ Failed to create raffle:\n\n${error.message}`);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function createRaffleOnChain(ticketPrice, totalTickets, isPrivate, inviteCode, inviteCodeStr) {
    console.log('🚀 Creating raffle...');

    const raffleAccount = solanaWeb3.Keypair.generate();
    console.log('📝 Account:', raffleAccount.publicKey.toString());

    const rentExemption = await connection.getMinimumBalanceForRentExemption(RAFFLE_ACCOUNT_SIZE);
    console.log('💰 Rent:', rentExemption / solanaWeb3.LAMPORTS_PER_SOL, 'SOL');

    const createAccountIx = solanaWeb3.SystemProgram.createAccount({
        fromPubkey: walletPublicKey,
        newAccountPubkey: raffleAccount.publicKey,
        lamports: rentExemption,
        space: RAFFLE_ACCOUNT_SIZE,
        programId: programId
    });

    const instructionData = encodeCreateRaffle(ticketPrice, totalTickets, isPrivate, inviteCode);

    const commissionWallet = new solanaWeb3.PublicKey(COMMISSION_WALLET);

    const createRaffleIx = new solanaWeb3.TransactionInstruction({
        keys: [
            { pubkey: walletPublicKey, isSigner: true, isWritable: true },
            { pubkey: raffleAccount.publicKey, isSigner: false, isWritable: true },
            { pubkey: commissionWallet, isSigner: false, isWritable: true },
            { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false }
        ],
        programId: programId,
        data: instructionData
    });

    const transaction = new solanaWeb3.Transaction();
    transaction.add(createAccountIx);
    transaction.add(createRaffleIx);

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPublicKey;

    transaction.partialSign(raffleAccount);

    const provider = getWalletProvider();
    const signed = await provider.signTransaction(transaction);
    const txid = await connection.sendRawTransaction(signed.serialize());

    console.log('📤 Tx:', txid);
    await connection.confirmTransaction(txid, 'confirmed');
    console.log('✅ Created!');

    return txid;
}

// ===== BUY TICKET =====
async function buyTicket(raffleAccountStr, inviteCode = null) {
    if (!walletConnected) {
        alert('⚠️ Connect wallet first!');
        return;
    }

    try {
        console.log('🎫 Buying ticket...');

        const raffleAccount = new solanaWeb3.PublicKey(raffleAccountStr);
        const inviteCodeArray = inviteCode ? stringToInviteCode(inviteCode) : null;

        const instructionData = encodeBuyTicket(inviteCodeArray);

        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: walletPublicKey, isSigner: true, isWritable: true },
                { pubkey: raffleAccount, isSigner: false, isWritable: true },
                { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false }
            ],
            programId: programId,
            data: instructionData
        });

        const transaction = new solanaWeb3.Transaction().add(instruction);
        const provider = getWalletProvider();

        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = walletPublicKey;

        const signed = await provider.signTransaction(transaction);

        // Send with proper options to avoid blockhash errors
        const txid = await connection.sendRawTransaction(signed.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3
        });

        console.log('📤 Tx:', txid);
        await connection.confirmTransaction(txid, 'confirmed');
        console.log('✅ Ticket bought!');

        alert(`✅ Ticket purchased!\n\nTx: ${txid.slice(0, 8)}...${txid.slice(-8)}`);
        setTimeout(() => loadRaffles(), 2000);

    } catch (error) {
        console.error('❌ Error:', error);
        alert(`❌ Failed:\n\n${error.message}`);
    }
}

// ===== DRAW WINNER =====
async function drawWinner(raffleAccountStr) {
    if (!walletConnected) {
        alert('⚠️ Connect wallet first!');
        return;
    }

    try {
        console.log('🎲 Drawing winner...');

        // Fetch raffle data from blockchain
        const raffle = await fetchRaffleByAddress(raffleAccountStr);
        if (!raffle) {
            alert('❌ Raffle not found');
            return;
        }

        if (raffle.participants.length === 0) {
            alert('❌ No participants yet');
            return;
        }

        const raffleAccount = new solanaWeb3.PublicKey(raffleAccountStr);
        const commissionWallet = new solanaWeb3.PublicKey(COMMISSION_WALLET);

        // Use first participant as winner for the account (program will select random)
        const winnerPubkey = raffle.participants[0];

        const instructionData = encodeDrawWinner();

        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: walletPublicKey, isSigner: true, isWritable: false },
                { pubkey: raffleAccount, isSigner: false, isWritable: true },
                { pubkey: winnerPubkey, isSigner: false, isWritable: true },
                { pubkey: commissionWallet, isSigner: false, isWritable: true },
                { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false }
            ],
            programId: programId,
            data: instructionData
        });

        const transaction = new solanaWeb3.Transaction().add(instruction);
        const provider = getWalletProvider();

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = walletPublicKey;

        const signed = await provider.signTransaction(transaction);
        const txid = await connection.sendRawTransaction(signed.serialize());

        console.log('📤 Tx:', txid);
        await connection.confirmTransaction(txid, 'confirmed');
        console.log('✅ Winner drawn!');

        const winnerPrize = Math.floor(raffle.prizePool * 0.93);
        const commission = raffle.prizePool - winnerPrize;

        alert(`🎉 WINNER SELECTED!\n\nPrize: ${(winnerPrize / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4)} SOL\nCommission: ${(commission / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4)} SOL\n\nTx: ${txid.slice(0, 8)}...${txid.slice(-8)}`);

        setTimeout(() => loadRaffles(), 2000);

    } catch (error) {
        console.error('❌ Error:', error);
        alert(`❌ Failed:\n\n${error.message}`);
    }
}

// ===== LOAD RAFFLES =====
async function loadRaffles() {
    const publicGrid = document.getElementById('publicRafflesGrid');
    const myGrid = document.getElementById('myRafflesGrid');

    // Show loading
    publicGrid.innerHTML = `
        <div class="card text-center" style="grid-column: 1 / -1;">
            <div class="spinner"></div>
            <p class="loading-text">Loading raffles from blockchain...</p>
        </div>
    `;

    const raffles = await fetchAllRaffles();

    if (raffles.length === 0) {
        publicGrid.innerHTML = `
            <div class="card text-center" style="grid-column: 1 / -1;">
                <p class="text-secondary">No raffles yet. Create the first one!</p>
                <a href="#create-raffle" class="btn btn-primary mt-1">Create Raffle</a>
            </div>
        `;

        if (walletConnected) {
            myGrid.innerHTML = `
                <div class="card text-center" style="grid-column: 1 / -1;">
                    <p class="text-secondary">You haven't created any raffles yet.</p>
                </div>
            `;
        }
        return;
    }

    const publicRaffles = raffles.filter(r => !r.isPrivate && r.status === 'Active');
    const myRaffles = walletConnected ? raffles.filter(r => r.creator.toString() === walletPublicKey.toString()) : [];

    publicGrid.innerHTML = publicRaffles.map(r => createRaffleCardHTML(r)).join('') ||
        '<div class="card text-center" style="grid-column: 1 / -1;"><p class="text-secondary">No active public raffles</p></div>';

    if (walletConnected) {
        myGrid.innerHTML = myRaffles.map(r => createRaffleCardHTML(r, true)).join('') ||
            '<div class="card text-center" style="grid-column: 1 / -1;"><p class="text-secondary">No raffles created</p></div>';
    }
}

function createRaffleCardHTML(raffle, showInviteCode = false) {
    const ticketPriceSOL = (raffle.ticketPrice / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4);
    const prizePoolSOL = (raffle.prizePool / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4);
    const winnerPrizeSOL = (raffle.prizePool * 0.93 / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4);

    const progress = (raffle.soldTickets / raffle.totalTickets) * 100;
    const isFull = raffle.soldTickets >= raffle.totalTickets;

    const badgeClass = raffle.isPrivate ? 'badge-private' : 'badge-public';
    const badgeText = raffle.isPrivate ? '🔒 Private' : '🌐 Public';

    const statusBadge = raffle.status === 'Completed' ? '<span class="badge-completed">✅ Completed</span>' : '';

    const inviteCodeHTML = showInviteCode && raffle.isPrivate ? `
        <div class="info-row">
            <span class="info-label">Invite Code:</span>
            <span class="info-value" style="font-family: monospace; color: var(--solana-green);">${raffle.inviteCodeString}</span>
        </div>
    ` : '';

    const buttonHTML = raffle.status === 'Completed' ? `
        <button class="btn btn-secondary" style="width: 100%;" disabled>
            Completed
        </button>
    ` : isFull ? `
        <button class="btn btn-success" style="width: 100%;" onclick="drawWinner('${raffle.address}')">
            🎲 Draw Winner
        </button>
    ` : `
        <button class="btn btn-success" style="width: 100%;" onclick="buyTicket('${raffle.address}', ${raffle.isPrivate ? `'${raffle.inviteCodeString}'` : 'null'})">
            Buy Ticket (${ticketPriceSOL} SOL)
        </button>
    `;

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
                    <span class="info-label">Tickets:</span>
                    <span class="info-value">${raffle.soldTickets} / ${raffle.totalTickets}</span>
                </div>
                <div class="progress-bar" style="margin: 0.5rem 0;">
                    <div class="progress-fill" style="width: ${progress}%;"></div>
                </div>
                <div class="info-row">
                    <span class="info-label">Prize Pool:</span>
                    <span class="info-value sol-amount">${prizePoolSOL} SOL</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Winner Gets:</span>
                    <span class="info-value sol-amount">${winnerPrizeSOL} SOL (93%)</span>
                </div>
                ${inviteCodeHTML}
            </div>
            
            ${buttonHTML}
            
            <a href="https://explorer.solana.com/address/${raffle.address}?cluster=${SOLANA_NETWORK}" target="_blank" class="btn btn-secondary mt-1" style="width: 100%; font-size: 0.85rem;">
                📊 View on Explorer
            </a>
        </div>
    `;
}

// ===== PRIVATE RAFFLE =====
async function handleJoinPrivate(e) {
    e.preventDefault();

    const inviteCode = document.getElementById('privateInviteCode').value.trim();
    const resultDiv = document.getElementById('privateRaffleResult');

    resultDiv.innerHTML = `
        <div class="card text-center">
            <div class="spinner"></div>
            <p class="loading-text">Searching blockchain...</p>
        </div>
    `;
    resultDiv.classList.remove('hidden');

    const raffles = await fetchAllRaffles();
    const raffle = raffles.find(r => r.inviteCodeString === inviteCode && r.isPrivate);

    if (!raffle) {
        resultDiv.innerHTML = `
            <div class="alert alert-error">
                ❌ Raffle not found. Check the invite code.
            </div>
        `;
        return;
    }

    resultDiv.innerHTML = createRaffleCardHTML(raffle);
}

// ===== UTILITIES =====
function generateAndDisplayInviteCode() {
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

// ===== EXPORT TO WINDOW =====
window.buyTicket = buyTicket;
window.drawWinner = drawWinner;
window.closeRaffleModal = closeRaffleModal;

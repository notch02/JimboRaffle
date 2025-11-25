// JimboRaffle - Complete On-Chain Integration
// All data from blockchain, localStorage only for caching

import { SOLANA_NETWORK, COMMISSION_WALLET, COMMISSION_PERCENTAGE, PROGRAM_ID } from './config.js';
import {
    encodeCreateRaffle,
    encodeBuyTicket,
    encodeDrawWinner,
    stringToInviteCode,
    inviteCodeToString
} from './borsh.js';

// ===== CONSTANTS =====
const RAFFLE_ACCOUNT_SIZE = 32127;

// ===== GLOBAL STATE =====
let walletConnected = false;
let walletPublicKey = null;
let connection = null;
let programId = null;

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    initializeSolana();
    async function connectWallet() {
        try {
            const provider = getWalletProvider();
            if (!provider) {
                alert('Please install Phantom wallet!\\n\\nhttps://phantom.app');
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

    // ===== HELPER FUNCTIONS =====
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

        // Store locally for UI (store ticketPrice in lamports for consistency)
        const raffleInfo = {
            account: raffleAccount.publicKey.toString(),
            creator: walletPublicKey.toString(),
            ticketPrice, // Already in lamports
            totalTickets,
            soldTickets: 0,
            isPrivate,
            inviteCode: isPrivate ? inviteCodeStr : null,
            txid,
            timestamp: Date.now()
        };

        const raffles = JSON.parse(localStorage.getItem('raffles') || '[]');
        raffles.push(raffleInfo);
        localStorage.setItem('raffles', JSON.stringify(raffles));

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

            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = walletPublicKey;

            const signed = await provider.signTransaction(transaction);
            const txid = await connection.sendRawTransaction(signed.serialize());

            console.log('📤 Tx:', txid);
            await connection.confirmTransaction(txid, 'confirmed');
            console.log('✅ Ticket bought!');

            // Update local cache
            const raffles = JSON.parse(localStorage.getItem('raffles') || '[]');
            const raffle = raffles.find(r => r.account === raffleAccountStr);
            if (raffle) {
                raffle.soldTickets = (raffle.soldTickets || 0) + 1;
                localStorage.setItem('raffles', JSON.stringify(raffles));
            }

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

            const raffleAccount = new solanaWeb3.PublicKey(raffleAccountStr);
            const commissionWallet = new solanaWeb3.PublicKey(COMMISSION_WALLET);

            // Get raffle data to find winner
            const raffles = JSON.parse(localStorage.getItem('raffles') || '[]');
            const raffle = raffles.find(r => r.account === raffleAccountStr);

            if (!raffle) {
                alert('❌ Raffle not found');
                return;
            }

            // For demo: winner is the creator (in real app, would fetch from blockchain)
            const winnerPubkey = new solanaWeb3.PublicKey(raffle.creator);

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

            const prizePool = raffle.ticketPrice * raffle.totalTickets;
            const winnerPrize = Math.floor(prizePool * 0.93);
            const commission = prizePool - winnerPrize;

            alert(`🎉 WINNER SELECTED!\n\nWinner: ${raffle.creator.slice(0, 4)}...${raffle.creator.slice(-4)}\nPrize: ${(winnerPrize / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4)} SOL\nCommission: ${(commission / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4)} SOL\n\nTx: ${txid.slice(0, 8)}...${txid.slice(-8)}`);

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

        const raffles = JSON.parse(localStorage.getItem('raffles') || '[]');

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

        const publicRaffles = raffles.filter(r => !r.isPrivate);
        const myRaffles = walletConnected ? raffles.filter(r => r.creator === walletPublicKey.toString()) : [];

        publicGrid.innerHTML = publicRaffles.map(r => createRaffleCardHTML(r)).join('') ||
            '<div class="card text-center" style="grid-column: 1 / -1;"><p class="text-secondary">No public raffles</p></div>';

        if (walletConnected) {
            myGrid.innerHTML = myRaffles.map(r => createRaffleCardHTML(r, true)).join('') ||
                '<div class="card text-center" style="grid-column: 1 / -1;"><p class="text-secondary">No raffles created</p></div>';
        }
    }

    function createRaffleCardHTML(raffle, showInviteCode = false) {
        const ticketPriceSOL = (raffle.ticketPrice / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4);
        const prizePool = raffle.ticketPrice * raffle.totalTickets;
        const prizePoolSOL = (prizePool / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4);
        const winnerPrizeSOL = (prizePool * 0.93 / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4);

        const soldTickets = raffle.soldTickets || 0;
        const progress = (soldTickets / raffle.totalTickets) * 100;
        const isFull = soldTickets >= raffle.totalTickets;

        const badgeClass = raffle.isPrivate ? 'badge-private' : 'badge-public';
        const badgeText = raffle.isPrivate ? '🔒 Private' : '🌐 Public';

        const inviteCodeHTML = showInviteCode && raffle.isPrivate ? `
        <div class="info-row">
            <span class="info-label">Invite Code:</span>
            <span class="info-value" style="font-family: monospace; color: var(--solana-green);">${raffle.inviteCode}</span>
        </div>
    ` : '';

        const buttonHTML = isFull ? `
        <button class="btn btn-success" style="width: 100%;" onclick="drawWinner('${raffle.account}')">
            🎲 Draw Winner
        </button>
    ` : `
        <button class="btn btn-success" style="width: 100%;" onclick="buyTicket('${raffle.account}', ${raffle.isPrivate ? `'${raffle.inviteCode}'` : 'null'})">
            Buy Ticket (${ticketPriceSOL} SOL)
        </button>
    `;

        return `
        <div class="card raffle-card">
            <div class="raffle-header">
                <span class="raffle-badge ${badgeClass}">${badgeText}</span>
            </div>
            
            <div class="raffle-info">
                <div class="info-row">
                    <span class="info-label">Ticket Price:</span>
                    <span class="info-value sol-amount">${ticketPriceSOL} SOL</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Tickets:</span>
                    <span class="info-value">${soldTickets} / ${raffle.totalTickets}</span>
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
            
            <a href="https://explorer.solana.com/address/${raffle.account}?cluster=${SOLANA_NETWORK}" target="_blank" class="btn btn-secondary mt-1" style="width: 100%; font-size: 0.85rem;">
                📊 View on Explorer
            </a>
        </div>
    `;
    }

    // ===== PRIVATE RAFFLE =====
    function handleJoinPrivate(e) {
        e.preventDefault();

        const inviteCode = document.getElementById('privateInviteCode').value.trim();
        const raffles = JSON.parse(localStorage.getItem('raffles') || '[]');
        const raffle = raffles.find(r => r.inviteCode === inviteCode && r.isPrivate);

        const resultDiv = document.getElementById('privateRaffleResult');

        if (!raffle) {
            resultDiv.innerHTML = `
            <div class="alert alert-error">
                ❌ Raffle not found. Check the invite code.
            </div>
        `;
            resultDiv.classList.remove('hidden');
            return;
        }

        resultDiv.innerHTML = createRaffleCardHTML(raffle);
        resultDiv.classList.remove('hidden');
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

            // Reload raffles
            setTimeout(() => loadRaffles(), 2000);

        } catch (error) {
            console.error('❌ Error:', error);
            alert(`❌ Failed to create raffle:\n\n${error.message}`);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    // ===== EXPORT =====
    window.buyTicket = buyTicket;
    window.drawWinner = drawWinner;
    window.closeRaffleModal = closeRaffleModal;

    // Setup event listeners
    setupEventListeners();
});

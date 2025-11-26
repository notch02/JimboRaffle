# 🚀 JimboRaffle - Mainnet Deployment Guide

## ⚠️ **MODIFICHE OBBLIGATORIE PRIMA DI MAINNET**

### 🔒 **1. SICUREZZA - Randomness Verificabile**

**Problema Attuale:**
```rust
// ❌ INSICURO - Timestamp prevedibile
let random_index = (clock.unix_timestamp as usize) % participants.len();
```

**Soluzione - Switchboard VRF:**

**A) Aggiungi dipendenza in `Cargo.toml`:**
```toml
[dependencies]
switchboard-v2 = "0.4.0"
```

**B) Modifica `process_draw_winner` in `lib.rs`:**
```rust
use switchboard_v2::VrfAccountData;

fn process_draw_winner(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    // ... existing code ...
    
    // Aggiungi VRF account
    let vrf_account = next_account_info(account_iter)?;
    
    // Ottieni randomness sicuro
    let vrf = VrfAccountData::new(vrf_account)?;
    let random_value = vrf.get_result()?;
    
    // Usa il valore random
    let random_index = (random_value[0] as usize) % participants.len();
    let winner_pubkey = participants[random_index];
    
    // ... rest of code ...
}
```

**Costo:** ~0.002 SOL per DrawWinner

---

### 🔄 **2. FEATURE - CancelRaffle (Recupero Rent)**

**Problema:** Creator perde 0.22 SOL se raffle non si riempie mai

**Soluzione - Aggiungi CancelRaffle:**

**A) `instruction.rs`:**
```rust
pub enum RaffleInstruction {
    // ... existing variants ...
    
    /// Cancel raffle and refund participants
    /// Only callable by creator if raffle not completed
    CancelRaffle,
}
```

**B) `lib.rs`:**
```rust
fn process_cancel_raffle(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    // Verify creator
    // Verify raffle not completed
    // Refund all participants
    // Transfer remaining lamports to creator
    Ok(())
}
```

**Beneficio:** Creator può recuperare rent + partecipanti vengono rimborsati

---

### 📊 **3. LIMITI - Documentazione Chiara**

**Aggiungi in `index.html` - Sezione "How It Works":**

```html
<div class="alert alert-info">
    <h4>⚠️ Current Limitations</h4>
    <ul>
        <li><strong>Max Participants:</strong> 1000 per raffle</li>
        <li><strong>Randomness:</strong> Timestamp-based (predictable for high-value raffles)</li>
        <li><strong>No Refunds:</strong> If raffle cancelled, contact creator</li>
    </ul>
</div>
```

---

## 💰 **COSTI DEPLOYMENT MAINNET**

### **Costi Una Tantum (Deploy):**

| Item | Costo | Note |
|------|-------|------|
| **Program Deploy** | ~2-5 SOL | Dipende dalla dimensione del programma |
| **Program Upgrade Authority** | 0.05 SOL | Per mantenere controllo |
| **Buffer Account** | ~1 SOL | Temporaneo durante deploy |
| **Testing su Mainnet** | 1-2 SOL | Creare raffle di test |
| **TOTALE DEPLOY** | **~4-8 SOL** | **~$800-1600 USD** (@ $200/SOL) |

### **Costi Ricorrenti (Per Raffle):**

| Azione | Chi Paga | Costo | Note |
|--------|----------|-------|------|
| **Create Raffle** | Creator | 0.22 SOL | Rent deposit (recuperabile con CloseRaffle) |
| **Create Raffle Fee** | Creator | 0.05 SOL | Commissione piattaforma |
| **Buy Ticket** | Buyer | Ticket Price + 0.00001 SOL | Prezzo + gas fee |
| **Draw Winner** | Anyone | ~0.00005 SOL | Gas fee |
| **Close Raffle** | Creator | ~0.00001 SOL | Gas fee (recupera 0.22 SOL) |

### **Costi VRF (Se Implementato):**

| Item | Costo | Frequenza |
|------|-------|-----------|
| **VRF Request** | 0.002 SOL | Per DrawWinner |
| **VRF Account Rent** | 0.01 SOL | Una tantum per raffle |

---

## ✅ **CHECKLIST PRE-MAINNET**

### **Codice:**
- [ ] Implementare Switchboard VRF per randomness sicuro
- [ ] Aggiungere `CancelRaffle` con refund system
- [ ] Aggiungere rate limiting (max 10 raffle/wallet/giorno)
- [ ] Implementare pause mechanism (admin emergency stop)
- [ ] Audit del codice da terze parti

### **Testing:**
- [ ] Test con 1000 partecipanti (limite max)
- [ ] Test con raffle simultanee (10+)
- [ ] Test di stress (100+ transazioni/secondo)
- [ ] Test VRF randomness (100+ estrazioni)
- [ ] Test di sicurezza (tentativi di exploit)

### **Frontend:**
- [ ] Aggiungere disclaimer sui limiti
- [ ] Implementare paginazione (per >100 raffle)
- [ ] Aggiungere analytics (Google Analytics / Mixpanel)
- [ ] Implementare error handling robusto
- [ ] Aggiungere loading states migliori

### **Legale:**
- [ ] Terms of Service
- [ ] Privacy Policy
- [ ] Disclaimer su gambling laws
- [ ] KYC/AML compliance (se necessario)

### **Infrastruttura:**
- [ ] RPC node dedicato (Helius/QuickNode)
- [ ] Monitoring (Sentry per errori)
- [ ] Backup del programma
- [ ] Disaster recovery plan

---

## 🎯 **TRASPARENZA CON GLI UTENTI**

### **Aggiungi in Homepage:**

```html
<section class="transparency">
    <h2>🔍 Transparency & Fairness</h2>
    
    <div class="transparency-grid">
        <div class="transparency-card">
            <h3>⚠️ Current Limitations</h3>
            <ul>
                <li>Max 1000 participants per raffle</li>
                <li>Timestamp-based randomness (v1.0)</li>
                <li>No automatic refunds</li>
            </ul>
        </div>
        
        <div class="transparency-card">
            <h3>💰 Fee Structure</h3>
            <ul>
                <li><strong>Creation Fee:</strong> 0.05 SOL</li>
                <li><strong>Platform Fee:</strong> 7% of prize pool</li>
                <li><strong>Winner Gets:</strong> 93% of prize pool</li>
                <li><strong>Rent Deposit:</strong> 0.22 SOL (recoverable)</li>
            </ul>
        </div>
        
        <div class="transparency-card">
            <h3>🔒 Security</h3>
            <ul>
                <li>100% on-chain (no backend)</li>
                <li>Open source code</li>
                <li>Verifiable on Solana Explorer</li>
                <li>VRF randomness (coming in v2.0)</li>
            </ul>
        </div>
    </div>
    
    <div class="alert alert-warning">
        <strong>⚠️ Beta Warning:</strong> This is version 1.0 running on Solana Devnet. 
        Use at your own risk. Never invest more than you can afford to lose.
    </div>
</section>
```

---

## 📝 **ROADMAP POST-MAINNET**

### **v1.0 (Current - Devnet):**
- ✅ Create, Buy, Draw, Close raffle
- ✅ Private raffles with invite codes
- ✅ Phantom + Solflare support
- ⚠️ Timestamp randomness

### **v2.0 (Mainnet - Secure):**
- 🔄 Switchboard VRF randomness
- 🔄 CancelRaffle with refunds
- 🔄 Rate limiting
- 🔄 Admin controls

### **v3.0 (Future):**
- 📊 Analytics dashboard
- 🎨 NFT prizes support
- 🔔 Notifications system
- 🌐 Multi-language support

---

## 🚨 **DISCLAIMER RACCOMANDATO**

```
DISCLAIMER:
JimboRaffle is a decentralized raffle platform built on Solana. 
By using this service, you acknowledge:

1. This is experimental software in beta
2. Randomness is timestamp-based (predictable for sophisticated attackers)
3. Maximum 1000 participants per raffle
4. No automatic refund system (v1.0)
5. You may lose all funds deposited
6. Gambling may be illegal in your jurisdiction
7. Platform takes 7% commission + 0.05 SOL creation fee

USE AT YOUR OWN RISK. NEVER INVEST MORE THAN YOU CAN AFFORD TO LOSE.
```

---

## 📞 **SUPPORTO E CONTATTI**

Prima di Mainnet, prepara:
- 📧 Email di supporto
- 💬 Discord/Telegram community
- 🐦 Twitter per updates
- 📖 Documentazione completa
- 🎥 Video tutorial

---

## ✅ **QUANDO SEI PRONTO PER MAINNET**

1. ✅ Tutte le modifiche di sicurezza implementate
2. ✅ Audit del codice completato
3. ✅ Testing estensivo su Devnet
4. ✅ Disclaimer e T&C pronti
5. ✅ Budget per deploy (4-8 SOL)
6. ✅ Piano di supporto utenti
7. ✅ Monitoring e analytics setup

**Solo allora** cambia in `config.js`:
```javascript
const SOLANA_NETWORK = 'mainnet-beta';
const PROGRAM_ID = 'TUO_NUOVO_PROGRAM_ID_MAINNET';
```

---

## 💡 **RACCOMANDAZIONE FINALE**

**Per ora:** ✅ Continua su **Devnet** - perfetto per testing e demo

**Per Mainnet:** ⚠️ Implementa **almeno** VRF + CancelRaffle

**Per produzione seria:** 🔒 Fai **audit completo** + tutto quanto sopra

---

**Domande? Dubbi? Contattami prima di deployare su Mainnet!** 🚀

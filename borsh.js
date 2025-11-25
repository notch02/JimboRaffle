// Borsh Serialization Helper for Solana Program Instructions
// This file handles encoding/decoding data for the Raffle Program

class BorshWriter {
    constructor() {
        this.buffer = [];
    }

    writeU8(value) {
        this.buffer.push(value & 0xFF);
    }

    writeU32(value) {
        this.buffer.push(value & 0xFF);
        this.buffer.push((value >> 8) & 0xFF);
        this.buffer.push((value >> 16) & 0xFF);
        this.buffer.push((value >> 24) & 0xFF);
    }

    writeU64(value) {
        const low = value & 0xFFFFFFFF;
        const high = Math.floor(value / 0x100000000);
        this.writeU32(low);
        this.writeU32(high);
    }

    writeBool(value) {
        this.buffer.push(value ? 1 : 0);
    }

    writeFixedArray(arr, length) {
        for (let i = 0; i < length; i++) {
            this.buffer.push(arr[i] || 0);
        }
    }

    toBuffer() {
        return new Uint8Array(this.buffer);
    }
}

// Instruction: CreateRaffle
export function encodeCreateRaffle(ticketPrice, totalTickets, isPrivate, inviteCode) {
    const writer = new BorshWriter();

    // Instruction discriminator (0 = CreateRaffle)
    writer.writeU8(0);

    // ticket_price: u64
    writer.writeU64(ticketPrice);

    // total_tickets: u32
    writer.writeU32(totalTickets);

    // is_private: bool
    writer.writeBool(isPrivate);

    // invite_code: [u8; 32]
    writer.writeFixedArray(inviteCode, 32);

    return writer.toBuffer();
}

// Instruction: BuyTicket
export function encodeBuyTicket(inviteCode) {
    const writer = new BorshWriter();

    // Instruction discriminator (1 = BuyTicket)
    writer.writeU8(1);

    // Option<[u8; 32]>
    if (inviteCode) {
        writer.writeU8(1); // Some
        writer.writeFixedArray(inviteCode, 32);
    } else {
        writer.writeU8(0); // None
    }

    return writer.toBuffer();
}

// Instruction: DrawWinner
export function encodeDrawWinner() {
    const writer = new BorshWriter();

    // Instruction discriminator (2 = DrawWinner)
    writer.writeU8(2);

    return writer.toBuffer();
}

// Helper: Generate invite code from string
export function stringToInviteCode(str) {
    const encoder = new TextEncoder();
    const arr = new Uint8Array(32);
    const encoded = encoder.encode(str.slice(0, 32));
    arr.set(encoded);
    return Array.from(arr);
}

// Helper: Generate random invite code
export function generateRandomInviteCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return stringToInviteCode(code);
}

// Helper: Invite code to string
export function inviteCodeToString(arr) {
    const decoder = new TextDecoder();
    const uint8 = new Uint8Array(arr);
    return decoder.decode(uint8).replace(/\0/g, '').trim();
}

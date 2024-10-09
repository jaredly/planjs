export const asciiToNat = (name: string): bigint => {
    let nat = 0n;
    for (let i = name.length - 1; i >= 0; i--) {
        nat <<= 8n;
        nat |= BigInt(name.charCodeAt(i));
    }
    return nat;
};

export const natToAscii = (nat: bigint) => {
    if (nat == 0n) {
        return '';
    }
    if (nat == null) {
        return '??NULL??';
    }
    // console.log(JSON.stringify(Number(nat)) ?? 'undefined');
    let res = '';
    const mask = (1n << 8n) - 1n;
    for (let i = 0; nat > 0; i += 1) {
        const n = Number(nat & mask);
        if (n === 0) break;
        res += String.fromCharCode(n);
        nat >>= 8n;
    }
    return res;
};

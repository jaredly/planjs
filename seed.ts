import { readFileSync } from 'fs';

type Exp =
    | { tag: 'Word'; w: bigint }
    | { tag: 'Bigy'; sz: bigint; buf: bigint[] }
    | { tag: 'Cell'; f: Exp; x: Exp };

import {
    APP,
    APPS,
    Force,
    NAT,
    reportPerf,
    setRequireOpPin,
    showPerf,
    showVal,
    trackPerf,
    Val,
} from './runtime';
import { showNice } from './pst';

export const expToVal = (exp: Exp): Val => {
    switch (exp.tag) {
        case 'Cell':
            return { v: [APP, expToVal(exp.f), expToVal(exp.x)] };
        case 'Word':
            if (exp.w === null) {
                throw new Error('nulll');
            }
            return { v: [NAT, exp.w] };
        case 'Bigy':
            let v = 0n;
            for (let i = 0; i < exp.buf.length; i++) {
                v <<= 64n;
                v |= exp.buf[i];
            }
            return { v: [NAT, v] };
    }
};

const natToAscii = (nat: bigint) => {
    let res = '';
    const mask = (1n << 8n) - 1n;
    for (let i = 0; i < 8; i += 1) {
        res += String.fromCharCode(Number(nat & mask));
        nat >>= 8n;
    }
    return res;
};

const show = (e: Exp): string => {
    if (!e) return `<MISSING>`;
    switch (e.tag) {
        case 'Word':
            if (e.w > 1024) {
                return natToAscii(e.w);
            }
            return e.w.toString();
        case 'Bigy':
            return '<big>';
        case 'Cell':
            const args: Exp[] = [e.x];
            let x = e.f;
            while (x.tag === 'Cell') {
                args.unshift(x.x);
                x = x.f;
            }
            args.unshift(x);
            return `(${args.map(show).join(' ')})`;
    }
};

const tracked = (buf: DataView) => {
    let i = 0;

    let partial: [number, number] = [0, 0];
    const add = (n: number) => {
        partial[0] = (n << partial[1]) | partial[0];
        partial[1] += 8;
    };
    const take = (n: number) => {
        if (partial == null) throw new Error(`nope`);
        if (n > partial[1]) throw new Error(`cant take ${n} - ${partial}`);
        const mask = (1 << n) - 1;
        const res = partial[0] & mask;
        partial[0] = partial[0] >> n;
        partial[1] -= n;
        return res;
    };
    const nextBits = (n: number) => {
        while (partial[1] < n) {
            add(next8());
        }
        return take(n);
    };

    // For debugging, here's working with the numbers as strings of '0' and '1'
    // let bits: null | string = '';
    // const stringBits = () => {
    //     if (i >= buf.byteLength) {
    //         return '00000000';
    //     }
    //     const n = next8();
    //     // add(n);
    //     return n.toString(2).padStart(8, '0').split('').reverse().join('');
    // };
    // const nextBits = (n: number) => {
    //     if (bits === null) {
    //         bits = stringBits();
    //     }
    //     while (bits.length < n) {
    //         const next = stringBits();
    //         bits += next;
    //     }
    //     const slice = bits.slice(0, n);
    //     bits = bits.slice(n);
    //     return parseInt(slice.split('').reverse().join(''), 2);
    // };

    const next64 = () => {
        if (i >= buf.byteLength) {
            throw new Error(`too large`);
        }
        const v = buf.getBigUint64(i, true);
        i += 8;
        return v;
    };
    const next8 = () => {
        if (i >= buf.byteLength) {
            throw new Error(`too large`);
        }
        const v = buf.getUint8(i);
        i++;
        return v;
    };

    return { next64, next8, nextBits };
};

const seed_load = (buf: DataView) => {
    const { next64, next8, nextBits } = tracked(buf);

    const n_holes = next64();

    if (n_holes != 0n) {
        throw new Error(`file is just one seed, expected pod?`);
    }

    const n_bigs = next64();
    const n_words = next64();
    const n_bytes = next64();
    const n_frags = next64();

    const tab: Exp[] = [];

    const bigwidths: bigint[] = [];
    for (let i = 0; i < n_bigs; i++) {
        bigwidths.push(next64());
    }

    for (let w of bigwidths) {
        const buf: bigint[] = [];
        for (let i = 0; i < w; i++) {
            buf.push(next64());
        }
        tab.push({ tag: 'Bigy', sz: w, buf: [] });
    }

    for (let i = 0; i < n_words; i++) {
        tab.push({ tag: 'Word', w: next64() });
    }

    for (let i = 0; i < n_bytes; i++) {
        tab.push({ tag: 'Word', w: BigInt(next8()) });
    }

    const frag_load_cell = (): Exp => {
        const f = frag_load();
        const x = frag_load();
        return { tag: 'Cell', f, x };
    };

    const frag_load = (): Exp => {
        const isCell = nextBits(1);
        if (isCell) return frag_load_cell();
        return tab[nextBits(refSize(tab.length))];
    };

    for (let i = 0; i < n_frags; i++) {
        tab.push(frag_load_cell());
    }
    return tab[tab.length - 1];
};

const refSize = (n: number) => Math.ceil(Math.log2(n));

// Seeds are using legacy encoding
setRequireOpPin(false);

const [_, __, inp, ...args] = process.argv;
const main_seed = seed_load(new DataView(readFileSync(inp).buffer));
const main_val = expToVal(main_seed);
// console.log(showVal(Force(APPS(main_val, [NAT, 10n], [NAT, 4n]))));

trackPerf();
const resolved = Force(main_val);
showPerf(reportPerf()!);

console.log(showNice(resolved));

// console.log(showVal(result));
// console.log(showNice(result));

if (args.length) {
    trackPerf();
    console.log(
        showNice(
            Force(
                APPS(
                    resolved,
                    ...args.map((a): Val => ({ v: [NAT, BigInt(+a)] })),
                ),
            ),
        ),
    );
    showPerf(reportPerf()!);
}
// console.log(show(main_seed));

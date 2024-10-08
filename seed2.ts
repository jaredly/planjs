import ansis from 'ansis';
import { readFileSync } from 'fs';

type Exp =
    | { tag: 'Word'; w: bigint }
    | { tag: 'Bigy'; sz: bigint; buf: bigint[] }
    | { tag: 'Cell'; f: Exp; x: Exp };

const show = (e: Exp): string => {
    if (!e) return `<MISSING>`;
    switch (e.tag) {
        case 'Word':
            // let res = '';
            // let n = e.w;
            // for (let i = 0; i < 8; i++) {
            //     res += String.fromCharCode(Number(n & ((1n << 8n) - 1n)));
            //     n = n << 8n;
            // }
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
        const [prev, pn] = partial;
        partial[0] <<= 8;
        partial[0] |= n;
        partial[1] += 8;
        console.log(
            ` -=-> ${prev.toString(2).padStart(pn, '0')} + ${n
                .toString(2)
                .padStart(8, '0')} -> ${partial[0]
                .toString(2)
                .padStart(partial[1], '0')}`,
        );
    };
    const take = (n: number) => {
        if (n > partial[1]) throw new Error(`cant take ${n} - ${partial}`);
        const mask = (1 << n) - 1;
        const [prev, pn] = partial;
        const res = partial[0] & mask;
        partial[0] = partial[0] >> n;
        partial[1] -= n;
        console.log(
            `take ${n} [${mask.toString(2)}] - from [${prev
                .toString(2)
                .padStart(pn, '0')}:${pn}] -> ${res} [${res
                .toString(2)
                .padStart(n, '0')}:${n}]  - final [${partial[0]
                .toString(2)
                .padStart(partial[1], '0')}:${partial[1]}]`,
        );
        return res;
    };
    // const nextBits = (n: number) => {
    //     if (partial == null) {
    //         partial = [next8(), 8];
    //     }
    //     while (partial[1] < n) {
    //         partial[0] = (partial[0] << 8) | next8();
    //         partial[1] += 8;
    //     }
    //     const mask = (1 << n) - 1;
    //     const res = partial[0] & mask;
    //     partial[0] = partial[0] >> n;
    //     partial[1] -= n;
    //     return res;
    // };

    let bits: null | string = '';
    const stringBits = () => {
        if (i >= buf.byteLength) {
            return '00000000';
        }
        const n = next8();
        add(n);
        return n.toString(2).padStart(8, '0').split('').reverse().join('');
    };

    // little endiannn
    const nextBits = (n: number) => {
        if (bits === null) {
            bits = stringBits();
        }
        while (bits.length < n) {
            bits += stringBits();
        }
        const pbits = bits;
        const slice = bits.slice(0, n);
        bits = bits.slice(n);
        const res = parseInt(slice.split('').reverse().join(''), 2);
        const took = take(n);
        console.log('compare', res, took);
        if (res !== took) {
            console.warn(ansis.red('NOOO'), res, took);
            console.log(ansis.green(pbits), bits);
        }
        return res;
    };

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
    const n_bigs = next64();
    const n_words = next64();
    const n_bytes = next64();
    const n_frags = next64();

    if (n_holes != 0n) {
        throw new Error(`file is just one seed, expected pod?`);
    }

    const n_entries = n_bigs + n_words + n_bytes + n_frags;

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
    console.log(show(tab[tab.length - 1]));
};

const refSize = (n: number) => Math.ceil(Math.log2(n));

const [_, __, inp] = process.argv;
seed_load(new DataView(readFileSync(inp).buffer));

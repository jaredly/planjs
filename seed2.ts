import { readFileSync } from 'fs';

type Exp =
    | { tag: 'Word'; w: bigint }
    | { tag: 'Bigy'; sz: bigint; buf: bigint[] }
    | { tag: 'Cell'; f: Exp; x: Exp };

const show = (e: Exp): string => {
    if (!e) return `<MISSING>`;
    switch (e.tag) {
        case 'Word':
            return e.w.toString();
        case 'Bigy':
            return '<big>';
        case 'Cell':
            return `(${show(e.f)} ${show(e.x)})`;
    }
};

const tracked = (buf: DataView) => {
    let i = 0;
    const next64 = () => {
        if (i >= buf.byteLength) {
            throw new Error(`too large`);
        }
        // align to 8
        i = i - (i % 8);
        const v = buf.getBigUint64(i, true);
        i += 8;
        return v;
    };
    const next8 = () => {
        if (i >= buf.byteLength) {
            // throw new Error(`too large`);
            console.warn('too large?');
            return 0;
        }
        const v = buf.getUint8(i);
        i++;
        return v;
    };

    return { next64, next8 };
};

const n = (n: bigint) => Number(n);

const seed_load = (buf: DataView) => {
    const { next64, next8 } = tracked(buf);

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

    console.log(tab);

    let bits = next8().toString(2);
    const consume = (n: number) => {
        if (bits.length < n) {
            bits += next8().toString(2);
        }
        const res = bits.slice(0, n);
        bits = bits.slice(n);
        const v = parseInt(res.split('').reverse().join(''), 2);
        console.log('consumed', res, v);
        return v;
    };

    const frag_load_cell = (): Exp => {
        const f = frag_load();
        const x = frag_load();
        return { tag: 'Cell', f, x };
    };

    const frag_load = (): Exp => {
        const isCell = consume(1);
        if (isCell) return frag_load_cell();

        const ref = consume(bsize(tab.length));
        return tab[ref];
    };

    for (let i = 0; i < n_frags; i++) {
        tab.push(frag_load_cell());
        console.log(show(tab[tab.length - 1]));
    }
    // console.log(show(tab[tab.length - 1]));
};

const bsize = (n: number) => Math.ceil(Math.log2(n));

const [_, __, inp] = process.argv;
seed_load(new DataView(readFileSync(inp).buffer));

/*
ok lets talk about this


*/

import { readFileSync } from 'fs';

// @ts-ignore
DataView.prototype.getUint64 = function (byteOffset, littleEndian) {
    // split 64-bit number into two 32-bit parts
    const left = this.getUint32(byteOffset, littleEndian);
    const right = this.getUint32(byteOffset + 4, littleEndian);

    // combine the two 32-bit values
    const combined = littleEndian
        ? left + 2 ** 32 * right
        : 2 ** 32 * left + right;

    if (!Number.isSafeInteger(combined))
        console.warn(
            combined,
            'exceeds MAX_SAFE_INTEGER. Precision may be lost',
        );

    return combined;
};

const run = (data: ArrayBuffer) => {
    console.log('data', data.byteLength);
    let i = 0;
    // const arr = new ArrayBuffer(data)
    const d = new DataView(data);

    const next64 = () => {
        if (i >= data.byteLength) {
            throw new Error(`too large`);
            return BigInt(0);
        }
        const v = d.getBigUint64(i, true);
        i += 8;
        return v;
    };
    const next8 = () => {
        if (i >= data.byteLength) {
            throw new Error(`too large`);
            return 0;
        }
        const v = d.getUint8(i);
        i++;
        return v;
    };

    const numHoles = next64();
    const numBigNats = next64();
    const numWords = next64();
    const numBytes = next64();
    const numTrees = next64();
    const bigNatSizes = [];
    // console.log({ numHoles, numBigNats, numWords, numBytes });
    for (let i = 0; i < numBigNats; i++) {
        bigNatSizes.push(next64());
    }
    const bigNatData: bigint[][] = [];
    for (let bns of bigNatSizes) {
        let words = [];
        for (let i = 0; i < bns; i++) {
            words.push(next64());
        }
        bigNatData.push(words);
    }
    const words: bigint[] = [];
    for (let i = 0; i < numWords; i++) {
        words.push(next64());
    }
    const bytes: number[] = [];
    for (let i = 0; i < numBytes; i++) {
        bytes.push(next8());
    }
    const trees: number[] = [];
    for (let i = 0; i < numTrees; i++) {
        trees.push(next8());
    }
    const zeros: number[] = [];
    console.log({
        numHoles,
        numBigNats,
        numWords,
        numBytes,
        numTrees,
        bigNatSizes,
        bigNatData,
        words,
        bytes,
        trees,
    });

    const unpack = [];
    let refs = words.length + bytes.length;

    type Tree = bigint | bigint[] | number | [Tree, Tree];
    const pairs: Tree[] = [];

    const get = (idx: number): Tree => {
        const o = idx;
        if (idx < numBigNats) {
            // console.log('big', idx, o);
            return bigNatData[idx];
        }
        idx -= Number(numBigNats);
        if (idx < numWords) {
            // console.log('word', idx, o);
            return words[idx];
        }
        idx -= Number(numWords);
        if (idx < numBytes) {
            // console.log('bute', idx, o);
            return bytes[idx];
        }
        idx -= Number(numBytes);
        if (idx < pairs.length) {
            // console.log('pair', idx, o);
            return pairs[idx];
        }
        throw new Error(`idx out of bounds? ${o}`);
    };

    const sb = (_: any, v: any) => (typeof v === 'bigint' ? v.toString() : v);

    const total = trees
        .map((t) => rev(t.toString(2).padStart(8, '0')))
        .join('');
    console.log(total);

    let at = 0;
    for (let i = 0; i < trees.length; i++) {
        const size = bsize(refs);
        const one = parseInt(total.slice(at, at + size), 2);
        at += size;
        const two = parseInt(total.slice(at, at + size), 2);
        at += size;
        console.log(one, two);
        const go = get(one);
        const gt = get(two);
        pairs.push([go, gt]);
        console.log(`-> fragment: ${JSON.stringify([go, gt], sb)}`);
        refs++;
    }

    // for (let i = 0; i < trees.length; i++) {
    //     const size = bsize(refs);
    //     const tree = trees[i].toString(2).padStart(8, '0');
    //     const ot = rev(tree.slice(0, 4));
    //     const tt = rev(tree.slice(4));
    //     const one = parseInt(ot, 2);
    //     const two = parseInt(tt, 2);
    //     console.log(`tree[${tree}] ${ot}=${one} ${tt}=${two}`, 'dest =', refs);
    //     const go = get(one);
    //     const gt = get(two);
    //     pairs.push([go, gt]);
    //     console.log(`-> fragment: ${JSON.stringify([go, gt], sb)}`);
    //     refs++;
    // }
};

const rev = (s: string) => s.split('').reverse().join('');

const bsize = (n: number) => Math.ceil(Math.log2(n));

// const raw =
//     '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000101000000000000000010001001000000000000000000000000000000000000000';
// const bytes: number[] = [];
// for (let i = 0; i < raw.length; i += 8) {
//     const n = parseInt(
//         raw.slice(i, i + 8),
//         // .split('')
//         // .reverse()
//         // .join(''),
//         2,
//     );
//     bytes.push(n);
// }
// for (let i = 0; i < bytes.length; i += 8) {
//     console.log(bytes.slice(i, i + 8));
// }
// const buf = Buffer.from(bytes);
// console.log(buf.buffer);
// run(buf.buffer);

const [_, __, inp] = process.argv;
run(readFileSync(inp).buffer);

// 00000010

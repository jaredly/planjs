import equal from 'fast-deep-equal';
import { APP, LAW, NAT, PIN, REF, Val } from './types';
import { showNice } from '../pst';
import { natToAscii } from './natToAscii';

type Memory = {
    buffer: ArrayBuffer;
    view: BigUint64Array;
    idx: number;
};

export const setRequireOpPin = (val: boolean) => {
    if (!val) throw new Error('not supporte');
};

// positions:
// 1 & 3 are pointers
// 2 & 4 are numbers
// hmmmmm so, actually, I want to be able to use the whole
// thing for numbers if nat is big, right?
// yeah ok let's just do it normally.

const init = (): Memory => {
    const buffer = new ArrayBuffer(1024);
    return { buffer, view: new BigUint64Array(buffer), idx: 0 };
};

const grow = (mem: Memory) => {
    const oldv = mem.view;
    mem.buffer = new ArrayBuffer(mem.buffer.byteLength * 2);
    // mem.buffer = mem.buffer.transfer(mem.buffer.byteLength * 2);
    mem.view = new BigUint64Array(mem.buffer);
    mem.view.set(oldv);
};

const unpack = (mem: Memory, idx: number, got: Record<number, Val>): Val => {
    if (got[idx]) return got[idx];
    got[idx] = { v: [NAT, -1n] };
    switch (Number(mem.view[idx])) {
        case PIN:
            got[idx].v = [PIN, unpack(mem, Number(mem.view[idx + 1]), got)];
            break;
        case LAW:
            got[idx].v = [
                LAW,
                mem.view[idx + 1],
                mem.view[idx + 2],
                unpack(mem, Number(mem.view[idx + 3]), got),
            ];
            break;
        case APP:
            got[idx].v = [
                APP,
                unpack(mem, Number(mem.view[idx + 1]), got),
                unpack(mem, Number(mem.view[idx + 2]), got),
            ];
            break;
        case NAT:
            got[idx].v[1] = mem.view[idx + 1];
            break;
        default:
            throw new Error(`Unexpected tag ${mem.view[idx]}`);
    }
    return got[idx];
};

const show = (mem: Memory, idx: number) => {
    switch (Number(mem.view[idx])) {
        case PIN:
            return `PIN(${mem.view[idx + 1]})`;
        case LAW:
            return `LAW(${natToAscii(mem.view[idx + 1])} ${mem.view[idx + 2]} ${
                mem.view[idx + 3]
            })`;
        case APP:
            return `APP(${mem.view[idx + 1]} ${mem.view[idx + 2]})`;
        case NAT:
            return `NAT(${mem.view[idx + 1]})`;
        default:
            throw new Error(`Unexpected tag ${mem.view[idx]}`);
    }
};

const load = (val: Val, mem: Memory): number => {
    if (mem.idx + 4 >= mem.buffer.byteLength / 8) {
        grow(mem);
    }
    const i = mem.idx;
    mem.idx += 5;
    mem.view[i] = BigInt(val.v[0]);
    switch (val.v[0]) {
        case PIN:
            mem.view[i + 1] = BigInt(load(val.v[1], mem));
            break;
        case LAW:
            mem.view[i + 1] = val.v[1];
            mem.view[i + 2] = val.v[2];
            mem.view[i + 2] = BigInt(load(val.v[3], mem));
            break;
        case APP:
            mem.view[i + 1] = BigInt(load(val.v[1], mem));
            mem.view[i + 2] = BigInt(load(val.v[2], mem));
            break;
        case NAT:
            if (val.v[1] >= Math.pow(2, 64)) {
                throw new Error(`not packing big nats yet`);
            }
            mem.view[i + 1] = val.v[1];
            mem.view[i + 2] = 0n;
            mem.view[i + 3] = 0n;
            mem.view[i + 4] = 0n;
            break;
        case REF:
            throw new Error(`REFs shouldn't be in a starting value`);
    }
    return i;
};

export const Force = (v: Val) => {
    const mem = init();
    const at = load(v, mem);
    const full = unpack(mem, at, {});
    if (!equal(v, full)) {
        console.log('first:');
        console.log(showNice(v));
        console.log('second:');
        console.log(showNice(full));
        // console.log(mem.view);
        for (let i = 0; i < mem.idx; i += 5) {
            console.log(i, show(mem, i));
        }
        throw new Error('not');
    }
    console.log('loaded');
    return v;
};

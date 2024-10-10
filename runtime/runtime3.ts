import equal from 'fast-deep-equal';
import {
    APP,
    AppVal,
    IPinVal,
    LAW,
    LawVal,
    NAT,
    NatVal,
    PIN,
    PinVal,
    REF,
    Val,
} from './types';
import { showNice } from '../pst';
import { natToAscii } from './natToAscii';
import objectHash from 'object-hash';

type Memory = {
    buffer: ArrayBuffer;
    view: DataView;
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
    return { buffer, view: new DataView(buffer), idx: 0 };
};

const grow = (mem: Memory) => {
    const oldv = new Uint8Array(mem.buffer);
    mem.buffer = new ArrayBuffer(mem.buffer.byteLength * 2);
    mem.view = new DataView(mem.buffer);
    new Uint8Array(mem.buffer).set(oldv);
};

const unpack = (mem: Memory, idx: number, got: Record<number, Val>): Val => {
    if (got[idx]) return got[idx];
    got[idx] = { v: [NAT, -1n] };
    switch (mem.view.getUint8(idx)) {
        case PIN:
            got[idx].v = lPIN.get(mem, idx, got).v;
            break;
        case LAW:
            got[idx].v = lLAW.get(mem, idx, got).v;
            break;
        case APP:
            got[idx].v = lAPP.get(mem, idx, got).v;
            break;
        case NAT:
            got[idx].v = lNAT.get(mem, idx, got).v;
            break;
        default:
            throw new Error(`Unexpected tag`);
    }
    return got[idx];
};

const show = (mem: Memory, idx: number) => {
    switch (mem.view.getUint8(idx)) {
        case PIN:
            return lPIN.show(mem, idx);
        case LAW:
            return lLAW.show(mem, idx);
        case APP:
            return lAPP.show(mem, idx);
        case NAT:
            return lNAT.show(mem, idx);
        default:
            throw new Error(`Unexpected tag $`);
    }
};

type GS<V> = {
    set(v: V, mem: Memory, i: number): void;
    get(mem: Memory, i: number, got: Record<number, Val>): V;
    show(mem: Memory, i: number): string;
};

const lPIN: GS<PinVal> = {
    set(v, mem, i) {
        mem.view.setUint32(i + 1, load(v.v[1], mem));
    },
    get(mem, idx, got) {
        return { v: [PIN, unpack(mem, mem.view.getUint32(idx + 1), got)] };
    },
    show(mem, idx) {
        return `PIN(${mem.view.getUint32(idx + 1)})`;
    },
};

const lLAW: GS<LawVal> = {
    set(val, mem, i) {
        mem.view.setBigUint64(i + 1, val.v[1]);
        mem.view.setUint8(i + 9, Number(val.v[2]));
        mem.view.setUint32(i + 10, load(val.v[3], mem));
    },
    get(mem, idx, got) {
        return {
            v: [
                LAW,
                mem.view.getBigUint64(idx + 1),
                BigInt(mem.view.getUint8(idx + 9)),
                unpack(mem, mem.view.getUint32(idx + 10), got),
            ],
        };
    },
    show(mem, idx) {
        return `LAW(${natToAscii(
            mem.view.getBigUint64(idx + 1),
        )} ${mem.view.getUint8(idx + 9)} ${mem.view.getUint32(idx + 3)})`;
    },
};

const lAPP: GS<AppVal> = {
    set(val, mem, i) {
        mem.view.setUint32(i + 1, load(val.v[1], mem));
        mem.view.setUint32(i + 5, load(val.v[2], mem));
    },
    get(mem, idx, got) {
        return {
            v: [
                APP,
                unpack(mem, mem.view.getUint32(idx + 1), got),
                unpack(mem, mem.view.getUint32(idx + 5), got),
            ],
        };
    },
    show(mem, idx) {
        return `APP(${mem.view.getUint32(idx + 1)} ${mem.view.getUint32(
            idx + 5,
        )})`;
    },
};

const lNAT: GS<NatVal> = {
    set(val, mem, i) {
        if (val.v[1] >= Math.pow(2, 64)) {
            throw new Error(`not packing big nats yet`);
        }
        mem.view.setBigUint64(i + 1, val.v[1]);
    },
    get(mem, idx, got) {
        return {
            v: [NAT, mem.view.getBigUint64(idx + 1)],
        };
    },
    show(mem, idx) {
        return `NAT(${mem.view.getBigUint64(idx + 1)})`;
    },
};

const load = (val: Val, mem: Memory): number => {
    if (mem.idx + 14 >= mem.buffer.byteLength) {
        grow(mem);
    }
    const i = mem.idx;
    mem.idx += 14;
    mem.view.setUint8(i, val.v[0]);
    switch (val.v[0]) {
        case PIN:
            lPIN.set(val as PinVal, mem, i);
            break;
        case LAW:
            lLAW.set(val as LawVal, mem, i);
            break;
        case APP:
            lAPP.set(val as AppVal, mem, i);
            break;
        case NAT:
            lNAT.set(val as NatVal, mem, i);
            break;
        case REF:
            throw new Error(`REFs shouldn't be in a starting value`);
    }
    console.log(`loaded`, showNice(val), i);
    return i;
};

const mapPins = <A, B>(v: IPinVal<A>, f: (a: A) => B): IPinVal<B> => {
    switch (v.v[0]) {
        case PIN:
            return { v: [PIN, f(v.v[1])] };
        case LAW:
            return { v: [LAW, v.v[1], v.v[2], mapPins(v.v[3], f)] };
        case APP:
            return { v: [APP, mapPins(v.v[1], f), mapPins(v.v[2], f)] };
        case NAT:
            return { v: [NAT, v.v[1]] };
    }
};

const traverse = (v: Val, f: (v: Val) => void) => {
    f(v);
    switch (v.v[0]) {
        case PIN:
            traverse(v.v[1], f);
            break;
        case LAW:
            traverse(v.v[3], f);
            break;
        case APP:
            traverse(v.v[1], f);
            traverse(v.v[2], f);
            break;
    }
};

const findPins = (v: Val) => {
    const pins: Record<string, Val> = {};
    traverse(v, (v) => {
        if (v.v[0] === PIN) {
            const h = objectHash(v.v[1]);
            if (!pins[h]) {
                pins[h] = v.v[1];
            }
        }
    });
    return pins;
};

export const Force = (v: Val) => {
    const mem = init();
    const pins = findPins(v);
    const at = load(v, mem);
    const full = unpack(mem, at, {});
    if (!equal(v, full)) {
        console.log('first:');
        console.log(showNice(v));
        console.log('second:');
        console.log(showNice(full));
        for (let i = 0; i <= mem.idx; i += 14) {
            console.log(i, show(mem, i));
        }
        throw new Error('not');
    } else {
        console.log('loaded and its all good');
    }
    return v;
};

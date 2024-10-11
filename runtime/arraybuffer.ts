import equal from 'fast-deep-equal';
import { natToAscii } from './natToAscii';
import { APP, IPinVal, LAW, NAT, NatVal, PIN, REF, Val } from './types';

export type Memory = {
    alloc(): number;
    buffer: ArrayBuffer;
    view: DataView;
    stack: number;
    idx: number;
};

export type NVal = IPinVal<number>;

export const init = (): Memory => {
    const buffer = new ArrayBuffer(1024);
    return {
        buffer,
        alloc() {
            if (this.idx + 14 >= this.buffer.byteLength) {
                grow(this);
            }
            const current = this.idx;
            this.idx += 14;
            return current;
        },
        view: new DataView(buffer),
        idx: 0,
        stack: 0,
    };
};

export const grow = (mem: Memory) => {
    const oldv = new Uint8Array(mem.buffer);
    mem.buffer = new ArrayBuffer(mem.buffer.byteLength * 2);
    mem.view = new DataView(mem.buffer);
    new Uint8Array(mem.buffer).set(oldv);
};

export const unpack = (
    mem: Memory,
    idx: number,
    got: Record<number, Val>,
): Val => {
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

export const show = (mem: Memory, idx: number) => {
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

type Outer = {
    set(mem: Memory, i: number, offset: number, value: number | bigint): void;
    set8(mem: Memory, i: number, offset: number, value: number): void;
    get8(mem: Memory, i: number, offset: number): number;
    get32(mem: Memory, i: number, offset: number): number;
    get64(mem: Memory, i: number, offset: number): bigint;
};

const makeOuter = (offsets: number[]): Outer => ({
    set8(mem, i, offset, value) {
        if (offset >= offsets.length) throw new Error('invalid offset');
        mem.view.setUint8(i + offsets[offset], value);
    },
    set(mem, i, offset, value) {
        if (offset >= offsets.length) throw new Error('invalid offset');
        if (typeof value === 'number') {
            mem.view.setUint32(i + offsets[offset], value);
        } else {
            mem.view.setBigUint64(i + offsets[offset], value);
        }
    },
    get8(mem, i, offset) {
        if (offset >= offsets.length) throw new Error('invalid offset');
        return mem.view.getUint8(i + offsets[offset]);
    },
    get32(mem, i, offset) {
        if (offset >= offsets.length) throw new Error('invalid offset');
        return mem.view.getUint32(i + offsets[offset]);
    },
    get64(mem, i, offset) {
        if (offset >= offsets.length) throw new Error('invalid offset');
        return mem.view.getBigUint64(i + offsets[offset]);
    },
});

type GS<V> = {
    set(v: V, mem: Memory, i: number): void;
    get(mem: Memory, i: number, got: Record<number, Val>): Val;
    show(mem: Memory, i: number): string;
};

const lPIN: GS<{ v: [0, number] }> = {
    set(v, mem, i) {
        mem.view.setUint32(i + OFF0, v.v[1] * 14);
    },
    get(mem, idx, got) {
        const at = mem.view.getUint32(idx + OFF0);
        return { v: [PIN, unpack(mem, at, got)] };
        // return { v: [PIN, mem.view.getUint32(idx +OFF0) / 14] };
    },
    show(mem, idx) {
        return `PIN(${mem.view.getUint32(idx + OFF0)})`;
    },
};

const OFF0 = 1;
const LAW1 = 9;
const LAW2 = 10;
const APP1 = 5;

const REF1 = 5;

export const getTag = (m: Memory, o: number) => m.view.getUint8(o);
export const setTag = (m: Memory, o: number, tag: number) =>
    m.view.setUint8(o, tag);

export const mREF = {
    env: (m: Memory, o: number) => m.view.getUint32(o + OFF0),
    setEnv: (m: Memory, o: number, env: number) =>
        m.view.setUint32(o + OFF0, env),
    idx: (m: Memory, o: number) => m.view.getUint8(o + REF1),
    setIdx: (m: Memory, o: number, idx: number) =>
        m.view.setUint8(o + REF1, idx),

    write(m: Memory, o: number, env: number, idx: number) {
        setTag(m, o, REF);
        mREF.setEnv(m, o, env);
        mREF.setIdx(m, o, idx);
    },
};

const ENV = REF + 1;

const ENV1 = 2;
const ENV2 = 6;
const ENV3 = 10;
export const mENV = {
    size: (m: Memory, o: number) => m.view.getUint8(o + OFF0),
    setSize: (m: Memory, o: number, size: number) =>
        m.view.setUint8(o + OFF0, size),

    head: (m: Memory, o: number) => m.view.getUint32(o + ENV1),
    setHead: (m: Memory, o: number, head: number) =>
        m.view.setUint32(o + ENV1, head),

    mid: (m: Memory, o: number) => m.view.getUint32(o + ENV2),
    setMid: (m: Memory, o: number, mid: number) =>
        m.view.setUint32(o + ENV2, mid),

    tail: (m: Memory, o: number) => m.view.getUint32(o + ENV3),
    setTail: (m: Memory, o: number, tail: number) =>
        m.view.setUint32(o + ENV3, tail),

    write(
        m: Memory,
        o: number,
        size: number,
        head: number,
        mid: number,
        tail: number,
    ) {
        setTag(m, o, ENV);
        mENV.setSize(m, o, size);
        mENV.setHead(m, o, head);
        mENV.setMid(m, o, mid);
        mENV.setTail(m, o, tail);
    },
};

export const mPIN = {
    set: (m: Memory, o: number, v: number) => m.view.setUint32(o + OFF0, v),
    get: (m: Memory, o: number) => m.view.getUint32(o + OFF0),

    write(m: Memory, o: number, value: number) {
        setTag(m, o, PIN);
        mPIN.set(m, o, value);
    },
};

export const mNAT = {
    set: (m: Memory, o: number, v: bigint) => m.view.setBigUint64(o + OFF0, v),
    get: (m: Memory, o: number) => m.view.getBigUint64(o + OFF0),

    write(m: Memory, o: number, value: bigint) {
        setTag(m, o, NAT);
        mNAT.set(m, o, value);
    },
};

export const mAPP = {
    f: (m: Memory, o: number) => m.view.getUint32(o + OFF0),
    setF: (m: Memory, o: number, v: number) => m.view.setUint32(o + OFF0, v),

    x: (m: Memory, o: number) => m.view.getUint32(o + APP1),
    setX: (m: Memory, o: number, v: number) => m.view.setUint32(o + APP1, v),

    read: (m: Memory, o: number) => ({
        f: mAPP.f(m, o),
        x: mAPP.x(m, o),
    }),
    write(m: Memory, o: number, f: number, x: number) {
        setTag(m, o, APP);
        mAPP.setF(m, o, f);
        mAPP.setX(m, o, x);
    },
};

export const mLAW = {
    name: (m: Memory, o: number) => m.view.getUint32(o + OFF0),
    setName: (m: Memory, o: number, v: bigint) =>
        m.view.setBigUint64(o + OFF0, v),

    arity: (m: Memory, o: number) => m.view.getUint32(o + LAW1),
    setArity: (m: Memory, o: number, v: number) =>
        m.view.setUint32(o + LAW1, v),

    body: (m: Memory, o: number) => m.view.getUint32(o + LAW2),
    setBody: (m: Memory, o: number, v: number) => m.view.setUint32(o + LAW2, v),

    read: (m: Memory, o: number) => ({
        name: mLAW.name(m, o),
        arity: mLAW.arity(m, o),
        body: mLAW.body(m, o),
    }),
    write(m: Memory, o: number, name: bigint, arity: number, body: number) {
        setTag(m, o, APP);
        mLAW.setName(m, o, name);
        mLAW.setArity(m, o, arity);
        mLAW.setBody(m, o, body);
    },
};

// export const mLAW = makeOuter([OFF0, LAW1, LAW2]);
// export const mPIN = makeOuter([OFF0]);
// export const mREF = makeOuter([OFF0, 5]);
// export const mENV = makeOuter([OFF0, 2, 3])
// export const mAPP = makeOuter([OFF0, APP1]);
// export const mNAT = makeOuter([OFF0]);

const lLAW: GS<{ v: [1, bigint, bigint, NVal] }> = {
    set(val, mem, i) {
        // if (val.v[1] >= 18446744073709551616n) {
        //     console.warn('name too large');
        // }
        mem.view.setBigUint64(i + OFF0, val.v[1]);
        mem.view.setUint8(i + LAW1, Number(val.v[2]));
        const body = load(val.v[3], mem);
        mem.view.setUint32(i + LAW2, body);
    },
    get(mem, idx, got) {
        return {
            v: [
                LAW,
                mem.view.getBigUint64(idx + OFF0),
                BigInt(mem.view.getUint8(idx + LAW1)),
                unpack(mem, mem.view.getUint32(idx + LAW2), got),
            ],
        };
    },
    show(mem, idx) {
        return `LAW(${natToAscii(
            mem.view.getBigUint64(idx + OFF0),
        )} ${mem.view.getUint8(idx + LAW1)} ${mem.view.getUint32(idx + LAW2)})`;
    },
};

const lAPP: GS<{ v: [2, NVal, NVal] }> = {
    set(val, mem, i) {
        const f = load(val.v[1], mem);
        mem.view.setUint32(i + OFF0, f);
        const g = load(val.v[2], mem);
        mem.view.setUint32(i + APP1, g);
    },
    get(mem, idx, got) {
        return {
            v: [
                APP,
                unpack(mem, mem.view.getUint32(idx + OFF0), got),
                unpack(mem, mem.view.getUint32(idx + APP1), got),
            ],
        };
    },
    show(mem, idx) {
        return `APP(${mem.view.getUint32(idx + OFF0)} ${mem.view.getUint32(
            idx + APP1,
        )})`;
    },
};

const lNAT: GS<NatVal> = {
    set(val, mem, i) {
        if (val.v[1] >= Math.pow(2, 64)) {
            throw new Error(`not packing big nats yet`);
        }
        mem.view.setBigUint64(i + OFF0, val.v[1]);
    },
    get(mem, idx, got) {
        return {
            v: [NAT, mem.view.getBigUint64(idx + OFF0)],
        };
    },
    show(mem, idx) {
        return `NAT(${mem.view.getBigUint64(idx + OFF0)})`;
    },
};

const loadAt = (val: NVal, mem: Memory, i: number) => {
    mem.view.setUint8(i, val.v[0]);
    switch (val.v[0]) {
        case PIN:
            lPIN.set(val as any, mem, i);
            break;
        case LAW:
            lLAW.set(val as any, mem, i);
            break;
        case APP:
            lAPP.set(val as any, mem, i);
            break;
        case NAT:
            lNAT.set(val as NatVal, mem, i);
            break;
    }
};

const load = (val: NVal, mem: Memory): number => {
    if (mem.idx + 14 >= mem.buffer.byteLength) {
        grow(mem);
    }
    const i = mem.idx;
    mem.idx += 14;
    loadAt(val, mem, i);
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

const backPins = (v: NVal, pins: [NVal, Val][]): Val => {
    return mapPins(v, (v) => {
        return backPins(pins[v][0], pins);
    });
};

export const findPins = (v: Val, pins: [NVal, Val][]): NVal => {
    return mapPins(v as IPinVal<Val>, (v) => {
        const idx = pins.findIndex((f) => equal(f[1], v));
        if (idx === -1) {
            const at = pins.length;
            pins.push([{ v: [NAT, 0n] }, v]);
            pins[at][0] = findPins(v, pins);
            return at;
        }
        return idx;
    });
};

export const vimport = (v: Val) => {
    const mem = init();
    const pins: [NVal, Val][] = [];
    const changed = findPins(v, pins);

    mem.idx = pins.length * 14;
    pins.forEach(([pin, _], i) => {
        loadAt(pin, mem, i * 14);
    });

    const at = load(changed, mem);
    mem.stack = mem.idx;
    return { mem, at };
};

export const vexport = (mem: Memory, at: number) => {
    return unpack(mem, at, {});
};

export const roundTrip = (v: Val): Val => {
    const { mem, at } = vimport(v);
    return vexport(mem, at);
};

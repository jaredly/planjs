/*
P string
L function.{nameNat, length, body}
A {lazy: [target, arg] | PLAN, forced: boolean}
N number | bigint
*/

import { asciiToNat, natToAscii } from '../../runtime/natToAscii';
import { perf } from '../../runtime/perf';

// type App = [Value, Value];

// Invariant:
// An app is either [NotAnApp, maybe_multiple_values]
// OR [Value, [one_single_value]]
type Lazy = [0 | 1, Value, [Value, ...Value[]]] | [1, Immediate]; // { lazy: Immediate | App; forced: boolean };
export type Value = Immediate | Lazy;
export type Immediate = Law | number | bigint | string;
export type Law = Function & { nameNat: bigint; body: Value };

export const PINS: Record<string, Value> = {
    LAW: 0,
    PCASE: 1,
    NCASE: 2,
    INC: 3,
    PIN: 4,
};

export const pin = (v: Value, hash: string) => {
    PINS[hash] = v;
};
export const pinLaw = (f: Function, name = f.name) => {
    const l: Law = f as any;
    l.nameNat = asciiToNat(name);
    l.body = 0;
    PINS[name] = l;
};

const unlazy = (v: Body) => {
    if (typeof v === 'object' && v.length === 2 && v[0] === 1)
        return unlazy(v[1]);
    return v;
};

const unwrapList = (v: Body, lst: Body[]) => {
    if (typeof v === 'object' && v.length === 3) {
        const first = unlazy(v[1]);
        if (typeof first === 'number' || typeof first === 'bigint') {
            lst.push(first);
            if (v[2].length > 1) {
                lst.push(...v[2]);
            } else {
                unwrapList(v[2][0], lst);
            }
            return;
        }
    }
    lst.push(v);
};

export type BLazy = [0 | 1, Body, [Body, ...Body[]]] | [1, Immediate];
export type Body = Immediate | BLazy | [3, number]; /* (ref int) */

export const show = (v: Body, trail: Body[] = []): string => {
    if (trail.includes(v)) return 'recurse';
    trail = [...trail, v];
    switch (typeof v) {
        case 'number':
        case 'bigint':
            return v + '';
        case 'string':
            return `PIN(${v})`;
        case 'function':
            return `LAW(${natToAscii(v.nameNat)})`;
        case 'object':
            if (v.length === 3) {
                const first = unlazy(v[1]);
                if (typeof first === 'number' || typeof first === 'bigint') {
                    const lst: Value[] = [];
                    unwrapList(v, lst);
                    return `[${lst.map((l) => show(l, trail)).join(', ')}]`;
                }
                return `APP(${show(v[1], trail)} ${v[2].map((v) =>
                    show(v, trail),
                )})`;
                // return `aAPP`;
            }
            return show(v[1], trail);
    }
};

export const forceDeep = (v: Value): Value => {
    v = force(v);
    if (Array.isArray(v) && v.length === 3) {
        forceDeep(v[1]);
        v[2].forEach(forceDeep);
    }
    return v;
};

export const force = (v: Value): Value => {
    if (typeof v !== 'object') return v;
    if (!v[0]) forceApp(v);
    collapseLazy(v);
    // console.log('resolve', show(v));
    return v.length === 2 ? v[1] : v;
};

const collapseLazy = (v: Lazy) => {
    if (v.length === 2 && Array.isArray(v[1])) {
        force(v[1]);
        const inner = v[1];
        // collapse down nested lazy
        v[1] = inner[1];
        if (inner.length === 3) {
            v.push(inner[2]);
        }
    }
};

export const setLocal = (v: Lazy, n: Value) => {
    if (Array.isArray(n)) {
        v[0] = n[0];
        v[1] = n[1];
        if (n.length === 3) {
            v[2] = n[2];
        } else if (v.length === 3) {
            v.pop();
        }
    } else {
        v[0] = 1;
        v[1] = n;
        if (v.length === 3) v.pop();
    }
};

const setLazy = (v: Lazy, n: Value) => {
    if (v[0]) {
        console.log(v, n);
        throw new Error(`cant re-force an already forced`);
    }
    v[0] = 1;
    v[1] = n;
    if (v.length === 3) {
        v.pop();
    }
};

const forceApp = (v: Value) => {
    if (typeof v !== 'object' || v[0]) return;
    v[0] = 1;
    const trail: { v: Lazy; arg: Value }[] = [];
    let f: Value | Function = v;
    let self: null | Value = null;
    while (true) {
        switch (typeof f) {
            // LAW
            case 'function': {
                if (f.length > trail.length) {
                    return; // nothing to see here
                }
                const dest = trail[f.length - 1];
                const args = trail.splice(0, f.length).map((a) => a.arg);
                const result: Value = f.apply(self ?? f, args);
                if (!trail.length) {
                    v[0] = 0;
                }
                setLazy(dest.v, result);
                f = result;
                continue;
            }
            // PIN
            case 'string': {
                let pin: Value | Function = PINS[f];
                // console.log('got pin', f, pin);
                if (pin == null) {
                    console.log(PINS);
                    throw new Error(`unknowwn pin ${f}`);
                }
                // PIN(LAW) wants the self to be the pin, not the law
                // BUT if I'm doing this all in Bun with a `new Function` it gets mad
                // if (typeof pin === 'function') {
                //     // lol ok so calling `this` with a string does weird things???
                //     // ONLY if the function was created in an Eval. Like a cross-domain thing?
                //     // idk. might also be bun-specific
                //     // self = f;
                // }
                if (
                    perf &&
                    (typeof pin === 'number' || typeof pin === 'bigint') &&
                    pin >= 0 &&
                    pin <= 4
                ) {
                    perf.ops[pin as 0]++;
                }
                if (pin === 0 || pin === 0n) pin = LAW;
                else if (pin === 1 || pin === 1n) pin = PCASE;
                else if (pin === 2 || pin === 2n) pin = NCASE;
                else if (pin === 3 || pin === 3n) pin = INC;
                else if (pin === 4 || pin === 4n) pin = PIN;
                f = pin;
                continue;
            }
            // APP or a lazy
            case 'object': {
                if (f.length === 3) {
                    if (f[2].length > 1) {
                        throw new Error('not yet padawan');
                    }
                    trail.unshift({ v: f, arg: f[2][0] });
                    f = f[1];
                } else {
                    f = f[1];
                }
                continue;
            }
            default:
                // console.log('not a thing we can call', f);
                // NAT
                return;
        }
    }
};

const INC = (v: Value) => {
    v = force(v);
    if (typeof v === 'number') {
        if (v < Number.MAX_SAFE_INTEGER - 1) {
            return v + 1;
        }
        return BigInt(v) + 1n;
    }
    if (typeof v === 'bigint') {
        return v + 1n;
    }
    return 1;
};

const NAT = (v: Value) => {
    v = force(v);
    switch (typeof v) {
        case 'bigint':
        case 'number':
            return v;
        default:
            return 0;
    }
};

const PIN = (v: Value): Value => {
    throw new Error(`no PIN op supported just yet`);
    // TODO: hash
    // return { hash: 'lolno', contents: v };
};

const LAW = (name: Value, arity: Value, body: Value): Value => {
    // TODO compile
    const f = () => {
        throw new Error('oof');
    };
    const nameNat = BigInt(NAT(name));
    f.length = Number(NAT(arity));
    f.body = body;
    f.nameNat = nameNat;
    f.name = natToAscii(nameNat);
    return f;
};

export const APP = (f: Value, x: Value): Value => [0, f, [x]];
export const APPS = (f: Value, ...args: Value[]) => {
    while (args.length) {
        f = APP(f, args.shift()!);
    }
    return f;
};

const NCASE = (zero: Value, plus: Value, x: Value): Value => {
    x = force(x);
    if (
        x === 0 ||
        x === 0n ||
        (typeof x !== 'number' && typeof x !== 'bigint')
    ) {
        return zero;
    }
    if (typeof x === 'number') {
        return APP(plus, x - 1);
    } else {
        return APP(plus, x - 1n);
    }
};

const PCASE = (p: Value, l: Value, a: Value, n: Value, x: Value) => {
    x = force(x);
    // console.log('pcase', x);
    if (typeof x === 'number' || typeof x === 'bigint') {
        return APP(n, x);
    }
    if (typeof x === 'function') {
        return APPS(l, x.nameNat, x.length, x.body);
    }
    if (typeof x === 'string') {
        return APPS(p, PINS[x]);
    }
    if (x.length !== 3) {
        throw new Error(
            `force didnt work? shouldnt return a lazy with a non-app`,
        );
    }
    // if (x[2].length > 1) {
    //     return APPS(a, [0, x[1], x[2].slice(0, -1)], x[2][x[2].length - 1]);
    // }
    return APPS(a, x[1], x[2][0]);
};

export const asLaw = (f: Function, name: bigint, body: Value): Law => {
    const l: Law = f as any;
    l.nameNat = name;
    l.body = body;
    return l;
};

export const OP_FNS = { PCASE, LAW, PIN, INC, NCASE };

/*
P string
L function.{nameNat, length, body}
A {lazy: [target, arg] | PLAN, forced: boolean}
N number | bigint
*/

import { asciiToNat, natToAscii } from '../runtime/natToAscii';
import { perf } from '../runtime/perf';

export type Law = Function & { nameNat: bigint; body: Value };
type Immediate = Law | number | bigint | string;
type Lazy = [0 | 1, Value, [Value, ...Value[]]] | [1, Immediate]; // { lazy: Immediate | App; forced: boolean };
export type Value = Immediate | Lazy;

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

const unwrapList = (v: Value, lst: Value[]) => {
    if (
        typeof v === 'object' &&
        v.length === 3 &&
        (typeof v[1] === 'number' || typeof v[1] === 'bigint') &&
        v[2].length === 1
    ) {
        lst.push(v[1]);
        unwrapList(v[2][0], lst);
    } else {
        lst.push(v);
    }
};

export const show = (v: Value, trail: Value[] = []): string => {
    if (trail.includes(v)) return 'recurse';
    const otrail = trail;
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
                // if (typeof v[1] === 'number' || typeof v[1] === 'bigint') {
                //     const lst: Value[] = [];
                //     unwrapList(v, lst);
                //     return `[${lst.map((l) => show(l, trail)).join(', ')}]`;
                // }
                return `APP(${show(v[1], trail)} ${v[2]
                    .map((v) => show(v, trail))
                    .join(' ')})`;
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
        // forceDeep(v[2]);
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

const maybeCollapse = (target: Value) => {
    if (typeof target !== 'object' || target[0] || target[2].length > 1) return;
    const trail: { v: Lazy; arg: Value }[] = [{ v: target, arg: target[2][0] }];
    let f: Value | Function = target[1];
    let self: null | Value = null;
    while (true) {
        switch (typeof f) {
            case 'string':
                let inner: Value | Function = PINS[f];
                if (inner === 0 || inner === 0n) inner = LAW;
                if (inner === 1 || inner === 1n) inner = PCASE;
                if (inner === 2 || inner === 2n) inner = NCASE;
                if (inner === 3 || inner === 3n) inner = INC;
                if (inner === 4 || inner === 4n) inner = PIN;
                self = f;
                f = inner;
                continue;
            case 'function':
                if (f.length <= trail.length) {
                    const dest = trail[f.length - 1];
                    dest.v[0] = 0;
                    dest.v[1] = self ?? (f as Law);
                    dest.v[2] = trail.slice(0, f.length).map((t) => t.arg) as [
                        Value,
                        ...Value[],
                    ];
                }
                return;
            case 'object':
                if (f[0]) {
                    f = f[1];
                    continue;
                }
                if (f[2].length > 1) {
                    console.warn('ignoring possible further-collapsible thing');
                    return;
                }
                trail.unshift({ v: f, arg: f[2][0] });
                f = f[1];
                continue;
            case 'number':
            case 'bigint':
                const dest = trail[trail.length - 1];
                dest.v[0] = 0;
                dest.v[1] = f;
                dest.v[2] = trail.map((t) => t.arg) as [Value, ...Value[]];
                break;
        }
        break;
    }
};

const getFunction = (target: Value): Function | null => {
    switch (typeof target) {
        case 'function':
            return target;
        case 'string':
            const inner = PINS[target];
            if (inner === 0 || inner === 0n) return LAW;
            if (inner === 1 || inner === 1n) return PCASE;
            if (inner === 2 || inner === 2n) return NCASE;
            if (inner === 3 || inner === 3n) return INC;
            if (inner === 4 || inner === 4n) return PIN;
            return getFunction(inner);
        case 'object':
            if (target.length === 2) {
                return getFunction(target[1]);
            }
            throw new Error(
                `invalid app coalescing, a multi-arg APP must be the innermost.`,
            );
    }
    return null;
};

const forceApp = (v: Value) => {
    if (typeof v !== 'object' || v[0]) return;
    v[0] = 1;
    // if there are multiple args, the target must be
    // a function, or uncallable.
    if (v[2].length > 1) {
        const args = v[2];
        const target = getFunction(v[1]);
        if (!target) return; // not applyable
        if (target.length < args.length) {
            throw new Error(
                `Invalid coalescing of APPs; a function's arity is less than the associated args.`,
            );
        }
        if (target.length > args.length) {
            return; // done here
        }
        const result = target.apply(target, args);
        v[0] = 0;
        setLazy(v, result);
        return;
    }

    const trail: { v: Lazy; arg: Value }[] = [{ v, arg: v[2][0] }];
    let f: Value | Function = v[1];
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
                const result = f.apply(self ?? f, args);
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
                        const args = f[2];
                        const target = getFunction(f[1]);
                        if (!target) return;
                        if (target.length < args.length) {
                            throw new Error(
                                `Invalid coalescing of APPs; a function's arity is less than the associated args.`,
                            );
                        }
                        const dest = trail[target.length - args.length];
                        const total = args.concat(trail.map((t) => t.arg));
                        if (target.length > total.length) {
                            return; // done here
                        }
                        const result = target.apply(
                            target,
                            total.slice(0, target.length),
                        );
                        if (trail.length === 0) {
                            v[0] = 0;
                        }
                        setLazy(dest.v, result);

                        f = result;
                        continue;
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
    if (x[2].length === 1) {
        return APPS(a, x[1], x[2][0]);
    }
    return APPS(
        a,
        [0, x[1], x[2].slice(0, -1) as [Value, ...Value[]]],
        x[2][x[2].length - 1],
    );
};

export const asLaw = (f: Function, name: bigint, body: Value): Law => {
    const l: Law = f as any;
    l.nameNat = name;
    l.body = body;
    return l;
};

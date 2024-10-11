/*
P {hash: string, contents: Value}
L function.{nameNat, length, body}
A [target, arg, arg, arg]
N number | bigint

*/

import { asciiToNat, natToAscii } from '../runtime/natToAscii';

type Law = Function & { nameNat: bigint; body: Value };
// string is a pin
type Immediate = Law | number | bigint | string;
type App = [Value, Value];
type Lazy = { lazy: Immediate | App; forced: boolean };
type Value = Immediate | Lazy;

const PINS: Record<string, Value> = {
    LAW: 0,
    PCASE: 1,
    NCASE: 2,
    INC: 3,
    PIN: 4,
};

// const

// const Execute = (v: Value, arg: Value) => {
//     const args: Value[] = [arg];
//     let n = v
//     while (true) {
//         if (typeof n === 'string') {
//             const inner = PINS[n]
//             if (inner == null) throw new Error(`unknown pin ${n}`)
//             if (typeof inner === 'number') {
//             }
//         }
//     }
// }

/*

(len f = 3)

(((((f a) b) c) d) e)

soooo like
when I get down to `f`,
I want to know:
what are the lazies for each arg actually.

Evalute N=5
Execute N=5
arg[]
arg[e]
-Evaluate N=4
-Execute N=4
-arg[]
-arg[d]
--EV 3
--EX 3
--arg[]
--arg[c]
---EV 2
---EX 2
---arg[]
---arg[b]
----EV 1
----EX 1
----arg[]
----arg[a]
-----EV f
----<f
---<null
---arg[a b]

yeah this feels like a ton of wasted work.

IF (len f) > 5  : we do nothing
IF (len f) < 5  : we update the lazy
IF (len f) === 5: we update the innermost lazy
right???

*/

const show = (v: Value): string => {
    switch (typeof v) {
        case 'number':
        case 'bigint':
            return v + '';
        case 'string':
            return `PIN(${v})`;
        case 'function':
            return `LAW(${natToAscii(v.nameNat)})`;
        case 'object':
            if (Array.isArray(v.lazy)) {
                return `APP(${show(v.lazy[0])} ${show(v.lazy[1])})`;
            }
            return show(v.lazy);
    }
};

const force = (v: Value): Value => {
    if (typeof v !== 'object') return v;
    if (!v.forced) forceApp(v);
    return !Array.isArray(v.lazy) ? force(v.lazy) : v;
};

const forceApp = (v: Value) => {
    if (typeof v !== 'object' || v.forced || !Array.isArray(v.lazy)) return;
    console.log('forceing', show(v));
    v.forced = true;
    const trail: { v: Lazy; arg: Value }[] = [{ v, arg: v.lazy[1] }];
    let f: Value | Function = v.lazy[0];
    let self: null | Value = null;
    while (true) {
        switch (typeof f) {
            // LAW
            case 'function': {
                if (f.length > trail.length) return; // nothing to see here
                const dest = trail[f.length - 1];
                const args = trail.splice(0, f.length).map((a) => a.arg);
                const result = f.apply(self ?? f, args);
                dest.v.forced = true;
                dest.v.lazy = result;
                f = result;
                continue;
            }
            // PIN
            case 'string': {
                let pin: Value | Function = PINS[f];
                // PIN(LAW) wants the self to be the pin, not the law
                if (typeof pin === 'function') {
                    self = f;
                }
                if (pin === 0) pin = LAW;
                else if (pin === 1) pin = PCASE;
                else if (pin === 2) pin = NCASE;
                else if (pin === 3) pin = INC;
                else if (pin === 4) pin = PIN;
                f = pin;
                continue;
            }
            // APP or a lazy
            case 'object': {
                if (Array.isArray(f.lazy)) {
                    trail.unshift({ v: f, arg: f.lazy[1] });
                    f = f.lazy[0];
                } else {
                    f = f.lazy;
                }
                continue;
            }
            default:
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

const APP = (f: Value, x: Value): Value => ({ lazy: [f, x], forced: false });
const APPS = (f: Value, ...args: Value[]) => {
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
    if (typeof x === 'number' || typeof x === 'bigint') {
        return APP(n, x);
    }
    if (typeof x === 'function') {
        return APPS(l, x.nameNat, x.length, x.body);
    }
    if (typeof x === 'string') {
        return APPS(p, PINS[x]);
    }
    if (!Array.isArray(x.lazy)) {
        throw new Error(
            `force didnt work? shouldnt return a lazy with a non-app`,
        );
    }
    return APPS(a, x.lazy[0], x.lazy[1]);
};

const asLaw = (f: Function, name: bigint, body: Value): Law => {
    const l: Law = f as any;
    l.nameNat = name;
    l.body = body;
    return l;
};

const $plus1 = (a: Value, b: Value, c: Value) => APP('INC', APPS(a, b, c));
PINS['$plus1'] = asLaw($plus1, asciiToNat('$plus1'), 0);
function $plus(this: Law, a: Value, b: Value) {
    return APPS('NCASE', b, APPS('$plus1', this, b), a);
}
PINS['$plus'] = asLaw($plus, asciiToNat('$plus'), 0);

console.log(show(force(APPS('$plus', 2, 10))));

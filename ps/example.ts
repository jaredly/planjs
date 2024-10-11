/*
P {hash: string, contents: Value}
L function.{nameNat, length, body}
A [target, arg, arg, arg]
N number | bigint

*/

import { natToAscii } from '../runtime/natToAscii';

type Law = Function & { nameNat: bigint; body: Value };
// string is a pin
type Immediate = Law | number | bigint | string;
type Lazy = { lazy: Immediate | [Value, Value]; forced: boolean };
type Value = Immediate | Lazy;

const PINS: Record<string, Value> = {};

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

const resolve = (v: Value, args: Value[]): Value | [Value, Value[]] => {
    if (typeof v === 'function') {
        if (v.length === args.length) {
            return v.apply(v, args);
        }
        if (v.length < args.length) {
            const inner = v.apply(v, args.slice(0, v.length));
            return resolve(inner, args.slice(v.length));
        }
        return [v, args];
    }
    if (typeof v === 'object' && !v.forced && Array.isArray(v.lazy)) {
    }
    // if (typeof v === 'object')
};

const force = (v: Value) => {
    if (typeof v !== 'object' || v.forced || !Array.isArray(v.lazy)) {
        return;
    }
    v.forced = true;

    const [head, tail] = v.lazy;

    force(head);

    const inner = typeof head === 'object';
    // let all = v.lazy.flat(100000);
    // while (
    //     typeof all[0] === 'function' &&
    //     all[0].length <= all.length - 1
    // ) {
    //     const target = all.shift()! as Law;
    //     const result: Value = target.apply(
    //         target,
    //         all.slice(0, target.length),
    //     );
    //     all = all.slice(target.length);
    //     if (!all.length) {
    //         v.lazy = force(result);
    //         while (typeof v.lazy === 'object' && 'lazy' in v.lazy) {
    //             v.lazy = v.lazy.lazy;
    //         }
    //         return;
    //     }
    //     all.unshift(result);
    //     v.lazy = all;
    // }
};

const INC = (v: Value) => {
    force(v);
    const inner = typeof v === 'object' ? v.lazy : v;
    if (typeof inner === 'number') {
        if (inner < Number.MAX_SAFE_INTEGER - 1) {
            return inner + 1;
        }
        return BigInt(inner) + 1n;
    }
    if (typeof inner === 'bigint') {
        return inner + 1n;
    }
    return 1;
};

const PIN = (v: Value) => {
    // TODO: hash
    return { hash: 'lolno', contents: v };
};

const LAW = (name: bigint, arity: number, body: Value): Value => {
    // TODO compile
    const f = () => {
        throw new Error('oof');
    };
    f.length = arity;
    f.body = body;
    f.nameNat = name;
    f.name = natToAscii(name);
    return f;
};

const NCASE = (zero: Value, plus: Value, x: Value) => {
    x = force(x);
    if (
        x === 0 ||
        x === 0n ||
        (typeof x !== 'number' && typeof x !== 'bigint')
    ) {
        return zero;
    }
    if (typeof x === 'number') {
        return [plus, x - 1];
    } else {
        return [plus, x - 1n];
    }
};

const PCASE = (p: Value, l: Value, a: Value, n: Value, x: Value) => {
    if (typeof x === 'number' || typeof x === 'bigint') {
        return typeof n === 'function' && n.length === 1 ? n(x) : [n, x];
    }
    if (typeof x === 'function') {
        return typeof l === 'function' && l.length === 3
            ? l(x.nameNat, x.length, x.body)
            : [l, x.nameNat, x.length, x.body];
    }
    if (Array.isArray(x)) {
        const f = x.length === 2 ? x[0] : x.slice(0, -1);
        const g = x[x.length - 1];
        return typeof a === 'function' && a.length === 2 ? a(f, g) : [a, f, g];
    }
    return typeof p === 'function' && p.length === 1
        ? p(x.contents)
        : [p, x.contents];
};

const $plus1 = (a: Value, b: Value, c: Value) =>
    INC(typeof a === 'function' && a.length === 2 ? a(b, c) : [a, b, c]);

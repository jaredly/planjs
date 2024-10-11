/*
P {hash: string, contents: Value}
L function.{nameNat, length, body}
A [target, arg, arg, arg]
N number | bigint

*/

import { natToAscii } from '../runtime/natToAscii';

type Law = Function & { nameNat: bigint; body: Value };
type Value =
    | number
    | bigint
    | Array<Value>
    | Law
    | { hash: string; contents: Value };

const INC = (v: Value) => {
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
    if (
        x === 0 ||
        x === 0n ||
        (typeof x !== 'number' && typeof x !== 'bigint')
    ) {
        return zero;
    }
    if (typeof x === 'number') {
        return typeof plus === 'function' && plus.length === 1
            ? plus(x - 1)
            : [plus, x - 1];
    } else {
        return typeof plus === 'function' && plus.length === 1
            ? plus(x - 1n)
            : [plus, x - 1n];
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

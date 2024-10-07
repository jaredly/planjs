// based on `plank`
// https://github.com/operating-function/pallas/blob/master/plank/plan.c
//

export {};
type tPIN = 0;
type tLAW = 1;
type tAPP = 2;
type tNAT = 3;
type tHOL = 4;
type nat = number;
type Val =
    | [tPIN, Val]
    | [tLAW, nat, nat, Val]
    | [tAPP, Val, Val]
    | [tNAT, nat]
    | [tHOL, Val | null];

const PIN: tPIN = 0;
const LAW: tLAW = 1;
const APP: tAPP = 2;
const NAT: tNAT = 3;
const HOL: tHOL = 4;

const OPS = {
    PIN: 0,
    LAW: 1,
    INC: 2,
    NCASE: 3,
    PCASE: 4,
} as const;

type OPCODE = (typeof OPS)[keyof typeof OPS];
const opArity: Record<OPCODE, number> = {
    [OPS.PIN]: 1,
    [OPS.LAW]: 3,
    [OPS.INC]: 1,
    [OPS.NCASE]: 3,
    [OPS.PCASE]: 5,
};

const dig = (v: Val) => {
    while (v[0] === HOL) {
        if (v[1] == null) throw new Error(`empty hol`);
        v = v[1];
    }
    return v;
};

/** AHA: THIS IS: lookup nth value from environment
 *
 * Something like "getNthArgFromEnd"
 *
 * f: ends up being a default value, if we don't get `n` to `0`
 *    before we run out of `APP`s
 * e: the value we're digging into
 * n: the amount we still have to dig.
 *
 * the environment is defined as a series of APPs. because why not.
 *
 * 0, APP(f, *)
 * 0, *
 * 1, APP(APP(f, *), g)
 * 1, APP(*        , g)
 * 2, APP(APP(APP(f, *), g), h)
 * 2, APP(APP(*        , g), h)
 *
 * >0, [not app] -> "fallback"
 */

const I = (fallback: Val, env: Val, idx: number): Val => {
    env = dig(env);
    if (idx === 0) {
        return env[0] === APP ? env[2] : env;
    }
    return env[0] === APP ? I(fallback, env[1], idx - 1) : fallback;
};

/** Arity determination
 *
 * Pin: recurse
 * Law: has a declared arity
 * App: one less than the arity of the applied function
 *      > if the function cannot be applied, it probably ought to error
 * Nat: if it's an opcode, then the arity of the primop. otherwise *should* be 0
 */
const A = (o: Val): number => {
    o = dig(o);
    switch (o[0]) {
        case PIN:
            // TODO haskell is different
            // it only allows opcode nats that are pinned.
            return A(o[1]);
        case LAW:
            return o[2];
        case APP: {
            const head = A(o[1]);
            return head === 0 ? 0 : head - 1;
        }
        case NAT: {
            return opArity[o[1] as 0] ?? 0;
        }
    }
};

// asNat
const N = (o: Val) => {
    o = dig(o);
    const norm = E(o);
    if (norm[0] === NAT) return norm[1];
    throw new Error(`not a nat`);
};

// Let
const L = (envSize: number, env: Val, value: Val, body: Val): Val => {
    const x: Val = [HOL, null];
    const env_: Val = [APP, env, x];
    x[1] = R(envSize + 1, env_, value);
    return R(envSize + 1, env_, body);
};

// Run a Law
const R = (envSize: number, env: Val, body: Val): Val => {
    body = dig(body);
    if (body[0] === NAT && body[1] <= envSize) {
        return I(body, env, envSize - body[1]);
    }
    if (body[0] === APP) {
        const f = dig(body[1]);
        const g = dig(body[2]);
        // APP(f,                     g)
        // APP(APP(f_inner, g_inner), g)
        if (f[0] === APP) {
            const f_inner = dig(f[1]);
            const g_inner = dig(f[2]);
            if (f_inner[0] === NAT) {
                // (f x)
                if (f_inner[1] === 0) {
                    const f = g_inner;
                    const x = g;
                    return [APP, R(envSize, env, f), R(envSize, env, x)];
                }
                // (let v in b)
                if (f_inner[1] === 1) {
                    const v = g_inner;
                    const b = g;
                    return L(envSize, env, v, b);
                }
            }
        }
        if (f[0] === NAT && f[1] === 2) {
            return g;
        }
    }

    return body;
};

const APPS = (target: Val, ...args: Val[]): Val => {
    while (args.length) {
        target = [APP, target, args.shift()!];
    }
    return target;
};

// normalize...
const F = (o: Val): Val => {
    o = dig(E(o));
    return o[0] === APP ? [APP, F(o[1]), F(o[2])] : o;
};

const E = (o: Val): Val => {
    o = dig(o);
    switch (o[0]) {
        case PIN:
            return E(o[1]);
        case LAW:
            if (o[2] !== 0) return o;
            const b = o[3];
            o = [HOL, null];
            return E(R(0, o, b));
        case APP:
            o = [APP, E(o[1]), o[2]];
            return E(A(o[1]) === 1 ? X(o, o) : o);
        case NAT:
            return o;
    }
};

const OP_PIN = (x: Val): Val => [PIN, F(x)];

const OP_LAW = (n: Val, a: Val, b: Val): Val => [LAW, N(n), N(a), F(b)];

const OP_INC = (n: Val): Val => [NAT, N(n) + 1];

const OP_NCASE = (z: Val, p: Val, x: Val): Val => {
    const n = N(x);
    return n === 0 ? z : APPS(p, [NAT, n - 1]);
};

const OP_PCASE = (p: Val, l: Val, a: Val, n: Val, x: Val): Val => {
    x = dig(x);
    switch (x[0]) {
        case PIN:
            return APPS(p, x[1]);
        case LAW:
            return APPS(l, [NAT, x[1]], [NAT, x[2]], x[3]);
        case APP:
            return APPS(a, x[1], x[2]);
        case NAT:
            return APPS(n, x);
    }
};

const OP_FNS = {
    [OPS.PIN]: OP_PIN,
    [OPS.LAW]: OP_LAW,
    [OPS.INC]: OP_INC,
    [OPS.NCASE]: OP_NCASE,
    [OPS.PCASE]: OP_PCASE,
};

const appArgs = (val: Val): Val[] => {
    val = dig(val);
    // TODO dig val[2]?
    return val[0] === APP ? [...appArgs(val[1]), val[2]] : [val];
};

// eXecute(?)
const X = (target: Val, environment: Val): Val => {
    target = dig(target);
    switch (target[0]) {
        case PIN:
            return X(target[1], environment);
        case LAW: {
            const [_, __, a, b] = target;
            return R(a, environment, b);
        }
        case APP:
            return X(target[1], environment);
        case NAT: {
            const args = appArgs(environment);
            if (target[1] in OP_FNS) {
                const f = OP_FNS[target[1] as OPCODE];
                if (args.length !== f.length + 1) {
                    throw new Error(
                        `wrong number of args for op ${target[1]}: expected ${
                            f.length + 1
                        }, found ${args.length}`,
                    );
                }
                return f(...(args as [Val, Val, Val, Val, Val]));
            }
            throw new Error(`unknown opcode: ${target[1]}`);
        }
    }
};

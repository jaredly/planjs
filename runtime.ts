// based on `plank`
// https://github.com/operating-function/pallas/blob/master/plank/plan.c
//

import ansis from 'ansis';

type tPIN = 0;
type tLAW = 1;
type tAPP = 2;
type tNAT = 3;
type tREF = 4;
type nat = bigint;
// immadiate (not lazy)
type IVal =
    | [tPIN, Val]
    | [tLAW, nat, nat, Val]
    | [tAPP, Val, Val]
    | [tNAT, nat];
export type Val = IVal | [tREF, Val[], bigint];

export const PIN: tPIN = 0;
export const LAW: tLAW = 1;
export const APP: tAPP = 2;
export const NAT: tNAT = 3;
const REF: tREF = 4;

const colors = [
    ansis.red,
    ansis.gray,
    ansis.green,
    ansis.blue,
    ansis.yellow,
    ansis.magenta,
];

export { F as Force };
export { show as showVal };

export const asciiToNat = (name: string) => {
    let nat = 0n;
    for (let i = 0; i < name.length; i++) {
        nat <<= 8n;
        nat |= BigInt(name.charCodeAt(i));
    }
    return nat;
};

export const natToAscii = (nat: bigint) => {
    if (nat == 0n) {
        return '';
    }
    if (nat == null) {
        return '??NULL??';
    }
    // console.log(JSON.stringify(Number(nat)) ?? 'undefined');
    let res = '';
    const mask = (1n << 8n) - 1n;
    for (let i = 0; i < 8; i += 1) {
        const n = Number(nat & mask);
        if (n === 0) break;
        res += String.fromCharCode(n);
        nat >>= 8n;
    }
    return res;
};

export const show = (v: Val, trace: Val[] = []): string => {
    if (trace.includes(v)) {
        const at = trace.indexOf(v);
        return `<recurse ^${trace.length - at}>`;
    }
    trace = [...trace, v];
    const c = colors[trace.length % colors.length];

    switch (v[0]) {
        case PIN:
            return c(`<${show(v[1], trace)}>`);
        case LAW: {
            // const args = [];
            // for (let i = 0; i < v[2]; i++) {
            //     args.push(`$${i + 1}`);
            // }
            // return c(
            //     `fn ${natToAscii(v[1])} (${args.join(', ')}) ${show(
            //         v[3],
            //         trace,
            //     )}}`,
            // );
            return c(
                `{${natToAscii(v[1]) || '_'} ${v[2]} ${show(v[3], trace)}}`,
            );
        }
        case APP:
            return c(
                `(${appArgs(v)
                    .map((m) => show(m, trace))
                    .join(' ')})`,
            );
        case NAT:
            return `${v[1]}`;
        case REF:
            return `[${v[1]
                .map((m, i) => `${ansis.red(i + '')}=${show(m, trace)}`)
                .join(', ')}][${v[2]}]`;
    }
};

export const OPS = {
    LAW: 0,
    PCASE: 1,
    NCASE: 2,
    INC: 3,
    PIN: 4,
} as const;

export const OPNAMES: Record<number, string> = {};
Object.entries(OPS).forEach(([name, val]) => (OPNAMES[val] = name));

export type OPCODE = (typeof OPS)[keyof typeof OPS];
const opArity: Record<OPCODE, number> = {
    [OPS.PIN]: 1,
    [OPS.LAW]: 3,
    [OPS.INC]: 1,
    [OPS.NCASE]: 3,
    [OPS.PCASE]: 5,
};

export const REQUIRE_OP_PIN = false;

export let LOG = false;

/** Arity determination
 *
 * Pin: recurse
 * Law: has a declared arity
 * App: one less than the arity of the applied function
 *      > if the function cannot be applied, it probably ought to error
 * Nat: if it's an opcode, then the arity of the primop. otherwise *should* be 0
 */
const A = (o: IVal): number => {
    switch (o[0]) {
        case PIN:
            const p = o[1];
            if (p[0] === NAT) {
                return (p[1] <= 5 ? opArity[Number(p[1]) as 0] : 0) ?? 1;
            }
            return A(E(o[1]));
        case LAW:
            return Number(o[2]);
        case APP: {
            // NOTE: is this good here?
            const head = A(E(o[1]));
            return head === 0 ? 0 : head - 1;
        }
        case NAT: {
            if (REQUIRE_OP_PIN) {
                return 0;
            }
            return opArity[Number(o[1]) as 0] ?? 0;
            // return 0; // opArity[o[1] as 0] ?? 0;
        }
    }
};

// asNat
const N = (o: Val): bigint => {
    const norm = E(o);
    if (norm[0] === NAT) return norm[1];
    return 0n;
    // throw new Error(`not a nat`);
};

// Let
const L = (env: Val[], value: Val, body: Val): Val => {
    const x = R(env, value);
    if (LOG) console.log(`LET ${ansis.red(env.length + '')} = ${show(x)}`);
    env.push(x);
    return R(env, body);
};

// Run a Law
const R = (env: Val[], body: Val): Val => {
    if (body[0] === NAT) {
        return [REF, env, body[1]];
    }
    if (body[0] === APP) {
        const f = F(body[1]);
        const g = F(body[2]);
        // APP(f,                     g)
        // APP(APP(f_inner, g_inner), g)
        if (f[0] === APP) {
            const f_inner = F(f[1]);
            const g_inner = F(f[2]);
            if (f_inner[0] === NAT) {
                // (f x)
                if (f_inner[1] === 0n) {
                    const f = g_inner;
                    const x = g;
                    return [APP, R(env, f), R(env, x)];
                }
                // (let v in b)
                if (f_inner[1] === 1n) {
                    const v = g_inner;
                    const b = g;
                    return L(env, v, b);
                }
            }
        }
        if (f[0] === NAT && f[1] === 2n) {
            return g;
        }
    }

    return body;
};

export type Input = Val | number;
export const asVal = (v: Input): Val =>
    typeof v === 'number' ? [NAT, BigInt(v)] : v;

export const APPS = (target: Input, ...args: Input[]): Val => {
    target = asVal(target);
    while (args.length) {
        target = [APP, target, asVal(args.shift()!)];
    }
    return target;
};

// force (unlazy recursively)
const F = (o: Val): Val => {
    o = E(o);
    return o[0] === APP ? [APP, F(o[1]), F(o[2])] : o;
};

const E = (o: Val): IVal => {
    if (LOG) console.log(`E`, show(o));
    switch (o[0]) {
        case REF: {
            const env = o[1];
            if (o[2] >= env.length) {
                if (LOG)
                    console.log(`idx out of bound ${o[2]} - env ${env.length}`);
                return [NAT, o[2]];
            }
            if (LOG)
                console.log(
                    `getting idx ${o[2]} from env ${env
                        .map((n, i) => `$${ansis.red(i + '')}=${show(n)}`)
                        .join(', ')}`,
                );
            return E(env[Number(o[2])]);
        }
        case PIN:
            return o;
        case LAW:
            if (o[2] !== 0n) return o;
            const b = o[3];
            const env: Val[] = [];
            const res = R(env, b);
            env.push(res);
            return E(res);
        case APP:
            const target = E(o[1]);
            o = [APP, target, o[2]];
            const items = appArgs(target);
            items.push(o[2]);
            return A(target) === 1 ? E(X(o, items)) : o;
        case NAT:
            return o;
    }
};

const OP_PIN = (x: Val): Val => (
    LOG && console.log('PIN', show(x)), [PIN, F(x)]
);

const OP_LAW = (n: Val, a: Val, b: Val): Val => [LAW, N(n), N(a), F(b)];

const OP_INC = (n: Val): Val => [NAT, N(n) + 1n];

const OP_NCASE = (z: Val, p: Val, x: Val): Val => {
    const n = N(x);
    return n === 0n ? z : APPS(p, [NAT, n - 1n]);
};

const OP_PCASE = (p: Val, l: Val, a: Val, n: Val, x: Val): Val => {
    x = E(x);
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

// turn a nested APP(APP(APP(a,b),c),d) into [a,b,c,d]
const appArgs = (val: Val): Val[] => {
    if (val[0] === PIN && val[1][0] === APP) return appArgs(val[1]);
    return val[0] === APP ? [...appArgs(val[1]), val[2]] : [val];
};

// get the "root" of a nested APP
const first = (val: Val): Val => {
    if (val[0] === APP || (val[0] === PIN && val[1][0] === APP))
        return first(val[1]);
    return val;
};

// eXecute(?)
const X = (target: Val, environment: Val[]): Val => {
    if (LOG)
        console.log(
            `X`,
            show(target),
            environment.map((m) => show(m)),
        );
    switch (target[0]) {
        case PIN:
            const inner = target[1];
            if (inner[0] === NAT) {
                const f = OP_FNS[Number(inner[1]) as OPCODE];
                const args = environment.slice(1);
                if (args.length !== f.length) {
                    return target;
                }
                return f(...(args as [Val, Val, Val, Val, Val]));
            }
            return X(E(target[1]), environment);
        case NAT: {
            if (REQUIRE_OP_PIN) {
                return target;
            }
            const f = OP_FNS[Number(target[1]) as OPCODE];
            if (!f) {
                return target;
            }
            const args = environment.slice(1);
            if (args.length !== f.length) {
                return target;
            }
            return f(...(args as [Val, Val, Val, Val, Val]));
        }
        case LAW: {
            const [_, __, a, b] = target;
            return R(environment, b);
        }
        case APP: {
            return X(first(target[1]), environment);
        }
    }
    return target;
};

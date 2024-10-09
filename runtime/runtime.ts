// based on `plank`
// https://github.com/operating-function/pallas/blob/master/plank/plan.c
//

import ansis from 'ansis';
import {
    OPCODE,
    OPS,
    OPNAMES,
    Val,
    PIN,
    LAW,
    APP,
    NAT,
    REF,
    IVal,
    opArity,
} from './types';
import { perf } from './perf';

/*

pin (pointer)
law (name [debug]) (arity number) (pointer body)
app (pointer) (pointer)
nat (numbre)

are pointers and numbers interchangeable?
is it ~faster to allocate a little more,
and have the pointers always be in the same places?

like

0 : tag
1 : pointer : pin|law|app
2 : number  : law|nat
3 : pointer : app
4 : number  : name

OR

0 : tag
1 : pointer (pin|app) or number (law|nat)
2 : pointer (app) or number (law)
3 : number (law name)

and therefore
we could pack a linked list in there

0 : 5 (env head)
1 : number : size
2 : head (pointer to element)
3 : tail (pointer to next head)

0 : 6 (env tail)
1 : head1 (pointer to element)
2 : head2 (pointer to element)
3 : tail (pointer to next head)



....

question though.
when writing a garbage collector.
howw do I know what is "live"?
like how do I keep track of the stack.
I guessss I could have like a separate
reference-counting thing for stack variables
or something.

.....

WAIT I could like ... have the root, live at
like position 0? always?
and then we could know.








*/

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

export const asciiToNat = (name: string): bigint => {
    let nat = 0n;
    for (let i = name.length - 1; i >= 0; i--) {
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
    for (let i = 0; nat > 0; i += 1) {
        const n = Number(nat & mask);
        if (n === 0) break;
        res += String.fromCharCode(n);
        nat >>= 8n;
    }
    return res;
};

type Ctx = {
    hidePinLaw: boolean;
    trace: Val[];
};

export const show = (
    val: Val,
    ctx: Ctx = { hidePinLaw: false, trace: [] },
): string => {
    if (ctx.trace.includes(val)) {
        const at = ctx.trace.indexOf(val);
        return `<recurse ^${ctx.trace.length - at}>`;
    }
    ctx = { ...ctx, trace: [...ctx.trace, val] };
    // ctx = [...ctx, v];
    const c = colors[ctx.trace.length % colors.length];
    const { v } = val;

    switch (v[0]) {
        case PIN:
            if (ctx.hidePinLaw && v[1].v[0] === LAW) {
                return c(`<law>`);
            }
            return c(`<${show(v[1], ctx)}>`);
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
            return c(`{${natToAscii(v[1]) || '_'} ${v[2]} ${show(v[3], ctx)}}`);
        }
        case APP:
            // return c(`(${show(v[1], ctx)} ${show(v[2], ctx)})`);
            return c(
                `(${appArgs(val)
                    .map((m) => show(m, ctx))
                    .join(' ')})`,
            );
        case NAT:
            return `${v[1]}`;
        case REF:
            return `[${v[1]
                .map((m, i) => `${ansis.red(i + '')}=${show(m, ctx)}`)
                .join(', ')}][${v[2]}]`;
    }
};

export let REQUIRE_OP_PIN = true;
export const setRequireOpPin = (yes: boolean) => {
    REQUIRE_OP_PIN = yes;
};

export let LOG = false;

/** Arity determination
 *
 * Pin: recurse
 * Law: has a declared arity
 * App: one less than the arity of the applied function
 *      > if the function cannot be applied, it probably ought to error
 * Nat: if it's an opcode, then the arity of the primop. otherwise *should* be 0
 */
const A = ({ v }: IVal): number => {
    switch (v[0]) {
        case PIN:
            const p = v[1];
            if (p.v[0] === NAT) {
                return (p.v[1] <= 5 ? opArity[Number(p.v[1]) as 0] : 0) ?? 1;
            }
            return A(E(v[1]));
        case LAW:
            return Number(v[2]);
        case APP: {
            // NOTE: is this good here?
            const head = A(E(v[1]));
            return head === 0 ? 0 : head - 1;
        }
        case NAT: {
            if (REQUIRE_OP_PIN) {
                return 0;
            }
            return opArity[Number(v[1]) as 0] ?? 0;
            // return 0; // opArity[o[1] as 0] ?? 0;
        }
    }
};

// asNat
const N = (o: Val): bigint => {
    const { v: norm } = E(o);
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
    if (body.v[0] === NAT) {
        return { v: [REF, env, body.v[1]] };
    }
    if (body.v[0] === APP) {
        const f = F(body.v[1]);
        const g = F(body.v[2]);
        // APP(f,                     g)
        // APP(APP(f_inner, g_inner), g)
        if (f.v[0] === APP) {
            const f_inner = F(f.v[1]);
            const g_inner = F(f.v[2]);
            if (f_inner.v[0] === NAT) {
                // (f x)
                if (f_inner.v[1] === 0n) {
                    const f = g_inner;
                    const x = g;
                    return { v: [APP, R(env, f), R(env, x)] };
                }
                // (let v in b)
                if (f_inner.v[1] === 1n) {
                    const v = g_inner;
                    const b = g;
                    return L(env, v, b);
                }
            }
        }
        if (f.v[0] === NAT && f.v[1] === 2n) {
            return g;
        }
    }

    return body;
};

export type Input = Val | number;
export const asVal = (v: Input): Val =>
    typeof v === 'number' ? { v: [NAT, BigInt(v)] } : v;

export const APPS = (target: Input, ...args: Input[]): Val => {
    target = asVal(target);
    while (args.length) {
        target = { v: [APP, target, asVal(args.shift()!)] };
    }
    return target;
};

// force (unlazy recursively)
const F = (o: Val): Val => {
    o = E(o);
    return o.v[0] === APP ? { v: [APP, F(o.v[1]), F(o.v[2])] } : o;
};

const E = (o: Val): IVal => {
    if (LOG) console.log(`E`, show(o));
    switch (o.v[0]) {
        case REF: {
            const env = o.v[1];
            if (o.v[2] >= env.length) {
                if (LOG)
                    console.log(
                        `idx out of bound ${o.v[2]} - env ${env.length}`,
                    );
                return { v: [NAT, o.v[2]] };
            }
            if (LOG)
                console.log(
                    `getting idx ${o.v[2]} from env ${env
                        .map((n, i) => `$${ansis.red(i + '')}=${show(n)}`)
                        .join(', ')}`,
                );
            const idx = Number(o.v[2]);
            return E(env[idx]);
        }
        case PIN:
            return o as IVal;
        case LAW:
            // return o as IVal;
            if (o.v[2] !== 0n) return o as IVal;
            const b = o.v[3];
            const env: Val[] = [{ v: [NAT, 0n] }];
            const res = R(env, b);
            env[0] = res;
            return E(res);
        case APP:
            o.v[1] = E(o.v[1]);
            if (A(o.v[1] as IVal) === 1) {
                o.v = X(o, o).v;
                return E(o);
            }
            return o as IVal;
        case NAT:
            return o as IVal;
    }
};

const OP_PIN = (x: Val): Val => (
    LOG && console.log('PIN', show(x)), { v: [PIN, F(x)] }
);

const OP_LAW = (n: Val, a: Val, b: Val): Val => ({
    v: [LAW, N(n), N(a), F(b)],
});

const OP_INC = (n: Val): Val => ({ v: [NAT, N(n) + 1n] });

const OP_NCASE = (z: Val, p: Val, x: Val): Val => {
    const n = N(x);
    return n === 0n ? z : APPS(p, { v: [NAT, n - 1n] });
};

const OP_PCASE = (p: Val, l: Val, a: Val, n: Val, x: Val): Val => {
    x = E(x);
    switch (x.v[0]) {
        case PIN:
            return APPS(p, x.v[1]);
        case LAW:
            return APPS(l, { v: [NAT, x.v[1]] }, { v: [NAT, x.v[2]] }, x.v[3]);
        case APP:
            return APPS(a, x.v[1], x.v[2]);
        case NAT:
            return APPS(n, x);
    }
    throw new Error('unreadachble?');
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
    if (val.v[0] === PIN && val.v[1].v[0] === APP) return appArgs(val.v[1]);
    return val.v[0] === APP ? [...appArgs(val.v[1]), val.v[2]] : [val];
};

// get the "root" of a nested APP
const first = (val: Val): Val => {
    if (val.v[0] === APP || (val.v[0] === PIN && val.v[1].v[0] === APP))
        return first(val.v[1]);
    return val;
};

// eXecute(?)
const X = (target: Val, environment: Val): Val => {
    if (LOG)
        console.log(
            `X`,
            show(target),
            appArgs(environment).map((m) => show(m)),
        );
    switch (target.v[0]) {
        case PIN:
            const inner = target.v[1];
            if (inner.v[0] === NAT) {
                const code = Number(inner.v[1]) as OPCODE;
                const f = OP_FNS[code];
                if (!f) return target;
                const args = appArgs(environment).slice(1);
                if (args.length !== f.length) {
                    return target;
                }
                if (perf != null) perf.ops[code]++;
                return f(...(args as [Val, Val, Val, Val, Val]));
            }
            return X(E(target.v[1]), environment);
        case NAT: {
            if (REQUIRE_OP_PIN) {
                return target;
            }
            const code = Number(target.v[1]) as OPCODE;
            const f = OP_FNS[code];
            if (!f) {
                return target;
            }
            const args = appArgs(environment).slice(1);
            if (args.length !== f.length) {
                return target;
            }
            if (perf != null) perf.ops[code]++;
            return f(...(args as [Val, Val, Val, Val, Val]));
        }
        case LAW: {
            const [_, name, arity, b] = target.v;
            const args = appArgs(environment);
            if (perf) {
                const nm = natToAscii(name);
                if (!perf.laws[nm]) perf.laws[nm] = 1;
                else {
                    perf.laws[nm]++;
                }
            }
            // JET
            if (
                (name === _plus || name === _add) &&
                arity === 2n &&
                args.length === 3
            ) {
                const a = E(args[1]);
                const b = E(args[2]);
                return { v: [NAT, N(a) + N(b)] };
            }
            return R(args, b);
        }
        case APP: {
            return X(first(target.v[1]), environment);
        }
    }
    return target;
};

const _plus = asciiToNat('+');
const _add = asciiToNat('_Add');

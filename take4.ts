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
    | [tHOL, Val[], Val];

const PIN: tPIN = 0;
const LAW: tLAW = 1;
const APP: tAPP = 2;
const NAT: tNAT = 3;
// const HOL: tHOL = 4;

const show = (v: Val): string => {
    switch (v[0]) {
        case PIN:
            return `<${show(v[1])}>`;
        case LAW:
            return `{${v[1]} ${v[2]} ${show(v[3])}}`;
        case APP:
            return `(${appArgs(v).map(show).join(' ')})`;
        case NAT:
            return `${v[1]}@`;
        // case HOL:
        //     return
        // return `[${v[1] === null ? 'null' : show(v[1])}]`;
    }
};

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
    // while (v[0] === HOL) {
    //     if (v[1] == null) throw new Error(`empty hol`);
    //     v = v[1];
    // }
    return v;
};

let LOG = false;

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

const I = (fallback: Val, env: Val[], idx: number): Val => {
    if (LOG) console.log(`get the ${idx}th from ${env.map(show).join(', ')}`);
    if (idx < env.length) {
        return env[Math.max(0, env.length - 1 - idx)];
    }
    return fallback;
    // env = dig(env);
    // if (idx === 0) {
    //     return env[0] === APP ? env[2] : env;
    // }
    // return env[0] === APP ? I(fallback, env[1], idx - 1) : fallback;
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
            const p = dig(o[1]);
            if (p[0] === NAT) {
                return opArity[p[1] as 0] ?? 1;
            }
            return A(o[1]);
        case LAW:
            return o[2];
        case APP: {
            const head = A(o[1]);
            return head === 0 ? 0 : head - 1;
        }
        case NAT: {
            return 0; // opArity[o[1] as 0] ?? 0;
        }
    }
};

// asNat
const N = (o: Val) => {
    o = dig(o);
    const norm = E(o);
    if (norm[0] === NAT) return norm[1];
    return 0;
    // throw new Error(`not a nat`);
};

// Let
const L = (env: Val[], value: Val, body: Val): Val => {
    const x = R(env, value);
    env.unshift(x);
    return R(env, body);
};

// Run a Law
const R = (env: Val[], body: Val): Val => {
    body = dig(body);
    if (body[0] === NAT && body[1] <= env.length) {
        return I(body, env, env.length - body[1] - 1); // might need another -1?
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
                    return [APP, R(env, f), R(env, x)];
                }
                // (let v in b)
                if (f_inner[1] === 1) {
                    const v = g_inner;
                    const b = g;
                    return L(env, v, b);
                }
            }
        }
        if (f[0] === NAT && f[1] === 2) {
            return g;
        }
    }

    return body;
};

type Input = Val | number;
const asVal = (v: Input): Val => (typeof v === 'number' ? [NAT, v] : v);

const APPS = (target: Input, ...args: Input[]): Val => {
    target = asVal(target);
    while (args.length) {
        target = [APP, target, asVal(args.shift()!)];
    }
    return target;
};

// normalize... oh (force?)
const F = (o: Val): Val => {
    o = dig(E(o));
    return o[0] === APP ? [APP, F(o[1]), F(o[2])] : o;
};

const E = (o: Val): Val => {
    if (LOG) console.log(`E`, show(o));
    o = dig(o);
    switch (o[0]) {
        case PIN:
            return o;
        case LAW:
            if (o[2] !== 0) return o;
            const b = o[3];
            const env: Val[] = [];
            const res = R(env, b);
            env.unshift(res);
            return E(res);
        case APP:
            o = [APP, E(o[1]), o[2]];
            // if (A(o[1]) === 1) {
            //     if (o[1][0] === PIN && o[1][1][0] === LAW) {
            //     }
            // }
            const items = appArgs(E(o[1]));
            items.push(o[2]);
            return A(o[1]) === 1 ? E(X(o, items)) : o;
        case NAT:
            return o;
    }
};

const OP_PIN = (x: Val): Val => (
    LOG && console.log('PIN', show(x)), [PIN, F(x)]
);

const OP_LAW = (n: Val, a: Val, b: Val): Val => [LAW, N(n), N(a), F(b)];

const OP_INC = (n: Val): Val => [NAT, N(n) + 1];

const OP_NCASE = (z: Val, p: Val, x: Val): Val => {
    const n = N(x);
    return n === 0 ? z : APPS(p, [NAT, n - 1]);
};

const OP_PCASE = (p: Val, l: Val, a: Val, n: Val, x: Val): Val => {
    x = dig(E(x));
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
    // RSIKY??? idk what is up
    if (val[0] === PIN && val[1][0] === APP) return appArgs(val[1]);
    // TODO dig val[2]?
    return val[0] === APP ? [...appArgs(val[1]), val[2]] : [val];
};

// eXecute(?)
const X = (target: Val, environment: Val[]): Val => {
    if (LOG) console.log(`X`, show(target), environment.map(show));
    target = dig(target);
    switch (target[0]) {
        case PIN:
            const inner = dig(target[1]);
            if (inner[0] === NAT) {
                const f = OP_FNS[inner[1] as OPCODE];
                const args = environment.slice(1);
                if (args.length !== f.length) {
                    // throw new Error(
                    //     `wrong number of args for op ${inner[1]}: expected ${f.length}, found ${args.length}`,
                    // );
                    return target;
                }
                return f(...(args as [Val, Val, Val, Val, Val]));
            }
            return X(target[1], environment);
        case LAW: {
            const [_, __, a, b] = target;
            return R(environment, b);
        }
        case APP: {
            const collapsed = appArgs(target[1]);
            return X(collapsed[0], environment);
        }
        case NAT: {
            // const args = appArgs(environment).slice(1);
            // if (target[1] in OP_FNS) {
            //     const f = OP_FNS[target[1] as OPCODE];
            //     if (args.length !== f.length) {
            //         throw new Error(
            //             `wrong number of args for op ${target[1]}: expected ${f.length}, found ${args.length}`,
            //         );
            //     }
            //     return f(...(args as [Val, Val, Val, Val, Val]));
            // }
            // throw new Error(`unknown opcode: ${target[1]}`);
            break;
        }
    }
    return target;
};

const chk = (msg: string, x: Val, y: Val) => {
    if (LOG) console.log(`expected`, show(x), `input`, show(y));
    // x = E(x);
    y = E(y);
    if (JSON.stringify(x) === JSON.stringify(y)) {
        console.log(`✅ ${msg}`);
        return;
    }
    console.log(`🚨 ${show(x)} != ${show(y)}`);
};

const mapp =
    (op: number | Val) =>
    (...args: (Val | number)[]) =>
        APPS(op, ...args);

const n = (n: number): Val => [NAT, n];
const inc = mapp([PIN, n(OPS.INC)]);
const law = mapp([PIN, n(OPS.LAW)]);
const pin = mapp([PIN, n(OPS.PIN)]);
const ncase = mapp([PIN, n(OPS.NCASE)]);
const pcase = mapp([PIN, n(OPS.PCASE)]);
const toNat = mapp(ncase(n(0), inc()));

const _ = APPS;

chk('nat', [NAT, 5], inc(4));

// LOG = true;
chk('law', [LAW, 1, 2, n(3)], law(1, 2, 3));
// process.exit(1);
chk('pin', [PIN, n(5)], pin(inc(4)));

chk('ncase', n(9), toNat(n(9)));
chk('ncase2', n(0), toNat(pin(n(9))));

chk('P___', APPS(1, 2), pcase(1, 0, 0, 0, pin(2)));
chk('_L__', APPS(1, 2, 3, 4), pcase(0, 1, 0, 0, law(2, 3, 4)));
chk('__A_', _(1, 2, 3), pcase(0, 0, 1, 0, _(2, 3)));
chk('___N', _(1, 2), pcase(0, 0, 0, 1, 2));

chk('basic law (self)', [LAW, 0, 2, n(0)], law(0, 2, 0, 7, 8));
chk('basic law (arg 1)', n(7), law(0, 2, 1, 7, 8));
chk('basic law (arg 2)', n(8), law(0, 2, 2, 7, 8));
chk('basic law (const)', n(3), law(0, 2, 3, 7, 8));

// (0, f, x) -> (f x)
// (1, v, b) -> (let v in b)
// (2, x)    -> x
const lapp = (f: Input, x: Input) => _(0, f, x);
const llet = (v: Input, b: Input) => _(1, v, b);
const lconst = (v: Input) => _(2, v);

chk('law dsl CONST', n(32), law(0, 1, lconst(32), 0));

const k = law(0, 2, 1);
const appHead = mapp(pcase(0, 0, k, 0));
chk('apphead', n(200), appHead(_(200, 3)));
chk('first of inf', n(100), appHead(law(99, 1, llet(lapp(1, 2), 2), 100)));

chk('pinlaw', [LAW, 1, 2, n(0)], pin(LAW, 1, 2, 0));
chk('pinlaw2', [LAW, 1, 2, n(0)], pin(law(1), 2, 0));
chk('pinlaw3', [PIN, [LAW, 1, 2, n(0)]], pin(law(1, 2, 0), 3, 4));
// HMMM is this supposed to collapse?
// chk('pinlaw4', [PIN, [LAW, 1, 2, n(0)]], pin(pin(law(1, 2, 0)), 3, 4));
chk('pinlaw4', [PIN, [PIN, [LAW, 1, 2, n(0)]]], pin(pin(law(1, 2, 0)), 3, 4));

chk('arg 1', n(9), law(0, 1, 1, 9));
chk('arg n stuff', n(8), law(0, 1, llet(1, 2), 8));

chk('a thing', n(7), law(0, 1, llet(3 /*2*/, llet(7 /*3*/, 2)), 9 /*1*/));

// LOG = true;

/*
    chk 7 ( law % 0 % 1 %  --  ? ($0 $1)
               (1 % 3 %    --  @ $2 = $3
               (1 % 7 %    --  @ $3 = 9
               2))         --  $2
           % 9)

    -- more complex example
    chk (1%(0%2))
             (law%0%1%           --   | ? ($0 $1)
               (1% (0%(2%0)%3)%  --     @ $2 = (0 $3)
               (1% (2%2)%        --     @ $3 = 2
                (0%1%2)))%       --     | ($1 $2)
             1)                  --   1

    -- trivial cycles are okay if not used.
    chk 7 ( (law % 0 % 1 %  --   | ? ($0 $1)
              (1% 7%        --     @ $2 = 7
              (1% 3%        --     @ $3 = $3
                            --     $2
               2))%         --   9
            9))

    -- length of array
    chk 9 (len % (0 % 1 % 2 % 3 % 4 % 5 % 6 % 7 % 8 % 9))

    -- head of closure
    chk 7   (headF % (7 % 1 % 2 % 3 % 4 % 5 % 6 % 7 % 8 % 9))
    chk law (headF % (law % 1 % 2))

    -- tag of ADT (head cast to nat)
    chk 7 (tag % (7 % 1 % 2 % 3 % 4 % 5 % 6 % 7 % 8 % 9))
    chk 0 (tag % (law % 1 % 2))

*/

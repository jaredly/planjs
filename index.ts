// based on `plank`
// https://github.com/operating-function/pallas/blob/master/plank/plan.c
//

import ansis from 'ansis';
import equal from 'fast-deep-equal';
export {};
type tPIN = 0;
type tLAW = 1;
type tAPP = 2;
type tNAT = 3;
type tREF = 4;
type nat = number;
// immadiate (not lazy)
type IVal =
    | [tPIN, Val]
    | [tLAW, nat, nat, Val]
    | [tAPP, Val, Val]
    | [tNAT, nat];
type Val = IVal | [tREF, Val[], number];

const PIN: tPIN = 0;
const LAW: tLAW = 1;
const APP: tAPP = 2;
const NAT: tNAT = 3;
const REF: tREF = 4;

const colors = [
    ansis.red,
    ansis.gray,
    ansis.green,
    ansis.blue,
    ansis.yellow,
    ansis.magenta,
];

const show = (v: Val, trace: Val[] = []): string => {
    if (trace.includes(v)) {
        const at = trace.indexOf(v);
        return `<recurse ^${trace.length - at}>`;
    }
    trace = [...trace, v];
    const c = colors[trace.length % colors.length];

    switch (v[0]) {
        case PIN:
            return c(`<${show(v[1], trace)}>`);
        case LAW:
            return c(`{${v[1]} ${v[2]} ${show(v[3], trace)}}`);
        case APP:
            return c(
                `(${appArgs(v)
                    .map((m) => show(m, trace))
                    .join(' ')})`,
            );
        case NAT:
            return `${v[1]}@`;
        case REF:
            return `[${v[1]
                .map((m, i) => `${ansis.red(i + '')}=${show(m, trace)}`)
                .join(', ')}][${v[2]}]`;
    }
};

const OPS = {
    LAW: 0,
    PCASE: 1,
    NCASE: 2,
    INC: 3,
    PIN: 4,
} as const;

type OPCODE = (typeof OPS)[keyof typeof OPS];
const opArity: Record<OPCODE, number> = {
    [OPS.PIN]: 1,
    [OPS.LAW]: 3,
    [OPS.INC]: 1,
    [OPS.NCASE]: 3,
    [OPS.PCASE]: 5,
};

let LOG = false;

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
                return opArity[p[1] as 0] ?? 1;
            }
            return A(E(o[1]));
        case LAW:
            return o[2];
        case APP: {
            // NOTE: is this good here?
            const head = A(E(o[1]));
            return head === 0 ? 0 : head - 1;
        }
        case NAT: {
            return 0; // opArity[o[1] as 0] ?? 0;
        }
    }
};

// asNat
const N = (o: Val) => {
    const norm = E(o);
    if (norm[0] === NAT) return norm[1];
    return 0;
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
            return E(env[o[2]]);
        }
        case PIN:
            return o;
        case LAW:
            if (o[2] !== 0) return o;
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

const OP_INC = (n: Val): Val => [NAT, N(n) + 1];

const OP_NCASE = (z: Val, p: Val, x: Val): Val => {
    const n = N(x);
    return n === 0 ? z : APPS(p, [NAT, n - 1]);
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
                const f = OP_FNS[inner[1] as OPCODE];
                const args = environment.slice(1);
                if (args.length !== f.length) {
                    return target;
                }
                return f(...(args as [Val, Val, Val, Val, Val]));
            }
            return X(E(target[1]), environment);
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

const chk = (msg: string, x: Val, y: Val) => {
    if (LOG) console.log(`expected`, show(x), `input`, show(y), msg);
    y = F(y);
    if (equal(x, y)) {
        console.log(`✅ ${msg}`);
        return;
    }
    console.log(`🚨 ${show(x)} != ${show(y)}`, msg);
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

chk('law', [LAW, 1, 2, n(3)], law(1, 2, 3));
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
const lapps = (...args: Input[]) => {
    let target = asVal(args.shift()!);
    while (args.length) {
        target = lapp(target, args.shift()!);
    }
    return target;
};
const llet = (v: Input, b: Input) => _(1, v, b);
const lconst = (v: Input) => _(2, v);

chk('law dsl CONST', n(32), law(0, 1, lconst(32), 0));

const k = law(0, 2, 1);
const appHead = mapp(pcase(0, 0, k, 0));
chk('apphead', n(200), appHead(_(200, 3)));
chk('first of inf', n(100), appHead(law(99, 1, llet(lapp(1, 2), 2), 100)));

chk('pinlaw', [LAW, 1, 2, n(0)], pin(law(), 1, 2, 0));
chk('pinlaw2', [LAW, 1, 2, n(0)], pin(law(1), 2, 0));
chk('pinlaw3', [PIN, [LAW, 1, 2, n(0)]], pin(law(1, 2, 0), 3, 4));
// HMMM is this supposed to collapse?
// chk('pinlaw4', [PIN, [LAW, 1, 2, n(0)]], pin(pin(law(1, 2, 0)), 3, 4));
chk('pinlaw4', [PIN, [PIN, [LAW, 1, 2, n(0)]]], pin(pin(law(1, 2, 0)), 3, 4));

chk('arg 1', n(9), law(0, 1, 1, 9));
chk('arg n stuff', n(8), law(0, 1, llet(1, 2), 8));

chk('a thing', n(7), law(0, 1, llet(3 /*2*/, llet(7 /*3*/, 2)), 9 /*1*/));

chk(
    'more complx',
    _(1, _(0, 2)),
    law(
        0,
        1, // | ? ($0 $1)
        _(
            1,
            _(0, _(2, 0), 3), // @ $2 = (0 $3)
            _(
                1,
                _(2, 2), // @ $3 = 2
                _(0, 1, 2), // | ($1 $2)
            ),
        ),
        1, // 1
    ),
);

LOG = false;
//  -- more complex example
//     chk (1%(0%2))
//              (law%0%1%           --   | ? ($0 $1)
//                (1% (0%(2%0)%3)%  --     @ $2 = (0 $3)
//                (1% (2%2)%        --     @ $3 = 2
//                 (0%1%2)))%       --     | ($1 $2)
//              1)                  --   1

chk(
    'trivial cycles are ok if not used',
    n(7),
    _(_(law(0, 1, _(1, 7, _(1, 3, 2)), 9))),
);
// -- trivial cycles are okay if not used.
// chk 7 ( (law % 0 % 1 %  --   | ? ($0 $1)
//           (1% 7%        --     @ $2 = 7
//           (1% 3%        --     @ $3 = $3
//                         --     $2
//            2))%         --   9
//         9))

const z1 = law(0, 1, _(2, 0)); //  --  z1 _ = 0
const z3 = law(0, 3, _(2, 0)); //  --  z3 _ _ _ = 0

const a = (f: Input, x: Input) => _(0, f, x);
const lenHelp = law(0, 3, lapp(inc(), lapp(1, 2)));
const len = law(0, 1, lapp(lapp(lapp(pcase(z1, z3), lapp(lenHelp, 0)), z1), 1));
// const lawE = (n:Input,a:Input,b:Input) => law(n,a,b)
// a f x = (0 % f % x)
// lawE n a b = (law % n % a % b)

const k3 = law(0, 4, 1);
const i = law(0, 1, 1);

// -- length of an array
// --
// --     lenHelp len h t = inc (len h)
// --     len x = planCase z1 z3 (\len h t -> inc (len h))  n x
// lenHelp = lawE 0 3 (inc `a` (1 `a` 2))
// len = lawE 0 1 (((planCase % z1 % z3) `a` (lenHelp `a` 0)) `a` z1 `a` 1)

chk('length of array', n(9), _(len, _(0, 1, 2, 3, 4, 5, 6, 7, 8, 9)));
chk('length of array2', n(0), _(len, 1));
chk('length of array3', n(1), _(len, _(20, 10)));

// const toNat=_(natCase, 0, inc)
const head_ = law(0, 3, lapp(1, 2)); //    -- \head h t -> head h
const headF = law(
    0,
    1,
    lapps(pcase(), lapp(k, 1), lapp(k3, 1), lapp(head_, 0), i, 1),
);
const tag = law(0, 1, lapp(toNat(), lapp(headF, 1))); //

chk('head of closure', n(7), _(headF, _(7, 1, 2, 3, 4, 5, 6, 7, 8, 9)));
chk('head law', [PIN, [NAT, OPS.LAW]], _(headF, law(1, 2)));

// -- tag of ADT (head cast to nat)
chk('tag of ADT', n(7), _(tag, _(7, 1, 2, 3, 4, 5, 6, 7, 8, 9)));
chk('tag of ADT law', n(0), _(tag, law(1, 2)));

import ansis from 'ansis';
import { natToAscii } from './natToAscii';
import { perf } from './perf';
import { maybeJet } from './runtime';
import { show } from './show';
import {
    APP,
    APPS,
    AppVal,
    IVal,
    LAW,
    NAT,
    opArity,
    OPCODE,
    OPS,
    PIN,
    REF,
    Val,
} from './types';

export { Force as Force, show as showVal };

export let REQUIRE_OP_PIN = true;
export const setRequireOpPin = (yes: boolean) => {
    REQUIRE_OP_PIN = yes;
};

export let LOG = false;

const Execute = (v: AppVal): Val | null => {
    const args: Val[] = [];
    let n = v as IVal;
    let self = false;
    while (true) {
        switch (n.v[0]) {
            case PIN:
                const p = n.v[1];
                if (p.v[0] === NAT) {
                    if (p.v[1] >= 0 && p.v[1] <= 5) {
                        const code = Number(p.v[1]) as OPCODE;
                        const arity = opArity[code];
                        if (arity === args.length) {
                            return runOp(code, args);
                        }
                    }
                    return null;
                }
                const n0 = n;
                n = Evaluate(p);
                if (n.v[0] === LAW) {
                    // special case, we want to preserve
                    // the pinnedness of the law
                    self = true;
                    args.unshift(n0);
                }
                continue;
            case LAW: {
                const [_, name, arity, b] = n.v;
                if (Number(arity) !== args.length - (self ? 1 : 0)) {
                    return null;
                }
                if (perf) {
                    const nm = natToAscii(name);
                    if (!perf.laws[nm]) perf.laws[nm] = 1;
                    else {
                        perf.laws[nm]++;
                    }
                }
                if (!self) args.unshift(n);

                return maybeJet(name, arity, args) ?? RunLaw(args, b);
            }
            case APP: {
                args.unshift(n.v[2]);
                n = Evaluate(n.v[1]);
                continue;
            }
            case NAT:
                if (REQUIRE_OP_PIN) {
                    return null;
                }
                if (n.v[1] < 0 || n.v[1] > 5) return null;
                const code = Number(n.v[1]) as OPCODE;
                const arity = opArity[code];
                if (arity === args.length) {
                    return runOp(code, args);
                }
                return null;
        }
    }
};

// asNat
const Nat = (o: Val): bigint => {
    const { v: norm } = Evaluate(o);
    if (norm[0] === NAT) return norm[1];
    return 0n;
    // throw new Error(`not a nat`);
};

// Let
const Let = (env: Val[], value: Val, body: Val): Val => {
    const x = RunLaw(env, value);
    if (LOG) console.log(`LET ${ansis.red(env.length + '')} = ${show(x)}`);
    env.push(x);
    return RunLaw(env, body);
};

// Run a Law
const RunLaw = (env: Val[], body: Val): Val => {
    if (body.v[0] === NAT) {
        return { v: [REF, env, body.v[1]] };
    }
    if (body.v[0] === APP) {
        const f = Force(body.v[1]);
        const g = Force(body.v[2]);
        // APP(f,                     g)
        // APP(APP(f_inner, g_inner), g)
        if (f.v[0] === APP) {
            const f_inner = Force(f.v[1]);
            const g_inner = Force(f.v[2]);
            if (f_inner.v[0] === NAT) {
                // (f x)
                if (f_inner.v[1] === 0n) {
                    const f = g_inner;
                    const x = g;
                    return { v: [APP, RunLaw(env, f), RunLaw(env, x)] };
                }
                // (let v in b)
                if (f_inner.v[1] === 1n) {
                    const v = g_inner;
                    const b = g;
                    return Let(env, v, b);
                }
            }
        }
        if (f.v[0] === NAT && f.v[1] === 2n) {
            return g;
        }
    }

    return body;
};

// force (unlazy recursively)
const Force = (o: Val): Val => {
    o = Evaluate(o);
    return o.v[0] === APP ? { v: [APP, Force(o.v[1]), Force(o.v[2])] } : o;
};

const Evaluate = (o: Val): IVal => {
    if (LOG) console.log(`E`, show(o));
    switch (o.v[0]) {
        case REF: {
            const env = o.v[1];
            if (o.v[2] >= env.length) {
                // ERROR probably
                return { v: [NAT, o.v[2]] };
            }
            const idx = Number(o.v[2]);
            return Evaluate(env[idx]);
        }
        case PIN:
        case LAW:
            return o as IVal;
        case APP: {
            const res = Execute(o as AppVal);
            if (res == null) return o as AppVal;
            o.v = res.v;
            return Evaluate(o);
        }
        case NAT:
            return o as IVal;
    }
};

const OP_PIN = (x: Val): Val => (
    LOG && console.log('PIN', show(x)), { v: [PIN, Force(x)] }
);

const OP_LAW = (n: Val, a: Val, b: Val): Val => ({
    v: [LAW, Nat(n), Nat(a), Force(b)],
});

const OP_INC = (n: Val): Val => ({ v: [NAT, Nat(n) + 1n] });

const OP_NCASE = (z: Val, p: Val, x: Val): Val => {
    const n = Nat(x);
    return n === 0n ? z : APPS(p, { v: [NAT, n - 1n] });
};

const OP_PCASE = (p: Val, l: Val, a: Val, n: Val, x: Val): Val => {
    x = Evaluate(x);
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

const runOp = (code: OPCODE, args: Val[]): Val => {
    const f = OP_FNS[code];
    if (!f) throw new Error(`no op fn for ${code}`);
    if (perf != null) perf.ops[code]++;
    return f(...(args as [Val, Val, Val, Val, Val]));
};

const OP_FNS = {
    [OPS.PIN]: OP_PIN,
    [OPS.LAW]: OP_LAW,
    [OPS.INC]: OP_INC,
    [OPS.NCASE]: OP_NCASE,
    [OPS.PCASE]: OP_PCASE,
};

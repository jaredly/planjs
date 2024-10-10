import equal from 'fast-deep-equal';
import { showNice } from '../pst';
import {
    mAPP,
    Memory,
    mENV,
    mLAW,
    mNAT,
    mPIN,
    mREF,
    show,
    vexport,
    vimport,
} from './arraybuffer';
import { APP, LAW, NAT, opArity, OPCODE, PIN, REF, Val } from './types';
import { RT } from './runtime2';

export const setRequireOpPin = (val: boolean) => {
    if (!val) throw new Error('not supporte');
};

type p = number; // pointer

let m: Memory = null!;

const tag = (o: p) => m.view.getUint8(o);

const getEnv = (env: number, idx: number) => {
    if (idx === 0) {
        return mENV.head(m, env);
    }
    // if mid is empty, we have an odd length.
    const mid = mENV.mid(m, env);
    if (idx === 1) return mid;
    const tail = mENV.tail(m, env);
    if (tail === 0) {
        throw new Error(`missing tail in env`);
    }
    return getEnv(tail, idx - (mid === 0 ? 1 : 2));
};

const pushEnv = (env: number, item: number) => {
    const size = mENV.size(m, env);
    if (size % 2 == 1) {
        mENV.setMid(m, env, item);
        mENV.setSize(m, env, size + 1);
        return env;
    }
    const loc = m.alloc();
    mENV.write(m, loc, size + 1, item, 0, env);
    return loc;
};

const newEnv = () => {
    const loc = m.alloc();
    mENV.write(m, loc, 0, 0, 0, 0);
    return loc;
};

const Execute = (o: p) => {
    let env = newEnv();

    let self = false;
    let n = o;
    while (true) {
        switch (tag(o)) {
            case PIN:
                const p = mPIN.get(m, o);
                if (tag(p) === NAT) {
                    const code = Number(mNAT.get(m, p)) as OPCODE;
                    const arity = opArity[code];
                    if (arity === mENV.size(m, env)) {
                        // runOp will try to put
                        // the result in [o] if [o]
                        // is writable. otherwise it will allocate
                        return runOp(code, env, o);
                    }
                    return null;
                }
                const n0 = n;
                const en = Evaluate(p);
                n = en ?? n;
                if (tag(n) === LAW) {
                    self = true;
                    pushEnv(env, n0);
                }
                continue;
            case LAW: {
                const { name, arity, body } = mLAW.read(m, o);
                if (arity != mENV.size(m, env) - (self ? 1 : 0)) {
                    return null;
                }
                if (!self) env = pushEnv(env, n);
                return jet(name, arity, env, o) ?? RunLaw(env, body, o);
            }
            case APP: {
                env = pushEnv(env, mAPP.x(m, n));
                const f = mAPP.f(m, n);
                n = Evaluate(f) ?? f;
                continue;
            }
            case NAT: {
                return null;
            }
        }
    }
};

const Evaluate = (o: p): p | null => {
    switch (tag(o)) {
        case REF: {
            const env = mREF.env(m, o);
            const idx = mREF.idx(m, o);
            const esize = mENV.size(m, env);
            if (idx >= esize) {
                const move = o < m.stack;
                if (move) {
                    o = m.alloc();
                }
                mNAT.write(m, o, BigInt(idx));
                return move ? o : null;
            }
            return Evaluate(getEnv(env, esize - 1 - idx));
        }
        case PIN:
        case LAW:
        case NAT:
            return null;
        case APP: {
            const res = Execute(o);
            if (res == null) return null;
            return Evaluate(res);
        }
        default:
            throw new Error(`unknown tag! ${tag(o)}`);
    }
};

const F = (o: p): p | null => {
    let eo = Evaluate(o);
    if (eo != null) {
        o = eo;
    }
    if (tag(o) === APP) {
        const { f, x } = mAPP.read(m, o);
        const v1 = F(f);
        const v2 = F(x);
        if (v1 != null || v2 != null) {
            if (eo == null && o < m.stack) {
                eo = m.alloc();
                o = eo;
                mAPP.write(m, o, v1 ?? f, v2 ?? x);
            } else {
                if (v1 != null) {
                    mAPP.setF(m, 0, v1);
                }
                if (v2 != null) {
                    mAPP.setX(m, 0, v2);
                }
            }
        }
    }
    return eo != null ? eo : null;
};

export const run = (v: Val) => {
    const { mem, at } = vimport(v);

    m = mem;

    // OK so
    // now to like, load stuff?

    const full = vexport(mem, at);
    if (!equal(v, full)) {
        console.log('first:');
        console.log(showNice(v));
        console.log('second:');
        console.log(showNice(full));
        for (let i = 0; i <= mem.idx; i += 14) {
            console.log(i, show(mem, i));
        }
        throw new Error('not');
    } else {
        console.log('loaded and its all good');
    }
    return v;
};

export const runtime3: RT = {
    setRequireOpPin,
    run,
};

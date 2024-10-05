// The data. All PLAN is PLAN
export type Val =
    | { type: 'PIN'; val: Val }
    | { type: 'LAW'; id: number; arity: number; body: Val }
    | { type: 'APP'; fn: Val; arg: Val }
    | { type: 'NAT'; val: number };

const str = (v: Val) => {
    switch (v.type) {
        case 'PIN':
            return `<${str(v.val)}>`;
        case 'LAW':
            return `{${v.id} ${v.arity} ${str(v.body)}}`;
        case 'APP':
            return `(${str(v.fn)} ${str(v.arg)})`;
        case 'NAT':
            return `@${v.val}`;
    }
};

const PIN = (val: Val | number): Val => ({ type: 'PIN', val: maybeNat(val) });
const LAW = (id: number, arity: number, body: Val | number): Val => ({
    type: 'LAW',
    id,
    arity,
    body: maybeNat(body),
});
const APP = (fn: Val, arg: Val): Val => ({ type: 'APP', fn, arg });
const NAT = (val: number): Val => ({ type: 'NAT', val });

const maybeNat = <T>(v: number | T) => (typeof v === 'number' ? NAT(v) : v);

const E = (o: Val): Val => {
    switch (o.type) {
        case 'NAT':
        case 'PIN':
            return o;
        case 'APP':
            let { fn: f, arg: x } = o;
            f = E(f);
            if (A(f) === 1) {
                o = { ...o, fn: f };
                return E(X(o, o));
            }
            return { ...o, fn: f };
        case 'LAW':
            const { id, arity, body } = o;
            if (arity != 0) return o;
            return E(R(0, o, body));
    }
};

const unwrap = (v: Val): Val[] => {
    if (v.type === 'APP') {
        return [...unwrap(v.fn), v.arg];
    }
    return [v];
};

const X = (fn: Val, arg: Val) => {
    switch (fn.type) {
        case 'APP':
            return X(fn.fn, arg);
        case 'PIN':
            return X(fn.val, arg);
        case 'LAW':
            return R(fn.arity, arg, fn.body);
        case 'NAT':
            const args = unwrap(arg);
            switch (fn.val) {
                case 0: {
                    if (args.length !== 4) throw new Error('bad');
                    const [_, n, a, b] = args;
                    return LAW(N(n), N(a), F(b));
                }
                case 1: {
                    if (args.length !== 6) throw new Error('bad');
                    const [_, p, l, a, n, x] = args;
                    return P(p, l, a, n, E(x));
                }
                case 2: {
                    if (args.length !== 4) throw new Error('bad');
                    const [_, z, p, x] = args;
                    return C(z, p, N(x));
                }
                case 3: {
                    if (args.length !== 2) throw new Error('bad');
                    const [_, x] = args;
                    return NAT(N(x) + 1);
                }
                case 4: {
                    if (args.length !== 2) throw new Error('bad');
                    const [_, x] = args;
                    return PIN(F(x));
                }
            }
    }
    throw new Error('bad x');
};

const APPS = (...vals: Val[]): Val => {
    let res = vals.shift()!;
    while (vals.length) {
        res = APP(res, vals.shift()!);
    }
    return res;
};

const C = (z: Val, p: Val, n: number) => (n === 0 ? z : APP(p, NAT(n - 1)));
const P = (p: Val, l: Val, a: Val, n: Val, x: Val) => {
    switch (x.type) {
        case 'PIN':
            return APP(p, x);
        case 'LAW':
            return APPS(l, NAT(x.id), NAT(x.arity), x.body);
        case 'APP':
            return APPS(a, x.fn, x.arg);
        case 'NAT':
            return APPS(n, x);
    }
};
const F = (o: Val) => {
    o = E(o);
    if (o.type === 'APP') {
        return { ...o, fn: F(o.fn), arg: F(o.arg) };
    }
    return o;
};
const N = (o: Val) => {
    o = E(o);
    return o.type === 'NAT' ? o.val : 0;
};
const I = (f: Val, e: Val, n: number) => {
    if (n === 0) {
        return e.type === 'APP' ? e.arg : e;
    }
    return e.type === 'APP' ? I(f, e.fn, n - 1) : f;
};
const A = (v: Val) => {
    switch (v.type) {
        case 'APP':
            return A(v.fn) - 1;
        case 'PIN':
            return A(v.val);
        case 'LAW':
            return v.arity;
        case 'NAT':
            return I(NAT(1), APPS(NAT(3), NAT(5), NAT(3)), v.val);
    }
};

const R = (n: number, e: Val, b: Val): Val => {
    switch (b.type) {
        case 'NAT':
            return b.val <= n ? I(NAT(999), e, n - b.val) : b;
        case 'APP':
            const args = unwrap(b);
            if (
                args.length === 3 &&
                args[0].type === 'NAT' &&
                args[0].val === 0
            ) {
                const [_, f, x] = args;
                return APP(R(n, e, f), R(n, e, x));
            }
            if (
                args.length === 3 &&
                args[0].type === 'NAT' &&
                args[0].val === 1
            ) {
                const [_, v, b] = args;
                return L(n, e, v, b);
            }
            if (
                args.length === 2 &&
                args[0].type === 'NAT' &&
                args[0].val === 2
            ) {
                return args[1];
            }
    }
    return b;
};

const L = (n: number, e: Val, v: Val, b: Val) => {
    let x = null! as Val;
    let f = APP(e, x);
    x = R(n + 1, f, v);
    return R(n + 1, f, b);
};

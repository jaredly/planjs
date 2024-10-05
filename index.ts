//

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

// Evaluation rules

// This is "make an APP", or do the subst if we can, immediately.
// seems like the first case would be an optimization, but it appears not to be?
const percent = (f: Val, x: Val): Lazy<Val> =>
    arity(f) === 1 ? subst(f, cons(just(x), just(null))) : just(APP(f, x));

const tell =
    <T, R>(m: string, f: (v: T) => R) =>
    (v: T): R => {
        const res = f(v);
        // console.log(m, str(v), res);
        return res;
    };

const arity = tell('arity', (v: Val) => {
    switch (v.type) {
        case 'APP':
            return Math.max(0, arity(v.fn) - 1);
        case 'PIN':
            if (v.val.type === 'NAT') {
                // console.log('is nat', v.val.val);
                switch (v.val.val) {
                    case 1:
                    case 3:
                        return 3;
                    case 4:
                        return 5;
                    default:
                        return 1;
                }
            } else {
                return arity(v.val);
            }
        case 'LAW':
            return v.arity;
        case 'NAT':
            return 0;
    }
});

const pat = (
    p: Lazy<Val>,
    l: Lazy<Val>,
    a: Lazy<Val>,
    n: Lazy<Val>,
    x: Lazy<Val>,
): Lazy<Val> =>
    lazy(() => {
        const xv = x.force();
        switch (xv.type) {
            case 'PIN':
                return percent(p.force(), xv.val);
            case 'LAW':
                return lazy(() =>
                    percent(
                        percent(
                            percent(l.force(), NAT(xv.id)).force(),
                            NAT(xv.arity),
                        ).force(),
                        xv.body,
                    ),
                );
            case 'APP':
                return lazy(() =>
                    percent(percent(a.force(), xv.fn).force(), xv.arg),
                );
            case 'NAT':
                return lazy(() => percent(n.force(), xv));
        }
    });

// kal is for ... variable resolution? I think?
const kal = (n: number, e: LazyList<Val>, value: Val): Lazy<Val> => {
    if (value.type === 'NAT') {
        if (value.val <= n) return at(e, n - value.val);
    }
    if (value.type === 'APP' && value.fn.type === 'NAT' && value.fn.val === 2) {
        return just(value.arg);
    }
    if (
        value.type === 'APP' &&
        value.fn.type === 'NAT' &&
        value.fn.val === 0 &&
        value.arg.type === 'APP'
    ) {
        const { fn, arg } = value.arg;
        return lazy(() =>
            percent(kal(n, e, fn).force(), kal(n, e, arg).force()),
        );
    }
    return just(value);
};

type Lazy<T> = { force: () => T };

const at = <T>(ll: LazyList<T>, n: number): Lazy<T> => {
    let l = ll.force();
    if (!l) throw new Error(`mpety list ${n}`);
    while (n > 0) {
        l = l.tail.force();
        if (!l) throw new Error(`out of bounds`);
        n--;
    }
    return l.head;
};

const toList = <T>(l: LazyList<T>) => {
    const res: Lazy<T>[] = [];
    let inner = l.force();
    while (inner != null) {
        res.push(inner.head);
        inner = inner.tail.force();
    }
    return res;
};

const lazy = <v>(f: () => v | Lazy<v>): Lazy<v> => {
    let forced = false;
    let value: null | v = null;
    return {
        force: () => {
            if (forced) return value!;
            forced = true;
            let inner: Lazy<v> | v = f();
            while (inner && 'force' in (inner as any)) {
                inner = (inner as any).force() as any;
            }
            value = inner as any;
            return value!;
        },
    };
};
const just = <v>(v: v | Lazy<v>): Lazy<v> => lazy(() => v);

type LLInner<T> = null | { head: Lazy<T>; tail: LazyList<T> };
type LazyList<T> = Lazy<LLInner<T>>;

// run :: Natural -> [Val] -> Val -> Val
// run arity ie body = res
//   where (n, e, res::Val) = go arity ie body
//         go i acc (NAT 1 `APP` v `APP` k') = go (i+1) (kal n e v : acc) k'
//         go i acc x                        = (i, acc, kal n e x)

const run = (arity: number, ie: LazyList<Val>, body: Val): Lazy<Val> => {
    const [n, e, res] = go(arity, ie, body);
    return res;

    function go(
        i: number,
        acc: LazyList<Val>,
        x: Val,
    ): [number, LazyList<Val>, Lazy<Val>] {
        if (
            x.type === 'APP' &&
            x.fn.type === 'NAT' &&
            x.fn.val === 1 &&
            x.arg.type === 'APP'
        ) {
            const { fn: v, arg: k_ } = x.arg;
            return go(
                i + 1,
                lazy(() => ({ head: kal(n, e, v), tail: acc })),
                k_,
            );
        }
        return [i, acc, lazy(() => kal(n, e, x).force())];
    }
};

// const run = (arity: number, ie: Val[], body: Val): Val => {
//     const go = (
//         i: number,
//         acc: LazyList<Val[]>,
//         body: Val,
//     ): [number, Lazy<Val[]>, Lazy<Val>] => {
//         if (
//             body.type === 'APP' &&
//             body.fn.type === 'NAT' &&
//             body.fn.val === 1 &&
//             body.arg.type === 'APP'
//         ) {
//             const { fn, arg } = body.arg;
//             return go(
//                 i + 1,
//                 lazy(() => ({head: kal(n, e, fn), tail: acc.force()})),
//                 arg,
//             );
//         }
//         return [i, acc, lazy(() => kal(n, e.force(), body))];
//     };
//     const [n, e, res] = go(
//         arity,
//         lazy(() => ie),
//         body,
//     );
//     return res.force();
// };

const subst = (value: Val, items: LazyList<Val>): Lazy<Val> => {
    // console.log('sub');
    switch (value.type) {
        case 'APP':
            return subst(value.fn, cons(just(value.arg), items));
        case 'PIN':
            if (value.val.type === 'LAW') {
                return exec(value.val, cons(just(value), items));
            }
            return subst(value.val, items);
        default:
            return exec(value, cons(just(value), items));
    }
};

const nat = (v: Lazy<Val>) => {
    let n = v.force();
    return n.type === 'NAT' ? n.val : 0;
};

const cons = <T>(head: Lazy<T>, tail: LazyList<T>): LazyList<T> =>
    lazy(() => ({ head, tail }));

const reverse = <T>(l: LazyList<T>, acc: LazyList<T>): LazyList<T> =>
    lazy(() => {
        const inner = l.force();
        if (inner == null) return acc.force();
        return reverse(
            inner.tail,
            lazy(() => ({ head: inner.head, tail: acc })),
        ).force();
    });

const exec = (value: Val, args: LazyList<Val>): Lazy<Val> => {
    if (value.type === 'LAW') {
        return run(value.arity, reverse(args, just(null)), value.body);
    }
    if (value.type === 'NAT') {
        return lazy(() => {
            const vargs = toList(args);
            switch (value.val) {
                case 0:
                    if (vargs.length < 2) throw new Error(`invalid PIN`);
                    return PIN(vargs[1].force());
                case 1:
                    if (vargs.length < 4) throw new Error(`invalid LAW`);
                    const [_, n, a, b] = vargs;
                    if (nat(a) > 0) {
                        return LAW(nat(n), nat(a), b.force());
                    }
                    throw new Error(`invalid law definition`);
                case 2:
                    if (vargs.length < 2) throw new Error(`invalid NAT`);
                    return NAT(nat(vargs[1]) + 1);
                case 3: {
                    if (vargs.length < 4) throw new Error(`invalid NAT_CASE`);
                    const [_, z, p, x] = vargs;
                    const n = nat(x);
                    return n === 0
                        ? z
                        : lazy(() => percent(p.force(), NAT(n - 1)));
                }
                case 4: {
                    if (vargs.length < 6) throw new Error(`invalid CASE`);
                    const [_, p, l, a, n, x] = vargs;
                    return pat(p, l, a, n, x);
                }
            }
            throw new Error(
                `invalid exec ${str(value)} with vargs ${vargs
                    .map((x) => str(x.force()))
                    .join(', ')}`,
            );
        });
    }
    throw new Error(
        `invalid exec ${str(value)} with args ${toList(args)
            .map((x) => str(x.force()))
            .join(', ')}`,
    );
};

const maybeNat = <T>(v: number | T) => (typeof v === 'number' ? NAT(v) : v);

const percents = (...values: (number | Val | Lazy<Val>)[]) => {
    let res: Lazy<Val> = just(maybeNat(values.shift()!));
    while (values.length) {
        res = percent(res.force(), just(maybeNat(values.shift()!)).force());
    }
    return res;
};

const pin = PIN(NAT(0));
const law = PIN(NAT(1));
const inc = PIN(NAT(2));
const natCase = PIN(NAT(3));
const planCase = PIN(NAT(4));

const check = (one: number | Val | Lazy<Val>, two: Val | Lazy<Val>) => {
    const o = just(maybeNat(one)).force();
    const t = just(two).force();
    if (JSON.stringify(o) !== JSON.stringify(t)) {
        console.error(`not equal`, str(o), 'vs', str(t));
    } else {
        console.log('equal', str(o), str(t));
    }
};
const p$ = percents;

const k = p$(law, 0, 2, 1);
const appHead = p$(planCase, 0, 0, k, 0);
const toNat = p$(natCase, 0, inc);

// increment, make a law, make a pin
check(5, percents(inc, 4));
check(LAW(1, 2, 3), percents(law, 1, 2, 3));
check(PIN(5), p$(pin, p$(inc, 4)));

// pattern match on nats
check(9, p$(toNat, 9));
check(0, p$(toNat, p$(pin, 9)));

// pattern match on PLAN
check(p$(1, 2), p$(planCase, 1, 0, 0, 0, p$(pin, 2)));
check(p$(1, 2, 3, 4), p$(planCase, 0, 1, 0, 0, p$(law, 2, 3, 4)));
check(p$(1, 2, 3), p$(planCase, 0, 0, 1, 0, p$(2, 3)));
check(p$(1, 2), p$(planCase, 0, 0, 0, 1, 2));

// basic laws
check(LAW(0, 2, 0), p$(law, 0, 2, 0, 7, 8));
check(7, p$(law, 0, 2, 1, 7, 8));
check(8, p$(law, 0, 2, 2, 7, 8));
check(3, p$(law, 0, 2, 3, 7, 8));

// force a value by using it to build a law and the running it.
check(1, percents(law, 0, 1, percents(2, 1), 0));

const llet = (v: Val, b: Val) => p$(1, v, b);
const lapp = (fn: Val, arg: Val) => p$(0, fn, arg);
const lconst = (v: Val) => p$(2, v);

// select finite part of infinite value
check(1, p$(appHead, p$(law, 99, 1, p$(1, p$(0, 1, 2), 2), 1)));

// check(9, percents(law, 0, 1, 1, 9));

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

const PIN = (val: Val): Val => ({ type: 'PIN', val });
const LAW = (id: number, arity: number, body: Val): Val => ({
    type: 'LAW',
    id,
    arity,
    body,
});
const APP = (fn: Val, arg: Val): Val => ({ type: 'APP', fn, arg });
const NAT = (val: number): Val => ({ type: 'NAT', val });

// Evaluation rules

// This is "make an APP", or do the subst if we can, immediately.
// seems like the first case would be an optimization, but it appears not to be?
const percent = (f: Val, x: Val): Val =>
    arity(f) === 1 ? subst(f, [x]) : APP(f, x);

const arity = (v: Val) => {
    switch (v.type) {
        case 'APP':
            return arity(v.fn) - 1;
        case 'PIN':
            if (v.val.type === 'NAT') {
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
};

const pat = (p: Val, l: Val, a: Val, n: Val, x: Val): Val => {
    switch (x.type) {
        case 'PIN':
            return percent(p, x.val);
        case 'LAW':
            return percent(
                percent(percent(l, NAT(x.id)), NAT(x.arity)),
                x.body,
            );
        case 'APP':
            return percent(percent(a, x.fn), x.arg);
        case 'NAT':
            return percent(n, x);
    }
};

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
    const res: T[] = [];
    let inner = l.force();
    while (inner != null) {
        res.push(inner.head.force());
        inner = inner.tail.force();
    }
    return res;
};

const lazy = <v>(f: () => v): Lazy<v> => {
    let forced = false;
    let value: null | v = null;
    return {
        force: () => {
            if (forced) return value!;
            forced = true;
            value = f();
            return value!;
        },
    };
};
const just = <v>(v: v) => lazy(() => v);

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

const nat = (v: Val) => (v.type === 'NAT' ? v.val : 0);

const rev = ({ head, tail }, ntail) => {};

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
                    return PIN(vargs[1]);
                case 1:
                    if (vargs.length < 4) throw new Error(`invalid LAW`);
                    const [_, n, a, b] = vargs;
                    if (nat(a) > 0) {
                        return LAW(nat(n), nat(a), b);
                    }
                    throw new Error(`invalid law definition`);
                case 2:
                    if (vargs.length < 2) throw new Error(`invalid NAT`);
                    return NAT(nat(vargs[1]) + 1);
                case 3: {
                    if (vargs.length < 4) throw new Error(`invalid NAT_CASE`);
                    const [_, z, p, x] = vargs;
                    const n = nat(x);
                    return n === 0 ? z : percent(p, NAT(n - 1));
                }
                case 4: {
                    if (vargs.length < 6) throw new Error(`invalid CASE`);
                    const [_, p, l, a, n, x] = vargs;
                    return pat(p, l, a, n, x);
                }
            }
            throw new Error(
                `invalid exec ${str(value)} with vargs ${vargs
                    .map(str)
                    .join(', ')}`,
            );
        });
    }
    throw new Error(
        `invalid exec ${str(value)} with args ${toList(args)
            .map(str)
            .join(', ')}`,
    );
};

// const E = (value: Val): Val => {
//     switch (value.type) {
//         case 'NAT':
//         case 'PIN':
//             return value
//         case 'APP': {
//             value = {...value, fn:E(value.fn)}
//             if (A(fn) === 1) {
//                 // wut?
//                 value = X(value, value)
//             }
//             return value
//         }
//         case 'LAW': {
//             if (value.arity != 0) {
//                 return value
//             }
//             const {id, arity, body} = value
//             value = '???'
//             value = R(0, value, body)
//             return E(value)
//         }
//     }
// }

// const X = (value: Val, arg: Val): Val => {
//     switch (value.type) {
//         case 'APP':
//             return X(value.fn, arg)
//         case 'PIN':
//             return X(value.val, arg)
//         case 'LAW':
//             const {id, arity, body} = value
//             return R(arity, arg, body)
//         case 'NAT':
//             switch (value.val) {
//                 case 0:
//                     if (arg.type === 'LAW'){
//                         const {id, arity, body} = arg
//                         return {type: 'LAW', id: N(id), arity: N(arity), body: F(body)}
//                     }
//                     throw new Error('type error')
//                 case 1:

//             }
//     }
// }

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
    | [tHOL];

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

const opArity: Record<(typeof OPS)[keyof typeof OPS], number> = {
    [OPS.PIN]: 1,
    [OPS.LAW]: 3,
    [OPS.INC]: 1,
    [OPS.NCASE]: 3,
    [OPS.PCASE]: 5,
};

// typedef struct Nat {
//   NatType type;
//   union {
//     u64 direct;
//     struct {
//       u64 size;
//       u64 *buf;
//     };
//   };
// } Nat;

// struct Value;

// typedef struct Law {
//   Nat n;
//   Nat a;
//   struct Value * b;
// } Law;

// typedef struct App {
//   struct Value * f;
//   struct Value * g;
// } App;

// typedef struct Value {
//   Type type;
//   union {
//     struct Value * p;
//     Law l;
//     App a;
//     Nat n;
//   };
// } Value;

// Combinatorsss

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
    const norm = E(o);
    if (norm[0] === NAT) return norm[1];
    throw new Error(`not a nat`);
};

// const L = (n: Val, e: Val, v: Val, b: Val): Val => {};

/*
n: some number
e: the function we're pretending to apply
v: the first arg maybe idk
b: the second one?

// HAHHHAA L is Let. It's for LET!!!

// let [n+1] = v in b

Value * L(Value * n, Value * env, Value * val, Value * body) {
    // we make a "hole"
    Value * x = a_Hol();
    // add it to the environment
    Value * env_ = a_App(env, x);
    // evaluate val in env_, toss the result back into x
    *x = *R(a_Big(Inc(n->n)), env_, val);
    // evaluate body with env_ now reflecting the dealio.
    return R(a_Big(Inc(n->n)), env_, body);
}

// ahhh ok so we're lazy folks. very lazy.
// this ... is a

n: a number, one larger than the one passed in to "L"
e: the APP that may or may not have a hole as the arg
b: who knows


IF b is a number and <= n:
    we return the (n - b)th argument from the end of (e)
IF b is a number > n:
    we return b??? is this some weird fallthrough
IF b is of the form APP(APP(f, g), h)
    if f is NAT(0)
        // is this, logically, "apply the Nth - g argument of e to the "
        return APP(R(n, e, g), R(n, e, h))
    if f is NAT(1)
        return L(n, e, f, x) <- we recurse back into "L" for something
IF b is of the form APP(2, g)
    return g
otherwise return b

WAITWAIT
R is for RUN A LAW
(n) is the arity of the law
(e) is the arguments to the law
(b) is the body.

Value * R(int arity, Value * env, Value * body){

    // If `body` is a nat within the arity of the law, we just do a lookup in the environment.
    if (body->type == NAT && LTE(body->n, arity)) {
        return I(body, env, arity - body);
    }
    // If `body` is some other nat, we leave it alone, apparently.
    // I'm not sure about the implications of this?

    // EDSL HERE! interesting.
    // If `body` is an APP(APP(0, f), x)
    // this means we do a "local eval" of both f and x, and then
    // return APP(f, x)

    // If `body` is an APP(APP(1, v), b)
    // good news folks, time to do a `let`
    // we pass in `arity`, because it's the current length of the
    // environment.
    // so the "id" of the newly bound variable is going to be arity+1

    // If `body` is APP(2, ?)
    // it's just the literal ?

    if (body->type == APP) {
        if (body->a.f->type == APP) {
            if ((body->a.f->a.f->type == NAT) && EQ(body->a.f->a.f->n, d_Nat(0))) {
                Value * f = body->a.f->a.g;
                Value * x = body->a.g;
                return a_App(R(arity, env, f), R(arity, env, x));
            }
            if ((body->a.f->a.f->type == NAT) && EQ(body->a.f->a.f->n, d_Nat(1))) {
                Value * f = body->a.f->a.g;
                Value * x = body->a.g;
                return L(arity, env, f, x);
            }
        } else if ((body->a.f->type == NAT) && EQ(body->a.f->n, d_Nat(2))) {
            Value * x = body->a.g;
            return x;
        }
    }
    return b;
}
*/

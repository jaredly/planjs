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

const opArity = {
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

/** Something like "getNthArgFromEnd"
 *
 * f: ends up being a default value, if we don't get `n` to `0`
 *    before we run out of `APP`s
 * e: the value we're digging into
 * n: the amount we still have to dig.
 *
 * so, it's like .. the "first argument" of a multi-arg call?j
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

const I = (fallback: Val, expr: Val, nthArgFromEnd: number) => {
    if (nthArgFromEnd === 0) {
        return expr[0] === APP ? expr[2] : expr;
    }
    return expr[0] === APP ? I(fallback, expr[1], nthArgFromEnd - 1) : fallback;
};

/** Arity determination
 *
 * Pin: recurse
 * Law: has a declared arity
 * App: one less than the arity of the applied function
 *      > if the function cannot be applied, it probably ought to error
 * Nat: if it's an opcode, then the arity of the primop. otherwise *should* be 0
 */
const A = (o: Val) => {
    switch (o[0]) {
        case PIN:
            // TODO haskell is different
            return A(o[1]);
        case LAW:
            return o[2];
        case APP: {
            const head = A(o[1]);
            return head === 0 ? 0 : head - 1;
        }
        case NAT: {
            switch (o[1]) {
                // TODO I think this is wrong
                case 0:
                    return 3;
                case 1:
                    return 5;
                case 2:
                    return 3;
            }
            return 1; // should be 0 probably?
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

Value * L(Value * n, Value * e, Value * v, Value * b) {
    // we make a "hole"
    Value * x = a_Hol();
    // then we pretend it's the argument to an "apply"
    Value * f = a_App(e, x);
    // we then "R"
    *x = *R(a_Big(Inc(n->n)), f, v);
    return R(a_Big(Inc(n->n)), f, b);
}

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

Value * R(Value * n, Value * env, Value * body){
  if (body->type == NAT && LTE(body->n, n->n)) {
    return I(body, env, a_Big(Sub(n->n, body->n)));
  }
  if (body->type == APP) {
    if (body->a.f->type == APP) {
      if ((body->a.f->a.f->type == NAT) && EQ(body->a.f->a.f->n, d_Nat(0))) {
        Value * f = body->a.f->a.g;
        Value * x = body->a.g;
        return a_App(R(n, env, f), R(n, env, x));
      }
      if ((body->a.f->a.f->type == NAT) && EQ(body->a.f->a.f->n, d_Nat(1))) {
        Value * f = body->a.f->a.g;
        Value * x = body->a.g;
        return L(n, env, f, x);
      }
    } else if ((body->a.f->type == NAT) && EQ(body->a.f->n, d_Nat(2))) {
        Value * x = body->a.g;
        return x;
    }
  }
  return b;
}
*/

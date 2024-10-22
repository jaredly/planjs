
Pseudocode for evaluating a PLAN data structure in an strict-evaluation language.

There are 4 main kinds of PLAN values; `Pin(inner), Law(id, arity, body), App(fn, arg), and Nat(nat)`.
A fifth value `Ref(env, idx)` is used during evaluation to represent lazy evaluation and to allow for cyclic data structures. It is impossible to directly construct a `Ref` via user input, it is only used internally.

There are 5 "primitive operations" (or primops):
- `PIN(v)`: constructs a pin with contents `v`
- `INC(n)`: increments a number by 1
- `LAW(name, arity, body)`: constructs a law
- `NCASE(zero, positive, value)`: 'destructs' a nat; producing the "zero" case if it is zero, otherwise `App`lying the positive case with argument `value-1`
- `PCASE(p, l, a, n, x)`: 'destructs' a PLAN value `App`lying one of the four "handlers" depending on the type of x.

The primops are represented by a `Pin`ned `Nat`, with the constants 0 - 4. For example `App(Pin(Nat(1)), Nat(2))` represents calling `INC` with `2`, and will produce `Nat(3)`.

Within the body of a Law, there are a few special forms that comprise the "embedded dsl"
```
- (0 f x) : App(App(Nat(0), f), x) -> (f x)
- (1 v b) : App(App(Nat(1), v), b) -> (let v in b)
- (2 c)   : App(Nat(2), c)         -> c
```
Additionally, a bare `Nat` is evaluated as an index into the "environment" list of values, if possible.

The "environment" used in evaluating the body of a law always has as its first argument the result of evaluating that law (this is how cyclic references are possible, by evaluating a bare `0`). The numbers `1...arity` refer to the arguments "passed to" the law, and numbers above `arity` refer to locally let-bound values. Note that, due to laziness, a bare number in the body of a law can refer to subsequently let-bound values within that law. Any bare numbers that exceed the final length of the environment evaluate to their numeric value.

```h
// Immediate value
deftype IVal
  Pin(Val)
  Law(~id:nat, ~arity:nat, ~body:Val)
  App(~fn:Val, ~arg:Val)
  Nat(nat)

// Possibly lazy value
deftype Val
  ...IVal
  Ref(Val[], nat)

// [A]rity: IVal -> nat
// Get the "number of expected arguments" of the expression
A(Pin(Nat(0|2)))    = 1 // PIN | INC
A(Pin(Nat(1|3)))    = 3 // LAW | NCASE
A(Pin(Nat(4)))      = 5 // PCASE
A(Pin(Nat))         = 1 // fallback(?)
A(Pin(v))           = A(E(v))
A(Law(_, arity, _)) = arity
A(App(fn, arg))     = A(E(fn)) - 1
A(Nat)              = 0

// [N]at: Val -> nat
// coerce a Val to a nat
N(v) = match E(v)
  Nat(v) -> v
  _      -> 0

// [R]un: ~env:Val[] ~body:Val -> Val
// Run a law. This evaluates th "embedded DSL"
R(env, Nat(n))                 = Ref(env, n) // lazy! note that env is mutable.
R(env, App(App(Nat(0), f), x)) = App(R(env, f), R(env, x)) // (f x)
R(env, App(Nat(2), c))         = c // const c
R(env, x)                      = x

// Run a law with let. Note that all "lets" must be
// hoisted to the topmost level of a law.
RL(env, App(App(Nat(1), v), b))  = L(env, v, b) // let v in b
RL(env, x)                       = R(env, x)

// [L]et: ~env:Val[] ~value:Val ~body:Val -> Val
// (let $idx = value in body)
// where $idx is calculated as the index of the
// value in the environment list
L(env, value, body) =
  env.push(R(env, value))
  RL(env, body)

// [F]orce: Val -> IVal
// recursively force evaluation
F(v@Ref)        = F(E(v))
F(App(fn, arg)) = App(F(fn), F(arg))
F(x)            = x

// [E]valuate: Val -> IVal
E(v@Pin) = v
E(Law(_, 0, body)) =
  env = []
  res = R(env, body)
  env.push(res)
  res
E(v@Law)         = v
E(v@App(fn, arg))  =
  v.fn = E(fn)
  if A(fn) == 1
    v <- X(head(v.fn), v) // in-place update!
    E(v)
  else
    v
E(v@Nat)         = v
E(Ref(env, idx)) = idx < len(env) ? E(env[idx]) : Nat(idx)

// e[X]ecute ~target:Val ~environment:Val[] -> Val
// Execute primops, evaluate law bodies, perform function application.
// (n, a, b) is short for App(App(n, a), b)
X(Pin(Nat(0)), v)               = Pin(v)
X(Pin(Nat(1)), (n, a, b))       = Law(n, a, b)
X(Pin(Nat(2)), v)               = Nat(N(v) + 1)
X(Pin(Nat(3)), (z, p, v))       = N(v) == 0 ? z : App(p, Nat(N(v) - 1))
X(Pin(Nat(4)), (p, l, a, n, x)) = P(p, l, a, n, x)
X(Pin(v), env)                  = X(E(v), env)
X(Law(_, _, body), env)         = R(env, body)
X(App(fn, _), env)              = X(fn, env)
X(v, _)                         = v

// PCASE op
P(p, l, a, n, Pin(x))       = App(p, x)
P(p, l, a, n, Law(n, a, b)) = Apps(l, n, a, b)
P(p, l, a, n, App(fn, x))   = Apps(a, fn, x)
P(p, l, a, n, Nat(n))       = App(n, Nat(n))

// Helper to allow us to write curried function application more naturally
Apps(fn, arg)      = App(fn, arg)
Apps(...rest, arg) = App(Apps(...rest), arg)

```
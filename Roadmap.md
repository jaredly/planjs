
- [x] go all in on parsing
- [ ] connect it up to the latest runtime
- [ ] add to the runtime... types... so that APP has an 'id' associated with it, and I can log when things get evaluated.
- [ ] thennnnn I want like ... an "incremental evaluator".
  so I can pause in the middle of a step.
  this will involve manually having a stack, I imagine.


yeahhh ok so I'm going to make a `stepper` runtime that also
like does the full memory management I think.
for funsies.







# Let's recover variable names?

- [ ] yeah hang on to variable names in PLAN so I can re-render them back
  - while we're at it, let's hang on to `loc`s
- [ ] sort the pins based on usage, dependency order prolly
- [ ] change my `let` syntax to be `(let name value) (let name value)`
- [ ] think about .. step-through ..?
- [ ] tracing is probably easier...
- [x] get things lookin nice

# Let's make a web UI

aanddddd track prevenance
so
that'll be fun.

but first, a normal text area folx


# Multiple Args at once:

- after ... parsing ... do a pass on the Value's, collapsing applications where the root's arity is known.


# Optimizing the JIT compiler:

- [ ] if we're calling a LAW, we can eliminate a bunch of unnecessary APPs because we know the (minimum) arity
  - eh, ok I'm not actually sold on this I guess.
- [ ] let's try inlining stuff! What does that do?
- [ ] sooo it turns out the jitted code is only really responsible for producing a data structure that gets pushed onto the stack. seems like we want a VM anyways
- [ ] areee there some functions that we can through fancy analysis turn into strict? Thus allowing them to be much more effectively JITted? Like, you could inline a PCASE as a switch or something...

lol for the editor, can I rope in my dealio?


# OK so something muuch simpler ought to be:
let's compile to javascript.


So I started doing stuff like this:
```js
  return typeof plus === 'function' && plus.length === 1
      ? plus(x - 1)
      : [plus, x - 1];
```
but actually I think that's not right, like it's too eager?
like we need a `force` function. that would do the calling,
if needed.





The {lazy} stuff is clutter. let's do:
[1, v] -> forced, Immediate
[1, f, x] -> forced, app
[0, f, x] -> unforced, app





AHH my new jit doesn't JET
now it does and itt is great.











# Let's consider the simple case of or non-jetted plus:

```clj
(defn +1 [$1 $2 $3] (INC ($1 $3 $2)))
(defn + [$1 $2] (NCASE $2 (+1 $0 $2) $1))
```

ok but.


```clj
(func $INC (param $p i32)
  (i32.load (local.get $p))
  (i32.eq (i32.const 3))
  (if
    (then
      (local $res i32)
      (call $alloc)
      (local.tee $res)
      (i32.const 3)
      i32.store
      (i32.load (i32.add (local.get $p) (i32.const 1)))
      (i32.store (i32.add (local.get $res) (i32.const 1)))
      (local.get $res)
    )
    (else (i32.const 0))
  )
)

(func $plus1 (param $p1 i32) (param $p2 i32) (param $p3 i32) (return i32)
  (call $INC (call_indirect (local.get $p1) (local.get $p2) (local.get $p3)))
)

(func $plus (param $p1 i32) (param $p2 i32)

)
```

hmmmmm
so,
if we're doing this thing
where we...
hm ok
so
we gotta box some numbers here. like.
deal with it.

Hmmmmmmmmm
ORRRrrrrrr
like we could put it all right there
on the stack of the law.
hm.
aha
ok so turns out multi-value return is a thing,
so I can just like return a whole NAT from INC. yay?

hrm I feel like... this whole story would benefit from some
type information.

should I write a type inference algorithm for PLAN?
why of course I should.

ONNN the other hand,
what if I translate PLAN to javascript?
that'd be fun, right?





## OK Hoisted Lets change a lot of things.

This means:
- we statically know the size of the stack
- we can validate REFs when parsing a law
- we can statically know which lets are cyclical,
  which is ... cool?

OK so a law is a function. either a call_indirect
to a function in the local table, or an FFI to
a JITted function.

ON THE OTHER HAND if we just statically have
a fully applied function, we can compile it as
a direct `call`. Which is sweet.

Soooo what we need is:
- the ability to convert a `LAW` into wasm.

QUESTION: what needs to be lazy?
only let-bound things? NO also env-bound (fn args)

which again means "a thing on a stack somewhere", right?

##


```
pin(?)
law(n,a,?)
app(?,?)
nat(v)
let(?, ?)
partial(?,?)

app(x, y)
-> what's in X can't see what's in Y, it can only see Y directly.
-> right? and what's in Y can't see anything about X.

let(v, b)
-> what's in V /can/ see further 'let' things in B
-> and B can obviously reference V, that's the whole point.
-> V can also self-reference.

law(_, _, b) -> b can access the arguments (stack) given to it, and nothing else. there is no way to /reach into/ a law from the stack.

```





I'm still not sure I understand the execution semantics of PLAN wrt laziness and the environment stack.

specifically, the fact that a let's value can reference a let in its body.

so, simple example (assuming we're inside a LAW body)

(let [$1 (5 $2)] (let [$2 (6 $1)] $1))
-> (5 (6 (5 (6 ...))))

the PLAN for this is

(1 ((2 5) 2) (1 ((2 6) 1) 1))

It gets weird when you can have multiple paths to fulfill the
requested "$2"

(let [$1 (5 $2)]
  ((let [$2 (6 $1)] $1)
   (let [$2 (7 $1)] $1)))

would that result in two independent evaluations of `$1`, for each given $2?

(
  (5 (6 (5 (6 ...))))
  (5 (7 (5 (7 ...))))
)

this would mean that the runtime would have to essentially de-opt the binding of $1, evaluating it twice instead of caching it.

another thing that strikes me as strange: the dual interpretation
of bare NATs in the law dsl; where if it's a valid index into the
environment, it's treated as a ref, otherwise it's a constant.

So what should this be:

```
(let [$1 $2]
  ($1 (let [$2 7] $1)))
```

would that evaluate to (2 7)? Where the first time, $2 is not a valid index and so evaluates to "2" and the second time it is a valid index and so resolves to "7"?



# Ok so we're actualy goign to compile to wasm, no vm
and JITing (the `law` primop) will jump out to javascript, produce a new wasm instance, and allow you to FFI between instances essentially.
Could get a little cumbersome, idk.
hmmmmm and ...



- [ ] make my lisp have `let` and `let*`
  then ensure that laziness is doing the right thing.
  - right now it gives every LET a unique index, which
    isn't actually correct; the LETs need to follow scoping
    rules.


OK SO
I can think of two things to be doing

(1) a wasm-vm, where the data is living in a block,
  and we run our little vm, like I have in runtime3.
  would be an interesting project.
  I'd actually want to be writing a custom language,
  which then I'd translate to javascript (for testing)
  and later wasm.

(2) just compile plan to wasm. this would mean potentially
  a decent amount of hassle when calling LAW because we'd
  need to JIT something.
  also PIN would need to (a) hash the contents, then (b)
  lookup in our pin table somehow to see if we have that
  already, and if we do it can be a normal call_indirect
  sort of thing, otherwise



















# doing a js wasmy thing

- [ ] validate that Execute can take the "location to put stuff"
  instead of doing that on the backend.
  - hmmm there's more I can do to make runtime2 feel more
    like halfway there.
    like, have a "memory" that is a list of items...
    idk if thats worth it tho

# So, a way to do it in wasm

have ... a reference
and when crawling it, always clone? maybe?

So the source of truth is living in on memory or something

and when traversing, we copy it over? maybe. somehow.

eh ok, so here's the deal

let's try another like runtime3, that puts everything in an ArrayBuffer


ohhhh wow its a garbage collection bug lol.
i'm setting the value on the old buffer. what a classic memory error.

# Thinking about ... a diff kind of interpreter

with like a stack or something.

ok so like.
we define all these pins.
but like
/lift/ them. So then the AST `pin` just has an index to the pin.

so the PIN op would actually ... hash the contents and ~add it
to the list, giving you an index into the pin list. in ~general, pinning wouldn't be super common rite.

anyway

The toplevel would be like:
- here's a pin, and some arguments.

what needs to mutate, really.
E(app)

And when do we E?
- if we need the arity of a Pin or an App
- if we're coercing to a Nat (the NAT or INC ops)
- if we're eXecuting a Pin
  - if we're E'ing an App of a Pin
- if we're Forcing a value
  - toplevel
  - RunLaw
  - OP_PIN | OP_LAW


So, if we E a fully qualified App

and where did the App come from?

- law-dsl (0 f x)
- PCASE or NCASE

can I like ... unroll this?

hmmmm what if, I made `Arity` do some more work for me?




# Perf analysis

ok there's gotta be something screwy happening here, because:
- how am I possibly calling `drop` so many times?
- OH WOW wait. is it laziness? OH WOW. ok.
  yeah I think... I need to ... ~store the result of the laziness.
  lol ok.

OK so `o <- X(o,o)`
was the real deal.

AND:
now jetting + is the deciding factor!
yay.
so we can generate essentially unlimited fibonacci numbers!

So, the only /in-place update/ that's needed is E((f x)) o <- X(o,o)


# PALLAS but make it javascript

I've got a PLAN interpreter, that has some tests passing.

...

recursive .. references ... are they working right?
should $0 reference the law, or the return value of the law?
I guess the law, so you can actually call recursive functions.

aha ok so its working.

- [ ] X probably doesn't need a list of vals, right? because it doesn't need to be mutable, right?


- [x] jet addition for crying out loud
  - it .. didn't help too much? idk.
- [x] let's get lets getting.
- [ ] sooo there are a bunch of things I want. a big one would be:

->> performance profiling. on the other hand, I also want like wasm compilation.
  - wow my fib is so much better. is it just that I've de-seeded it?

- [x] basic perf collection
- [x] wow why is sire so much worse at some things

OK SO

When I get back to this, I want:

- [x] figure out if zipWith can be linear instead of apparently geometric?
- [x] track # calls to each LAW
- [ ] to maybe translate my little VM into wasm, because boy wouldn't that be fun
  - it's possible I wouldn't be able to figure out the memory management of it, or something.
- [ ] thiink about a different way to do a VM? like have a managed stack or something? idk.


whattttabouttttt like wasm.
like ... compiling to wasm?
orrr compiling the interpreter to wasm?
hmmm.
yeah I think hand-writing an interpreter would be the first step.

lol so like. maybe I'll write another little compiler for a small layer on top of wasm? lol
















#

- [x] get haskell tests passing https://opfn.gitbook.io/pallas/plan/definition
- [ ] see if I can load ... all of the sire impl? or something like that?
- [ ] maybe try to load the stdlib?
- [x] should I try to build a SEED loader? hmmm.
  - could be useful.

Ok, so we're loading seeds, and at least for some toy seeds it's working fine.
However: printing out the PLAN version of these seeds is ridiculous; the
C impl of the seed loader took 30 seconds to load seeds/arithmetic.sire.seed,
and produced a text file of over 600mb.
So that's not feasible.
ON THE OTHER HAND, running *but not printing* the C impl on that same file
finished essentially instantly.
so it's probablyyy the printing that's the issue.

yeah so same with my js impl actually.
I wonder if I can now try running it?

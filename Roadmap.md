

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

so, simple example

(let [x (1 y)] (let [y (2 x)] x))
-> (1 (2 (1 (2 ...))))

if you have:

(let [x (1 y)]
  ((let [y (2 x)] x)
   (let [y (3 x)] x)))

would that result in two independent evaluations of `x`, for each given y?

(
  (1 (2 (1 ...)))
  (1 (3 (1 ...)))
)




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

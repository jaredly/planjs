
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
- if we're Forcing a value (only happens at the toplevel)


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

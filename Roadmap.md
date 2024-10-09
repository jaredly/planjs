
# PALLAS but make it javascript

I've got a PLAN interpreter, that has some tests passing.

...

recursive .. references ... are they working right?
should $0 reference the law, or the return value of the law?
I guess the law, so you can actually call recursive functions.



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


- pseudocode doesn't have let hoisting enforced

- it sure would be nice for the LAW DSL to allow indicating the names of function parameters, and the names of let-bindings. debugging would be much nicer, for one thing.

How married are you to the term "Cog"? It doesn't really evoke anything for me.

- removing data-jets sounds like you won't want O(1) array access, which seems like quite an achilles heel.
- can you imagine pallas being used to make games? the "tcp/udp only" constraint will put a pretty hard cap on that.
  - unless you imagine pallas to be runnable in a variety of contexts, only one of which is the "cog machine"



## ~~nevermind this stuff~~
What do y'all think about tightening up the law DSL to indicate that the only things you're allowed to LET are App and Pin(App)

So the DSL is

```
(f x)        = App(App(Nat(0) f) x)
(let v in b) = App(App(Nat(1)     App(_ _))  body)
(let v in b) = App(App(Nat(1) Pin(App(_ _))) body)
x            = App(Nat(2) x)
```

it would be nice for the interpreter to be able to assume constant inlining.
eh maybe there's not really a benefit there.



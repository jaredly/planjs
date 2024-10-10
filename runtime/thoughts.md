
```
pin (pointer)
law (name [debug]) (arity number) (pointer body)
app (pointer) (pointer)
nat (numbre)


Sooo it'll be different per tag, which is fine.

pin needs 1 + 8
law needs 1 + 8 + 1 + 4
app needs 1 + 1 + 1
nat needs 1 + 8

// down to 14 bytes from 40, yes it's a far cry








are pointers and numbers interchangeable?
is it ~faster to allocate a little more,
and have the pointers always be in the same places?

like

0 : tag
1 : pointer : pin|law|app
2 : number  : law|nat
3 : pointer : app
4 : number  : name

OR

0 : tag
1 : pointer (pin|app) or number (law|nat)
2 : pointer (app) or number (law)
3 : number (law name)

and therefore
we could pack a linked list in there

0 : 5 (env head)
1 : number : size
2 : head (pointer to element)
3 : tail (pointer to next head)

0 : 6 (env tail)
1 : head1 (pointer to element)
2 : head2 (pointer to element)
3 : tail (pointer to next head)

....

question though.
when writing a garbage collector.
howw do I know what is "live"?
like how do I keep track of the stack.
I guessss I could have like a separate
reference-counting thing for stack variables
or something.

.....

WAIT I could like ... have the root, live at
like position 0? always?
and then we could know.

```

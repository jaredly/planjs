
# What if this was a stack-based language

How a stack based language works:

"look at the top of the stack"
if it's a function, call the function
the function is allowed to like pop stuff off n stuff.

so if we have a stack

2
INC
INC

so the first thing, 2, just puts it on the stack.
INC takes the first thing (2) and incs it, putting back 3
INC takes the first thing (3) and incs it, putting back 4

if the stack is able to .. update memory, then that could work? hm.

kinds of things on the stack:
a ref
a 'call' instruction i guess
a 'force' instruction prolly

instructions:
-

EHG what if the executor could be sophisticated? seems like it ought to be able to be such.
let's do that for now.

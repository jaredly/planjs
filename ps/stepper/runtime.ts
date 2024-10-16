type ptr = number;
type MValue =
    | { type: 'NAT'; v: bigint }
    | { type: 'APP'; f: ptr; x: ptr; ev: boolean }
    | { type: 'PIN'; v: ptr }
    | { type: 'LAW'; v: bigint };

export type Memory = {
    stack: { ptr: ptr; child?: boolean }[];
    heap: MValue[];
};

const example: Memory = {
    stack: [{ ptr: 2 }],
    heap: [
        { type: 'NAT', v: 1n },
        { type: 'NAT', v: 10n },
        { type: 'APP', f: 0, x: 1, ev: false },
    ],
};

const ex2: Memory = {
    stack: [{ ptr: 3 }],
    heap: [
        { type: 'NAT', v: 3n },
        { type: 'PIN', v: 0 },
        { type: 'NAT', v: 10n },
        { type: 'APP', f: 1, x: 2, ev: false },
    ],
};
/*

hrmmm ok so what iff

so using the stack, we'll want to be like ... gathering
arguments for whatever we're going to call, right.
pushing them on to the stack as we traverse down.
...
and then we pop a bunch of things off, at some point.
hmmmm.
this is a bit interesting.




top of stack is at 3
it's an unevaluated APP
we need to evaluate f
so we ... push it on the stack prolly?

[3, 1]
now we see that 1 doesn't need any help, and pop it from the stack.
at this point ... ok so we need some info about the
current thing under inspection. like "have we processed the children".


*/

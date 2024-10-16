import { keyForLoc, Loc } from 'j3/one-world/shared/nodes';
import { AST } from '../../web/types';
import { OPS } from '../../runtime/types';
import { findFree } from '../../web/astToValue';
import { asciiToNat, natToAscii } from '../../runtime/natToAscii';
// import equal from 'fast-deep-equal';

type ptr = number;
type Ref =
    | { type: 'STACK'; v: number }
    | { type: 'PIN'; v: ptr }
    | { type: 'LOCAL'; v: ptr };

type MValue =
    | { type: 'NAT'; v: bigint }
    | { type: 'APP'; f: Ref; x: Ref; ev: boolean }
    // | { type: 'REF'; ref: Ref }
    | { type: 'LAW'; v: bigint };

export type Memory = {
    // top at 0
    stack: { at: ptr; ret: ptr }[];
    heap: MValue[];
    laws: Record<
        string,
        {
            buffer: MValue[];
            arity: number;
        }
    >;
};

/*
so there's a stack and a heap

the stack grows...
and as we're digging into like (INC (INC 2))

we have
0: 2
1: INC @0
2: INC @1

so we do a 'inc', which requires
that we force the value passed to it.

hmm so different example

(def main ((plus 2) 3))

we have, ... on the HEAP:
0: 3
1: 2
2: LAW(plus)
3: pin@2 @1
4: @3 @0

but on the stack we have:

0: H@4

because no lets, no arguments
so we look at 4, and we need to like, resolve the first argument.
but first we push the other argument onto the stack?

0: H@4
[frame idk]
1: @0
2: call(?)
3: @3

hmmmmmmmmmmmmmmmmmmmmm does this mean I actually
want to convert this like into a stack-based language?
would that make things ... simpler?


*/

export const step = (memory: Memory) => {
    const { at, ret } = memory.stack[0];
    const v = memory.heap[at];
    switch (v.type) {
        case 'NAT':
        case 'LAW':
            return memory.stack.shift();
        case 'APP': {
        }
    }
};

export const stepToCompletion = (memory: Memory) => {};

const equal = (one: MValue, two: MValue) => {
    // console.log('eq', one, two, one.v === two.v);
    if (one.type !== two.type) return false;
    if (one.type === 'NAT' && two.type === 'NAT') {
        return one.v === two.v;
    }
    return false;
};

export const showRef = (v: Ref) => {
    switch (v.type) {
        case 'LOCAL':
            return `local@${v.v}`;
        case 'PIN':
            return `pin@${v.v}`;
        case 'STACK':
            return `stack#${v.v}`;
    }
};
export const showMValue = (v: MValue) => {
    switch (v.type) {
        // case 'PIN':
        //     return `PIN(@${v.v})`;
        case 'LAW':
            return `LAW(${natToAscii(v.v)})`;
        case 'APP':
            return `APP(${showRef(v.f)}, ${showRef(v.x)}${
                v.ev ? '' : ', lazy'
            })`;
        case 'NAT':
            return v.v + '';
        // case 'STACK':
        //     return `local@${v.idx}`;
    }
};

// const example: Memory = {
//     stack: [{ ptr: 2 }],
//     laws: {},
//     heap: [
//         { type: 'NAT', v: 1n },
//         { type: 'NAT', v: 10n },
//         { type: 'APP', f: 0, x: 1, ev: false },
//     ],
// };

// const ex2: Memory = {
//     stack: [{ ptr: 3 }],
//     laws: {},
//     heap: [
//         { type: 'NAT', v: 3n },
//         { type: 'PIN', v: 0 },
//         { type: 'NAT', v: 10n },
//         { type: 'APP', f: 1, x: 2, ev: false },
//     ],
// };

type Ctx = {
    processLaw(
        lawNum: number,
        name: { text: string; loc: Loc } | undefined,
        args: string[],
        lets: { name: string; value: AST }[],
        value: AST,
        dest?: number,
    ): ptr;
    locPin: (loc: Loc, dest?: number) => Ref;
    lawNum: { v: number };
    alloc(v: MValue, dest?: number): ptr;
    pin(v: MValue): Ref;
};

/*
memory layout of a LAW

{LAW header, name, arity, stack size}
{let1} // just the root!
{let2} // just the root!
{let3} // just the root!
... heap from lets
... heap from 'return value'
{root of the return value}

BECAUSE we're going to have to
/copy/ things onto the heap,
when we "call" a function.
going through and replacing `STACK`s
with the proper pointers.
and it'll be nice to be able to just say
`STACK` becomes `heap-top + idx`

*/

export const stackMain = (tops: AST[]) => {
    const memory: Memory = {
        heap: [],
        stack: [],
        laws: {},
    };
    const locPos: Record<string, ptr> = {};

    const alloc = (v: MValue, dest?: number): ptr => {
        if (dest != null) {
            memory.heap[dest] = v;
            return dest;
        }
        memory.heap.push(v);
        return memory.heap.length - 1;
    };

    tops.forEach((top) => {
        if (top.type === 'law' && top.name) {
            locPos[keyForLoc(top.name.loc)] = alloc({ type: 'NAT', v: 0n });
        }
    });

    const pins: { value: MValue; ptr: ptr }[] = [];
    // const laws: Record<
    //     string,
    //     {
    //         args: string[];
    //         lets: { name: string; value: ptr }[];
    //         value: ptr;
    //     }
    // > = {};

    const ctxFor = (buffer: MValue[], base: string, lawNum: { v: number }) => {
        const ctx: Ctx = {
            processLaw(fns, name, args, lets, value, dest) {
                const id = fns === 0 ? base : `${base}_${fns}`;
                memory.laws[id] = allocLaw(id, args, lets, value, lawNum);
                if (name) {
                    const ptr = locPos[keyForLoc(name.loc)];
                    memory.heap[ptr] = { type: 'LAW', v: asciiToNat(id) };
                    return ptr;
                }
                return alloc({ type: 'LAW', v: asciiToNat(id) }, dest);
            },
            alloc(v, dest) {
                if (dest != null) {
                    memory.heap[dest] = v;
                    return dest;
                }
                buffer.push(v);
                return buffer.length - 1;
            },
            lawNum,
            locPin(loc) {
                const k = keyForLoc(loc);
                if (locPos[k] == null) throw new Error(`unknown loc pin ${k}`);
                return { type: 'PIN', v: locPos[k] };
            },
            pin(v) {
                const found = pins.find((f) => equal(f.value, v));
                if (found) return { type: 'PIN', v: found.ptr };
                const ptr = alloc(v);
                pins.push({ value: v, ptr });
                return { type: 'PIN', v: ptr };
            },
        };
        return ctx;
    };

    const allocLaw = (
        base: string,
        args: string[],
        lets: { name: string; value: AST }[],
        value: AST,
        lawNum: { v: number },
    ): Memory['laws'][''] => {
        const local: Memory['laws'][''] = {
            arity: args.length,
            buffer: [],
        };
        const ctx = ctxFor(local.buffer, base, lawNum);
        const locals = [base, ...args, ...lets.map((l) => l.name)];

        lets.forEach(({ value }, i) => {
            local.buffer.push({ type: 'NAT', v: 0n });
        });

        lets.forEach(({ value }, i) => {
            mvalueFromAST(value, locals, ctx, i);
        });

        mvalueFromAST(value, locals, ctx);

        return local;
    };

    const ptrs = tops.map((top, i) => {
        let base = (top.type === 'law' && top.name?.text) || `top${i}`;

        return mvalueFromAST(top, [], ctxFor(memory.heap, base, { v: 0 }));
    });
    return { memory, ptrs };
};

export const mvalueFromAST = (
    node: AST,
    locals: string[],
    ctx: Ctx,
    dest?: number,
): Ref => {
    switch (node.type) {
        case 'app': {
            let res = mvalueFromAST(node.target, locals, ctx);
            for (let i = 0; i < node.args.length; i++) {
                res = {
                    type: 'LOCAL',
                    v: ctx.alloc(
                        {
                            type: 'APP',
                            f: res,
                            x: mvalueFromAST(node.args[i], locals, ctx),
                            ev: false,
                        },
                        i === node.args.length - 1 ? dest : undefined,
                    ),
                };
            }
            return res;
        }
        case 'array':
            throw new Error('not yet');
        case 'nat':
            return {
                type: 'LOCAL',
                v: ctx.alloc({ type: 'NAT', v: node.number }, dest),
            };
        case 'builtin':
            const code = OPS[node.name as 'LAW'];
            return ctx.pin({ type: 'NAT', v: BigInt(code) });
        case 'law':
            const name = node.name?.text ?? 'self';
            const fnLocals = [
                name,
                ...node.args,
                ...node.lets.map((l) => l.name),
            ];
            let extraArgs: string[] = [];
            findFree(node.body, fnLocals, extraArgs);
            // assume everything else is global
            extraArgs = extraArgs.filter((f) => locals.includes(f));
            // const args = [name, ...extraArgs, ...node.args];
            // const allLocals = args.concat(node.lets.map((l) => l.name));
            // console.log('law', args, allLocals, extraArgs);
            let fn = ctx.lawNum.v++;
            let res: Ref = {
                type: 'PIN',
                v: ctx.processLaw(
                    fn,
                    node.name,
                    [...extraArgs, ...node.args],
                    node.lets,
                    // node.lets.map((l) => ({
                    //     name: l.name,
                    //     value: mvalueFromAST(l.value, allLocals, ctx),
                    // })),
                    node.body,
                    // mvalueFromAST(node.body, allLocals, ctx),
                    !extraArgs.length ? dest : undefined,
                ),
            };
            for (let i = 0; i < extraArgs.length; i++) {
                const arg = extraArgs[i];
                if (locals.indexOf(arg) === -1)
                    throw new Error(`unbound free vbl ${arg}`);
                res = {
                    type: 'LOCAL',
                    v: ctx.alloc(
                        {
                            type: 'APP',
                            f: res,
                            x: {
                                type: 'STACK',
                                v: locals.indexOf(arg),
                            },
                            ev: false,
                        },
                        i === extraArgs.length - 1 ? dest : undefined,
                    ),
                };
            }
            return res;
        case 'local':
            const at = locals.indexOf(node.name);
            if (at === -1) {
                // console.log('n', locals);
                throw new Error(`unbound local ${node.name}`);
                // return node.name;
            }
            return { type: 'STACK', v: at };
        case 'string':
            if (node.templates.length) throw new Error('not supported tpl yet');
            return {
                type: 'LOCAL',
                v: ctx.alloc({ type: 'NAT', v: asciiToNat(node.first) }, dest),
            };
        case 'pin':
            return ctx.locPin(node.ref, dest);
    }
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

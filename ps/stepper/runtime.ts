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
    | { type: 'REF'; ref: Ref }
    | { type: 'LAW'; v: bigint };
type NotRef = Exclude<MValue, { type: 'REF' }>;

export type Memory = {
    // top at 0
    stack: { at: ptr; step?: 'f' | 'x' }[];
    heap: MValue[];
    laws: Record<
        string,
        {
            buffer: MValue[];
            arity: number;
        }
    >;
};

export const prepareLaw = (
    buffer: MValue[],
    args: Ref[],
    p0: number,
): MValue[] => {
    const modRef = (ref: Ref): Ref => {
        switch (ref.type) {
            case 'PIN':
                return ref;
            case 'LOCAL':
                return { type: 'LOCAL', v: p0 + ref.v };
            case 'STACK':
                if (ref.v === 0) throw new Error('self sry');
                if (ref.v <= args.length) {
                    return args[ref.v - 1];
                }
                return { type: 'LOCAL', v: p0 + ref.v - args.length - 1 };
        }
    };

    return buffer.map((value) => {
        switch (value.type) {
            case 'NAT':
            case 'LAW':
                return value;
            case 'REF':
                return { type: 'REF', ref: modRef(value.ref) };
            case 'APP':
                return {
                    type: 'APP',
                    f: modRef(value.f),
                    x: modRef(value.x),
                    ev: false,
                };
        }
    });
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

// export const resolve = (memory: Memory, ref: Ref) => {
//     switch (ref.type) {
//         case 'LOCAL':
//             return memory.heap[ref.v]
//     }
// }

const unwrap = (memory: Memory, ref: Ref): null | [Ref, Ref[]] => {
    const v = memory.heap[ref.v];
    if (v.type === 'APP') {
        const inner = unwrap(memory, v.f);
        if (!inner) return null;
        const [f, args] = inner;
        args.push(v.x);
        return [f, args];
    }
    if (v.type === 'NAT' && ref.type !== 'PIN') {
        return null; // can't apply a non-pinned nat
    }
    return [ref, []];
};

export const nat = (memory: Memory, ref: Ref): null | bigint => {
    const v = getValue(memory, ref.v);
    if (v.type === 'NAT') return v.v;
    if (v.type === 'LAW') return 0n;
    return v.ev ? 0n : null;
};

const nextDeep = (memory: Memory, dest: number): number | void => {
    const v = getValue(memory, dest);
    if (v.type !== 'APP') return;
    if (!v.ev) return dest;
    return nextDeep(memory, v.f.v) ?? nextDeep(memory, v.x.v);
};

export const deep = (memory: Memory, dest: number) => {
    const next = nextDeep(memory, dest);
    if (next == null) return;
    memory.stack.push({ at: next });
    return true;
};

export const alloc = (memory: Memory, value: MValue) => {
    memory.heap.push(value);
    return memory.heap.length - 1;
};

export const getValue = (memory: Memory, at: number): NotRef => {
    let v = memory.heap[at];
    if (v.type === 'REF') {
        return getValue(memory, v.ref.v);
    }
    return v;
};

export const step = (memory: Memory) => {
    const frame = memory.stack[0];
    const v = getValue(memory, frame.at);
    switch (v.type) {
        case 'NAT':
        case 'LAW':
            memory.stack.shift();
            return;
        // throw new Error('idk')
        case 'APP': {
            if (frame.step === null) {
                frame.step = 'f';
                memory.stack.unshift({ at: v.f.v });
                return;
            }
            v.ev = true;
            memory.stack.shift();
            const inner = unwrap(memory, v.f);
            if (!inner) {
                return;
            }
            const [f, args] = inner;
            const fv = getValue(memory, f.v);
            if (fv.type === 'APP') {
                return;
            }
            args.push(v.x);
            if (fv.type === 'NAT') {
                if (f.type === 'PIN') {
                    switch (fv.v) {
                        case 0n: // LAW
                            throw new Error('op law not sup');
                        case 1n: // PCASE
                            throw new Error('op pcase not sup');
                        case 2n: // NCASE
                            if (args.length === 3) {
                                const n = nat(memory, args[2]);
                                if (n == null) {
                                    // needs eval
                                    v.ev = false;
                                    memory.stack.unshift(frame);
                                    frame.step = 'x';
                                    memory.stack.unshift({
                                        at: args[2].v,
                                    });
                                    return;
                                }
                                if (n === 0n) {
                                    memory.stack.unshift({ at: frame.at });
                                    memory.heap[frame.at] = {
                                        type: 'REF',
                                        ref: args[0],
                                    };
                                } else {
                                    memory.stack.unshift({ at: frame.at });
                                    memory.heap[frame.at] = {
                                        type: 'APP',
                                        ev: false,
                                        f: args[1],
                                        x: {
                                            type: 'LOCAL',
                                            v: alloc(memory, {
                                                type: 'NAT',
                                                v: n - 1n,
                                            }),
                                        },
                                    };
                                }
                                return;
                            }
                        case 3n: // INC
                            if (args.length === 1) {
                                const n = nat(memory, args[0]);
                                if (n == null) {
                                    // needs eval
                                    v.ev = false;
                                    memory.stack.unshift(frame);
                                    frame.step = 'x';
                                    memory.stack.unshift({
                                        at: args[0].v,
                                    });
                                    return;
                                }
                                memory.heap[frame.at] = {
                                    type: 'NAT',
                                    v: n + 1n,
                                };
                                return;
                            } else {
                                return;
                            }
                        case 4n: // PIN
                            throw new Error('op pin not sup');
                    }
                    return;
                } else {
                    return;
                }
            }

            // OK SO here's where we get a little fancy
            // because we take the law's heap
            // and we dump it onto the heap
            // and then ... like ... add a frame pointer ...
            const law = memory.laws[natToAscii(fv.v)];
            if (args.length !== law.arity) {
                return; // not gonna
            }

            const nvs = prepareLaw(law.buffer, args, memory.heap.length);
            memory.heap[frame.at] = nvs.pop()!;
            memory.heap.push(...nvs);
            memory.stack.push({ at: frame.at });
            return;
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

const unwrapV = (r: Ref, memory: Memory, res: MValue[]) => {
    const v = getValue(memory, r.v);
    if (v.type === 'APP' && v.ev) {
        unwrapV(v.f, memory, res);
        res.push(getValue(memory, v.x.v));
    } else {
        res.push(v);
    }
};

export const prettyMValue = (v: MValue, memory: Memory): string => {
    switch (v.type) {
        case 'REF':
            return prettyMValue(getValue(memory, v.ref.v), memory);
        case 'LAW':
            return natToAscii(v.v);
        case 'APP':
            const args: MValue[] = [];
            unwrapV(v.f, memory, args);
            args.push(getValue(memory, v.x.v));
            // const f = prettyMValue(memory.heap[v.f.v], memory);
            // const x = prettyMValue(, memory);
            // return `APP(${f}, ${x}${v.ev ? '' : ', lazy'})`;
            const inner = args.map((v) => prettyMValue(v, memory)).join(', ');
            return v.ev ? `(${inner})` : `{${inner}}`;
        case 'NAT':
            return v.v + '';
    }
};

export const showMValue = (v: MValue) => {
    switch (v.type) {
        // case 'PIN':
        //     return `PIN(@${v.v})`;
        case 'REF':
            return `REF(${showRef(v.ref)})`;
        case 'LAW':
            return `LAW(${natToAscii(v.v)})`;
        case 'APP':
            if (v.ev) {
                return `APP(${showRef(v.f)}, ${showRef(v.x)})`;
            }
            return `APP{${showRef(v.f)}, ${showRef(v.x)}}`;
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

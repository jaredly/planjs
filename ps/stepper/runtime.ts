import { showMValue } from './showMValue';
import { MValue, Memory, Ref, NotRef } from './types';
export const showHeap = (heap: MValue[], i0 = 0) =>
    heap
        .map(
            (x, i) =>
                `${(i + i0).toString().padStart(2, ' ')}: ${showMValue(x)}`,
        )
        .join('\n');

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

export const unwrap = (memory: Memory, ref: Ref): null | [Ref, Ref[]] => {
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

export const evaluated = (memory: Memory, ref: Ref): null | NotRef => {
    const v = getValue(memory, ref.v);
    if (v.type === 'NAT') return v;
    if (v.type === 'LAW') return v;
    return v.ev ? v : null;
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
    memory.stack.push({ at: next, reason: `next deep for ${dest}` });
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

import { Loc } from 'j3/one-world/shared/nodes';

// import equal from 'fast-deep-equal';
export type ptr = number;
export type Ref =
    | { type: 'STACK'; v: number; loc?: Loc }
    | { type: 'PIN'; v: ptr; loc?: Loc }
    | { type: 'LOCAL'; v: ptr; loc?: Loc };

export type MValue =
    | { type: 'NAT'; v: bigint; loc?: Loc }
    | { type: 'APP'; f: Ref; x: Ref; ev: boolean; loc?: Loc }
    | { type: 'REF'; ref: Ref; loc?: Loc }
    | { type: 'LAW'; v: bigint; loc?: Loc };
export type NotRef = Exclude<MValue, { type: 'REF' }>;

export type Memory = {
    // top at 0
    stack: { at: ptr; step?: 'f' | 'x'; reason: string }[];
    heap: MValue[];
    laws: Record<
        string,
        {
            buffer: MValue[];
            arity: number;
        }
    >;
};

export const cloneMemory = (mem: Memory) => {
    const cloned = { ...mem };
    cloned.laws = { ...cloned.laws };
    cloned.stack = mem.stack.map((s) => ({ ...s }));
    cloned.heap = cloned.heap
        .slice()
        .map((v) => (v.type === 'APP' ? { ...v } : v));
    return cloned;
};

export const liveHeap = (memory: Memory, dest: number) => {
    const seen: Record<number, true> = {};
    const visit = (ptr: ptr) => {
        if (seen[ptr]) return;
        seen[ptr] = true;
        const at = memory.heap[ptr];
        switch (at.type) {
            case 'APP':
                visit(at.f.v);
                visit(at.x.v);
                return;
            case 'REF':
                visit(at.ref.v);
                return;
        }
    };
    visit(dest);

    Object.values(memory.laws).forEach((law) => {
        law.buffer.forEach((v) => {
            if (v.type === 'REF') {
                if (v.ref.type === 'PIN') {
                    seen[v.ref.v] = true;
                }
            }
            if (v.type === 'APP') {
                if (v.f.type === 'PIN') {
                    seen[v.f.v] = true;
                }
                if (v.x.type === 'PIN') {
                    seen[v.x.v] = true;
                }
            }
        });
    });

    return memory.heap
        .map((value, i) => ({ value, i }))
        .filter((v) => seen[v.i]);
};

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

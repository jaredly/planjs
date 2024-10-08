// Constants up here
type tPIN = 0;
type tLAW = 1;
type tAPP = 2;
type tNAT = 3;
type tREF = 4;
type nat = bigint;
// immadiate (not lazy)
export type IVal = {
    v: [tPIN, Val] | [tLAW, nat, nat, Val] | [tAPP, Val, Val] | [tNAT, nat];
};
export type Val = { v: IVal['v'] | [tREF, Val[], bigint] };
export type AppVal = { v: [tAPP, Val, Val] };

export const PIN: tPIN = 0;
export const LAW: tLAW = 1;
export const APP: tAPP = 2;
export const NAT: tNAT = 3;
export const REF: tREF = 4;

export const OPS = {
    LAW: 0,
    PCASE: 1,
    NCASE: 2,
    INC: 3,
    PIN: 4,
} as const;

export const OPNAMES: Record<number, string> = {};
Object.entries(OPS).forEach(([name, val]) => (OPNAMES[val] = name));

export type OPCODE = (typeof OPS)[keyof typeof OPS];
export const opArity: Record<OPCODE, number> = {
    [OPS.PIN]: 1,
    [OPS.LAW]: 3,
    [OPS.INC]: 1,
    [OPS.NCASE]: 3,
    [OPS.PCASE]: 5,
};

import { natToAscii } from '../../runtime/natToAscii';
import { getValue } from './runtime';
import { MValue, Ref, Memory } from './types';

export const equal = (one: MValue, two: MValue) => {
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
const unwrapV = (r: Ref, memory: Memory, res: string[]) => {
    const v = getValue(memory, r.v);
    if (v.type === 'APP' && v.ev) {
        unwrapV(v.f, memory, res);
        res.push(prettyMValue(getValue(memory, v.x.v), memory));
    } else {
        if (r.type === 'PIN') {
            if (v.type === 'NAT') {
                switch (v.v) {
                    case 0n: // LAW
                        return res.push('LAW');
                    case 1n:
                        return res.push('PCASE');
                    case 2n:
                        return res.push('NCASE');
                    case 3n:
                        return res.push('INC');
                    case 4n:
                        return res.push('PIN');
                }
            }
            res.push(`<${prettyMValue(v, memory)}>`);
        } else {
            res.push(prettyMValue(v, memory));
        }
    }
};
const getList = (memory: Memory, ref: Ref, lst: bigint[]) => {
    const v = getValue(memory, ref.v);
    if (v.type === 'APP') {
        const f = getValue(memory, v.f.v);
        if (f.type === 'NAT') {
            lst.push(f.v);
            getList(memory, v.x, lst);
        }
    } else if (v.type === 'NAT') {
        lst.push(v.v);
    }
};

export const prettyMValue = (
    v: MValue,
    memory: Memory,
    trail: MValue[] = [],
): string => {
    if (trail.includes(v)) return `...recurse`;
    trail = [...trail, v];
    switch (v.type) {
        case 'REF':
            return prettyMValue(getValue(memory, v.ref.v), memory, trail);
        case 'LAW':
            return natToAscii(v.v);
        case 'APP':
            const f = getValue(memory, v.f.v);
            if (f.type === 'NAT') {
                const lst: bigint[] = [f.v];
                getList(memory, v.x, lst);
                return `[${lst.join(' ')}]`;
            }

            const args: string[] = [];
            unwrapV(v.f, memory, args);
            args.push(prettyMValue(getValue(memory, v.x.v), memory, trail));
            const inner = args.join(' ');
            return v.ev ? `(${inner})` : `{${inner}}`;
        case 'NAT':
            return v.v + '';
    }
};

export const showMValue = (v: MValue) => {
    if (!v) return `<MISSING>`;
    switch (v.type) {
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
    }
};

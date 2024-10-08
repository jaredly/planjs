import { readFileSync } from 'fs';
import { readTop } from './readTop';
import { APP, OPS, asciiToNat, LAW, NAT, Val, PIN, APPS } from '../runtime';

export type Sexp = string | Sexp[];

// export type Top = {
//     type: 'def',
//     name: string,
// }

const named: Record<string, Val> = {};

export const parseTop = (top: Sexp) => {
    if (typeof top === 'string') {
        return parse(top, null);
    }
    if (
        top.length === 4 &&
        top[0] === 'defn' &&
        typeof top[1] === 'string' &&
        Array.isArray(top[2])
    ) {
        const args: string[] = [top[1]];
        top[2].forEach((item) => {
            if (typeof item === 'string') {
                args.push(item);
            } else {
                throw new Error(`arg must be string`);
            }
        });
        const body = parse(top[3], args);
        named[top[1]] = [LAW, asciiToNat(top[1]), BigInt(args.length), body];
        return;
    }
    if (top.length === 3 && top[0] === 'def' && typeof top[1] === 'string') {
        named[top[1]] = [LAW, asciiToNat(top[1]), 0n, parse(top[2], [top[1]])];
        return;
    }
    throw new Error(`canot parse top ${JSON.stringify(top)}`);
};

const parse = (item: Sexp, args: null | string[]): Val => {
    if (typeof item === 'string') {
        const n = Number(item);
        if (Number.isInteger(n)) {
            if (args != null) {
                // law-const
                return [APP, [NAT, 2n], [NAT, BigInt(n)]];
            } else {
                return [NAT, BigInt(n)];
            }
        }
        if (args != null) {
            const idx = args.indexOf(item);
            // law-ref
            if (idx !== -1) return [NAT, BigInt(idx)];
        }
        if (named[item]) {
            if (args) {
                return [APP, [NAT, 2n], named[item]];
            }
            return named[item];
        }
        if (OPS[item as 'LAW']) {
            return [PIN, [NAT, BigInt(OPS[item as 'LAW'])]];
        }
        throw new Error(`undefined ref ${item}`);
    }

    if (item[0] === 'fn' && Array.isArray(item[1])) {
        const args: string[] = ['-self-'];
        item[1].forEach((item) => {
            if (typeof item === 'string') {
                args.push(item);
            } else {
                throw new Error(`arg must be string`);
            }
        });
        // TODO: scoping, need to wrap if used.
        return [LAW, 0n, BigInt(args.length), parse(item[2], args)];
    }

    const first = parse(item[0], args);
    return APPS(first, ...item.slice(1).map((item) => parse(item, args)));
};

const [_, __, fname] = process.argv;
const tops = readTop(readFileSync(fname, 'utf8'));
console.log(tops);
tops.map(parseTop);

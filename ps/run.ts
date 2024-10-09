import { readFileSync } from 'fs';
import { readTop } from './readTop';
import {
    APP,
    OPS,
    asciiToNat,
    LAW,
    NAT,
    Val,
    PIN,
    APPS,
    Force,
} from '../runtime';
import { parse as parseNice, showNice } from '../pst';

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
        // console.log('def', top[1]);
        const args: string[] = [top[1]];
        top[2].forEach((item) => {
            if (typeof item === 'string') {
                args.push(item);
            } else {
                throw new Error(`arg must be string`);
            }
        });
        let needed: string[] = [];
        free(top[3], args, needed);
        needed = needed.filter((n) => !named[n] && !OPS[n as 'LAW']);
        // if (needed.length) {
        //     throw new Error(`undefined variables in toplevel: ${needed}`);
        // }
        const body = parse(top[3], args);
        named[top[1]] = [
            PIN,
            [LAW, asciiToNat(top[1]), BigInt(top[2].length), body],
        ];
        return;
    }
    if (top.length === 3 && top[0] === 'def' && typeof top[1] === 'string') {
        named[top[1]] = [
            PIN,
            [LAW, asciiToNat(top[1]), 0n, parse(top[2], [top[1]])],
        ];
        return;
    }
    throw new Error(`canot parse top ${JSON.stringify(top)}`);
};

export const free = (v: Sexp, scope: string[], vbls: string[]) => {
    if (typeof v === 'string') {
        if (!scope.includes(v) && !vbls.includes(v)) {
            vbls.push(v);
        }
        return;
    }
    if (v[0] === 'fn' && Array.isArray(v[1])) {
        scope = scope.slice();
        v[1].forEach((n) => {
            if (typeof n === 'string') {
                scope.push(n);
            }
        });
        free(v[2], scope, vbls);
        return;
    }
    if (v[0] === 'let' && v.length === 3 && Array.isArray(v[1])) {
        for (let i = 0; i < v[1].length; i += 2) {
            const name = v[1][i];
            if (typeof name === 'string') {
                scope.push(name);
            }
        }
    }
    v.forEach((v) => free(v, scope, vbls));
};

const law_const = (v: Val): Val => [APP, [NAT, 2n], v];

const lapps = (inLaw: boolean, ...items: Val[]): Val => {
    if (inLaw) {
        let target = items[0];
        for (let i = 1; i < items.length; i++) {
            target = [APP, [APP, [NAT, 0n], target], items[i]];
        }
        return target;
    } else {
        return APPS(items[0], ...items.slice(1));
    }
};

const parse = (item: Sexp, args: null | string[]): Val => {
    if (typeof item === 'string') {
        if (item[0] === '$') {
            const n = Number(item.slice(1));
            if (Number.isInteger(n)) {
                return [NAT, BigInt(n)];
            }
        }
        const n = Number(item);
        if (Number.isInteger(n)) {
            if (args != null) {
                // law-const
                return law_const([NAT, BigInt(n)]);
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
                const got = named[item];
                // if (got[0] === APP && got[1][0] === NAT) {
                return law_const(named[item]);
                // }
            }
            return named[item];
        }
        if (OPS[item as 'LAW']) {
            return [PIN, [NAT, BigInt(OPS[item as 'LAW'])]];
        }
        throw new Error(`undefined ref ${item}`);
    }

    if (item[0] === 'let' && item.length === 3 && Array.isArray(item[1])) {
        if (!args) throw new Error(`can't have a let outside of a law`);
        let bindings = item[1].slice();
        let body = item[2];
        const next = (): Val => {
            if (bindings.length < 2) {
                if (bindings.length === 1) {
                    throw new Error(`dangling entry in let binding list`);
                }
                return parse(body, args);
            }
            const name = bindings.shift()!;
            const value = bindings.shift()!;
            if (typeof name !== 'string') {
                throw new Error(`let binding must be a string`);
            }
            // if (args.includes(name)) {
            //     throw new Error(
            //         `variable shadowing not allowed: ${name} is already bound`,
            //     );
            // }
            // args.push(name);
            return APPS(1, parse(value, args), next());
        };

        // const pairs = []
        // return APPS(1, parse(item[1], args), parse(item[2], args));
        return next();
    }

    if (item[0] === 'fn' && Array.isArray(item[1])) {
        const innerArgs: string[] = ['-self-'];
        item[1].forEach((item) => {
            if (typeof item === 'string') {
                innerArgs.push(item);
            } else {
                throw new Error(`arg must be string`);
            }
        });
        let ln = item[1].length;
        if (!args) {
            const body = parse(item[2], innerArgs);
            return [LAW, 0n, BigInt(ln), body];
        }
        let needed: string[] = [];
        free(item[2], innerArgs, needed);
        needed = needed.filter(
            (n) => args.includes(n) && !named[n] && !OPS[n as 'LAW'],
        );
        // console.log('needed', needed); //, item[2]);

        if (needed.length) {
            innerArgs.splice(1, 0, ...needed);
            ln += needed.length;
        }

        const body = parse(item[2], innerArgs);
        // TODO: scoping, need to wrap if used.
        const law: Val = [LAW, 0n, BigInt(ln), body];
        if (needed.length) {
            return lapps(
                args != null,
                law,
                ...needed.map((n): Val => [NAT, BigInt(args.indexOf(n))]),
            );
        }
        return law;
    }

    const first = parse(item[0], args);
    return lapps(
        args != null,
        first,
        ...item.slice(1).map((item) => parse(item, args)),
    );
};

const [_, __, fname, ...args] = process.argv;
const tops = readTop(readFileSync(fname, 'utf8'));
// console.log(tops);
tops.forEach(parseTop);
// console.log('nice', showNice(Force(named.main)));
// Object.entries(named).forEach(([name, v]) => {
//     console.log(name, v);
// });

if (args.length) {
    console.log(
        showNice(
            Force(APPS(named.main, ...args.map((a): Val => [NAT, BigInt(+a)]))),
            // true,
        ),
    );
}

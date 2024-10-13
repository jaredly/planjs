import { asciiToNat } from '../runtime/natToAscii';
import { Val, OPS, PIN, LAW, APP, NAT, APPS } from '../runtime/types';
import { readTop } from './readTop';

export type Sexp = string | { kind: '(' | '[' | '{'; items: Sexp[] };
// export type Top = {
//     type: 'def',
//     name: string,
// }
// export const named: Record<string, Val> = {};

export const parseTop = (value: Sexp, named: Record<string, Val>) => {
    if (typeof value === 'string') {
        return parse(value, null, named);
    }
    const top = value.items;
    if (
        top.length === 4 &&
        top[0] === 'defn' &&
        typeof top[1] === 'string' &&
        typeof top[2] === 'object'
    ) {
        // console.log('def', top[1]);
        const args: string[] = [top[1]];
        top[2].items.forEach((item) => {
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
        const body = parse(top[3], { args, name: top[1], lcount: 0 }, named);
        named[top[1]] = {
            v: [
                PIN,
                {
                    v: [
                        LAW,
                        asciiToNat(top[1]),
                        BigInt(top[2].items.length),
                        body,
                    ],
                },
            ],
        };
        return;
    }
    if (top.length === 3 && top[0] === 'def' && typeof top[1] === 'string') {
        const args: string[] = [top[1]];
        let needed: string[] = [];
        free(top[2], args, needed);
        needed = needed.filter((n) => !named[n] && !OPS[n as 'LAW']);

        named[top[1]] = {
            v: [
                PIN,
                {
                    v: [
                        LAW,
                        asciiToNat(top[1]),
                        0n,
                        parse(top[2], { args, name: top[1], lcount: 0 }, named),
                    ],
                },
            ],
        };
        return;
    }
    throw new Error(`canot parse top ${JSON.stringify(value)}`);
};

export const free = (value: Sexp, scope: string[], vbls: string[]) => {
    if (typeof value === 'string') {
        if (!scope.includes(value) && !vbls.includes(value)) {
            vbls.push(value);
        }
        return;
    }
    const v = value.items;
    if (v[0] === 'fn' && typeof v[1] === 'object' && v[1].kind === '[') {
        scope = scope.slice();
        v[1].items.forEach((n) => {
            if (typeof n === 'string') {
                scope.push(n);
            }
        });
        free(v[2], scope, vbls);
        return;
    }
    if (
        v[0] === 'let' &&
        v.length === 3 &&
        typeof v[1] === 'object' &&
        v[1].kind === '['
    ) {
        for (let i = 0; i < v[1].items.length; i += 2) {
            const name = v[1].items[i];
            if (typeof name === 'string') {
                scope.push(name);
            }
        }
    }
    v.forEach((v) => free(v, scope, vbls));
};
const law_const = (v: Val): Val => ({ v: [APP, { v: [NAT, 2n] }, v] });
const lapps = (inLaw: boolean, ...items: Val[]): Val => {
    if (inLaw) {
        let target = items[0];
        for (let i = 1; i < items.length; i++) {
            target = {
                v: [APP, { v: [APP, { v: [NAT, 0n] }, target] }, items[i]],
            };
        }
        return target;
    } else {
        return APPS(items[0], ...items.slice(1));
    }
};
const parse = (
    item: Sexp,
    parent: null | { args: string[]; name: string; lcount: number },
    named: Record<string, Val>,
): Val => {
    if (typeof item === 'string') {
        if (item[0] === '$') {
            const n = Number(item.slice(1));
            if (Number.isInteger(n)) {
                return { v: [NAT, BigInt(n)] };
            }
        }
        const n = Number(item);
        if (Number.isInteger(n)) {
            if (parent != null) {
                // law-const
                return law_const({ v: [NAT, BigInt(n)] });
            } else {
                return { v: [NAT, BigInt(n)] };
            }
        }
        if (parent != null) {
            const idx = parent.args.indexOf(item);
            // law-ref
            if (idx !== -1) return { v: [NAT, BigInt(idx)] };
        }
        if (named[item]) {
            if (parent) {
                const got = named[item];
                // if (got[0] === APP && got[1][0] === NAT) {
                return law_const(named[item]);
                // }
            }
            return named[item];
        }
        if (OPS[item as 'LAW']) {
            return { v: [PIN, { v: [NAT, BigInt(OPS[item as 'LAW'])] }] };
        }
        throw new Error(`undefined ref ${item}`);
    }

    const { items } = item;
    if (
        items[0] === 'let' &&
        items.length === 3 &&
        typeof items[1] === 'object'
    ) {
        if (!parent) throw new Error(`can't have a let outside of a law`);
        let bindings = items[1].items.slice();
        let body = items[2];
        const next = (): Val => {
            if (bindings.length < 2) {
                if (bindings.length === 1) {
                    throw new Error(`dangling entry in let binding list`);
                }
                return parse(body, parent, named);
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
            return APPS(1, parse(value, parent, named), next());
        };

        // const pairs = []
        // return APPS(1, parse(item[1], args), parse(item[2], args));
        return next();
    }

    if (
        items[0] === 'fn' &&
        typeof items[1] === 'object' &&
        items[1].kind === '['
    ) {
        const innerArgs: string[] = ['-self-'];
        items[1].items.forEach((items) => {
            if (typeof items === 'string') {
                innerArgs.push(items);
            } else {
                throw new Error(`arg must be string`);
            }
        });
        let ln = items[1].items.length;
        if (!parent) {
            const body = parse(
                items[2],
                {
                    args: innerArgs,
                    name: 'anon',
                    lcount: 0,
                },
                named,
            );
            return { v: [LAW, asciiToNat('anon'), BigInt(ln), body] };
        }
        let needed: string[] = [];
        free(items[2], innerArgs, needed);
        needed = needed.filter(
            (n) => parent.args.includes(n) && !named[n] && !OPS[n as 'LAW'],
        );
        // console.log('needed', needed); //, items[2]);
        if (needed.length) {
            innerArgs.splice(1, 0, ...needed);
            ln += needed.length;
        }

        parent.lcount += 1;
        const name = parent.name + parent.lcount;
        const body = parse(
            items[2],
            {
                args: innerArgs,
                name,
                lcount: 0,
            },
            named,
        );
        // TODO: scoping, need to wrap if used.
        const law: Val = { v: [LAW, asciiToNat(name), BigInt(ln), body] };
        if (needed.length) {
            return lapps(
                parent != null,
                law,
                ...needed.map(
                    (n): Val => ({ v: [NAT, BigInt(parent.args.indexOf(n))] }),
                ),
            );
        }
        return law;
    }

    if (item.kind === '[') {
        return makeList(
            parent != null,
            ...items.map((item) => parse(item, parent, named)),
        );
    }

    return lapps(
        parent != null,
        ...items.map((item) => parse(item, parent, named)),
    );
};

const makeList = (inLaw: boolean, ...items: Val[]): Val => {
    let res = items[items.length - 1];
    for (let i = items.length - 2; i >= 0; i--) {
        if (inLaw) {
            res = {
                v: [APP, { v: [APP, { v: [NAT, 0n] }, items[i]] }, res],
            };
        } else {
            res = { v: [APP, items[i], res] };
        }
    }
    return res;
};

export const getMain = (text: string) => {
    const named: Record<string, Val> = {};
    const tops = readTop(text);
    tops.forEach((t) => parseTop(t, named));
    return named.main;
};

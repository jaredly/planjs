import { readFileSync, writeFileSync } from 'fs';
import { readTop } from './readTop';
import { runtime2 } from '../runtime/runtime2';
import { runtime3 } from '../runtime/runtime3';
// import {roundTrip} from '../runtime/runtime3';
import { APPS } from '../runtime/types';
import { asciiToNat } from '../runtime/natToAscii';
import { APP, OPS, LAW, NAT, Val, PIN } from '../runtime/types';
import { parse as parseNice, showNice } from '../pst';
import { perfMap, reportPerf, showPerf, trackPerf } from '../runtime/perf';

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
        const body = parse(top[3], { args, name: top[1], lcount: 0 });
        named[top[1]] = {
            v: [
                PIN,
                { v: [LAW, asciiToNat(top[1]), BigInt(top[2].length), body] },
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
                        parse(top[2], { args, name: top[1], lcount: 0 }),
                    ],
                },
            ],
        };
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

    if (item[0] === 'let' && item.length === 3 && Array.isArray(item[1])) {
        if (!parent) throw new Error(`can't have a let outside of a law`);
        let bindings = item[1].slice();
        let body = item[2];
        const next = (): Val => {
            if (bindings.length < 2) {
                if (bindings.length === 1) {
                    throw new Error(`dangling entry in let binding list`);
                }
                return parse(body, parent);
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
            return APPS(1, parse(value, parent), next());
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
        if (!parent) {
            const body = parse(item[2], {
                args: innerArgs,
                name: 'anon',
                lcount: 0,
            });
            return { v: [LAW, asciiToNat('anon'), BigInt(ln), body] };
        }
        let needed: string[] = [];
        free(item[2], innerArgs, needed);
        needed = needed.filter(
            (n) => parent.args.includes(n) && !named[n] && !OPS[n as 'LAW'],
        );
        // console.log('needed', needed); //, item[2]);

        if (needed.length) {
            innerArgs.splice(1, 0, ...needed);
            ln += needed.length;
        }

        parent.lcount += 1;
        const name = parent.name + parent.lcount;
        const body = parse(item[2], {
            args: innerArgs,
            name,
            lcount: 0,
        });
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

    const first = parse(item[0], parent);
    return lapps(
        parent != null,
        first,
        ...item.slice(1).map((item) => parse(item, parent)),
    );
};

const usage = `run.ts [opts] fname ...args
opts:
- --runtime=2|3
`;

let [_, __, ...args] = process.argv;

const opts: Record<string, string | boolean> = {};
args = args.filter((arg) => {
    if (arg.startsWith('--')) {
        const [name, value] = arg.slice(2).split('=');
        opts[name] = value ?? true;
        return false;
    }
    return true;
});
const fname = args.shift();

if (!fname) {
    console.log(usage);
    process.exit(1);
}

const rt = (opts['runtime'] ?? opts['r']) === '3' ? runtime3 : runtime2;

// We use the new hotness
rt.setRequireOpPin(true);

const tops = readTop(readFileSync(fname, 'utf8'));
// console.log(tops);
tops.forEach(parseTop);

if (opts['show'] || opts['plan']) {
    console.log(showNice(rt.run(named.main)));
}

// Object.entries(named).forEach(([name, v]) => {
//     console.log(name, v);
// });

trackPerf();
if (args.length) {
    console.log('got arghs', args.length);
    console.log(
        showNice(
            rt.run(
                APPS(
                    named.main,
                    ...args.map((a): Val => ({ v: [NAT, BigInt(+a)] })),
                ),
            ),
        ),
    );
} else {
    console.log('here we are');
    console.log(showNice(rt.run(named.main)));
}
showPerf(reportPerf()!);

const make_chart = false;

if (make_chart) {
    const all: Record<string, number>[] = [];
    const allNames: string[] = [];
    for (let i = 0; i < 15; i++) {
        trackPerf();
        rt.run(
            APPS(
                named.main,
                ...args.map((a): Val => ({ v: [NAT, BigInt(i)] })),
            ),
        );
        const line = perfMap(reportPerf()!);
        all.push(line);
        Object.keys(line).forEach((name) => {
            if (!allNames.includes(name)) {
                allNames.push(name);
            }
        });
    }
    allNames.sort();
    writeFileSync(
        './perf.csv',
        allNames.join(',') +
            '\n' +
            all
                .map((row) => allNames.map((name) => row[name] ?? 0).join(','))
                .join('\n'),
    );
}

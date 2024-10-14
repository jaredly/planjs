import objectHash from 'object-hash';
import { findPins, NVal } from '../../runtime/arraybuffer';
import { APP, LAW, NAT, OPNAMES, PIN, Val } from '../../runtime/types';
import {
    asLaw,
    force,
    forceDeep,
    Immediate,
    Law,
    OP_FNS,
    PINS,
    setLocal,
    show,
    Value,
} from './runtime';
import { asciiToNat, natToAscii } from '../../runtime/natToAscii';
import { RT } from '../../runtime/runtime2';
import { writeFileSync } from 'fs';

const asApp = (v: Value): null | [Value, Value] =>
    typeof v === 'object' && v.length === 3 && v[2].length === 1
        ? [v[1], v[2][0]]
        : null;

// NOTE: Not forcing anything here
// looks like I don't in runtime2 either
const extractLets = (body: Value, lets: Value[]): Value => {
    const top = asApp(body);
    if (!top) return body;
    const next = asApp(top[0]);
    if (!next) return body;
    // (1 v b)
    if (next[0] === 1 || next[0] === 1n) {
        lets.push(next[1]);
        return extractLets(top[1], lets);
    }
    return body;
};

const compileValue = (
    value: Body,
    pinArities: Record<string, number>,
): string => {
    switch (typeof value) {
        case 'bigint':
            return value.toString() + 'n';
        case 'number':
            return value.toString();
        case 'function':
            throw new Error(`bare law please no`);
        case 'string':
            return JSON.stringify(value);
        default:
            if (value.length === 2 && value[0] === 3) {
                if (value[1] === 0) return 'this';
                return `$${value[1]}`;
            }
            maybeCollapse(value, pinArities);
            if (value.length === 3) {
                return `[${value[0]}, ${compileValue(
                    value[1],
                    pinArities,
                )}, [${value[2]
                    .map((v) => compileValue(v, pinArities))
                    .join(', ')}]]`;
            }
            return compileValue(value[1], pinArities);
    }
};

// type Lazy = [0 | 1, Value, [Value, ...Value[]]] | [1, Immediate]; // { lazy: Immediate | App; forced: boolean };
// export type Value = Immediate | Lazy;
// type Immediate = Law | number | bigint | string;
// export type Law = Function & { nameNat: bigint; body: Value };
type BLazy = [0 | 1, Body, [Body, ...Body[]]] | [1, Immediate];
type Body = Immediate | BLazy | [3, number]; /* (ref int) */

const toBody = (value: Value, maxIndex: number): Body => {
    switch (typeof value) {
        case 'bigint':
        case 'number':
            if (value <= maxIndex) {
                return [3, Number(value)];
            }
            return value;
        case 'object':
            const pair = asApp(value);
            if (!pair) return value;
            if (pair[0] === 2 || pair[0] === 2n) return pair[1];
            const inner = asApp(pair[0]);
            if (inner && (inner[0] === 0 || inner[0] === 0n)) {
                return [
                    0,
                    toBody(inner[1], maxIndex),
                    [toBody(pair[1], maxIndex)],
                ];
            }
    }
    return value;
};

// hrmmmmm ok so this needs to happen /after/ translating a BODY to ~normal code.
// which means, we want a BODYAST that we can work on, that shares some similarities
// to the normal AST.
export const maybeCollapse = (
    target: Body,
    pinArities: Record<string, number>,
) => {
    if (1 || typeof target !== 'object' || target[0] || target[2].length > 1)
        return;
    console.log('consider', show(target));
    const trail: { v: BLazy; arg: Body }[] = [];
    let f: Body | Function = target;
    let self: null | Body = null;
    while (true) {
        console.log(`at`, f);
        switch (typeof f) {
            case 'string': {
                // let inner: Value | Function = PINS[f];
                // if (!inner) throw new Error(`unknown pinnn ${f}`);
                // if (inner === 0 || inner === 0n) inner = OP_FNS.LAW;
                // if (inner === 1 || inner === 1n) inner = OP_FNS.PCASE;
                // if (inner === 2 || inner === 2n) inner = OP_FNS.NCASE;
                // if (inner === 3 || inner === 3n) inner = OP_FNS.INC;
                // if (inner === 4 || inner === 4n) inner = OP_FNS.PIN;
                // self = f;
                // f = inner;
                const arity = pinArities[f];
                if (!arity) throw new Error(`unknown pin ${f}`);

                const dest = trail[Math.min(trail.length, arity) - 1];
                dest.v[0] = 0;
                dest.v[1] = f;
                dest.v[2] = trail.slice(0, arity).map((t) => t.arg) as [
                    Value,
                    ...Value[],
                ];

                return;
            }
            case 'function': {
                // if (f.length <= trail.length) {
                const dest = trail[Math.min(trail.length, f.length) - 1];
                dest.v[0] = 0;
                dest.v[1] = self ?? (f as Law);
                dest.v[2] = trail.slice(0, f.length).map((t) => t.arg) as [
                    Value,
                    ...Value[],
                ];
                console.log('here we are', show(dest.v));
                // } else {
                //     console.log(`no need ... less?`)
                // }

                return;
            }
            case 'object':
                if (f[0] === 3) return;
                if (f[0]) {
                    f = f[1];
                    continue;
                }
                if (f[2].length > 1) {
                    console.warn('ignoring possible further-collapsible thing');
                    return;
                }
                trail.unshift({ v: f, arg: f[2][0] });
                f = f[1];
                continue;
            case 'number':
            case 'bigint':
                const dest = trail[trail.length - 1];
                dest.v[0] = 0;
                dest.v[1] = f;
                dest.v[2] = trail.map((t) => t.arg) as [Value, ...Value[]];
                return;
        }
        console.log('and we are come o the end of things', typeof f);
        break;
    }
};

export const compile = (
    name: string,
    arity: number,
    body: Value,
    pinArities: Record<string, number>,
) => {
    if (arity === 0) {
        return compileValue(toBody(body, 0), pinArities);
    }
    const args: string[] = [];
    for (let i = 1; i <= arity; i++) {
        args.push(`$${i}`);
    }
    const lets: Value[] = [];
    const inner = extractLets(body, lets);
    const maxIndex = arity + lets.length;
    const fn = `function ${name} (${args.join(', ')}) {${lets
        .map((_, i) => `\n    const $${i + arity + 1} = [0, -1, [-1]];`)
        .join('')}${lets
        .map(
            (value, i) =>
                `\n    setLocal($${i + arity + 1}, ${compileValue(
                    toBody(value, maxIndex),
                    pinArities,
                )});`,
        )
        .join('')}
    return ${compileValue(toBody(inner, maxIndex), pinArities)};
}`;
    const SIMPLE = true;
    if (SIMPLE) {
        return fn;
    }
    return `asLaw(${fn}, ${asciiToNat(name)}n, ${JSON.stringify(body, (_, v) =>
        typeof v === 'bigint' ? v + 'n' : v,
    )})`;
};

const clean = (name: string) =>
    name
        .replace(/!/g, '$bang')
        .replace(/\+/g, '$pl')
        .replace(/\-/g, '$_')
        .replace(/[^0-9a-zA-Z_$]/g, '_');

const oneVal = (
    val: NVal,
    pins: string[],
    fns: Record<string, string>,
    pinArities: Record<string, number>,
): Value => {
    switch (val.v[0]) {
        case PIN:
            return pins[val.v[1]];
        case LAW:
            const name =
                (val.v[1] > 0 ? clean(natToAscii(val.v[1])) + '_' : '') +
                objectHash(val.v).slice(0, 4);
            pinArities[name] = Number(val.v[2]);
            fns[name] = compile(
                name,
                // natToAscii(val.v[1]),
                Number(val.v[2]),
                oneVal(val.v[3], pins, fns, pinArities),
                pinArities,
            );
            return name;
        case APP:
            return [
                0,
                oneVal(val.v[1], pins, fns, pinArities),
                [oneVal(val.v[2], pins, fns, pinArities)],
            ];
        case NAT:
            return val.v[1];
    }
};

export const compileVal = (val: Val) => {
    const npins: [NVal, Val][] = [];
    const changed = findPins(val, npins);
    const pinArities: Record<string, number> = {
        INC: 1,
        PCASE: 5,
        NCASE: 3,
        LAW: 3,
        PIN: 1,
    };
    const pinHashes = npins.map(([nv, v]) => {
        if (nv.v[0] === NAT && OPNAMES[Number(nv.v[1])]) {
            return OPNAMES[Number(nv.v[1])];
        }
        const hash = objectHash(nv);
        if (nv.v[0] === LAW) {
            const name = clean(natToAscii(nv.v[1])) + '_' + hash.slice(0, 4);
            pinArities[name] = Number(nv.v[2]);
            return name;
        }
        return hash;
    });

    const toplevel: Record<string, string> = {};
    npins.forEach(([nv, _], i) => {
        const hash = pinHashes[i];
        if (nv.v[0] === LAW) {
            toplevel[hash] = compile(
                hash,
                Number(nv.v[2]),
                oneVal(nv.v[3], pinHashes, toplevel, pinArities),
                pinArities,
            );
        } else {
            toplevel[hash] = compileValue(
                oneVal(nv, pinHashes, toplevel, pinArities),
                pinArities,
            );
        }
    });

    const main = oneVal(changed, pinHashes, toplevel, pinArities);

    toplevel.main = compileValue(main, pinArities);

    return toplevel;
};

export const jsjit: RT = {
    setRequireOpPin(v) {
        if (!v) throw new Error(`not about that live`);
    },
    run(v, saveTo?: string) {
        const tops = compileVal(v);
        const code = Object.entries(tops)
            .map(([name, body]) => `PINS[${JSON.stringify(name)}] = ${body};`)
            .join('\n\n');
        if (saveTo) {
            writeFileSync(
                saveTo,
                `import {asLaw, PINS, forceDeep, show, setLocal} from './ps/runtime';\n` +
                    code +
                    '\nconsole.log(show(forceDeep(PINS.main)))',
            );
        }

        new Function(`{asLaw, PINS, setLocal}`, code)({
            asLaw,
            PINS,
            setLocal,
        });

        PINS['$pl_1255'] = asLaw(
            (a: Value, b: Value) => {
                a = force(a);
                b = force(b);
                if (typeof a !== 'bigint' && typeof a !== 'number') return 0;
                if (typeof b !== 'bigint' && typeof b !== 'number') return 0;
                if (typeof a === 'number' && typeof b === 'number')
                    return a + b;
                return BigInt(a) + BigInt(b);
            },
            0n,
            0,
        );

        console.log(PINS.main);
        console.log(show(PINS.main));
        return show(forceDeep(PINS.main));
    },
};

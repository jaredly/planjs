import objectHash from 'object-hash';
import { findPins, NVal } from '../../runtime/arraybuffer';
import { APP, LAW, NAT, OPNAMES, PIN, Val } from '../../runtime/types';
import {
    asLaw,
    Body,
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
    typeof v === 'object' && v.length === 3 ? [v[1], v[2]] : null;

// NOTE: Not forcing anything here
// looks like I don't in runtime2 either
export const extractLets = (body: Value, lets: Value[]): Value => {
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

const compileValue = (value: Body): string => {
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
                // if (value[1] === 0) return 'this';
                // return `$${value[1]}`;
                return value[1];
            }
            if (value.length === 3) {
                return `[${value[0]}, ${compileValue(value[1])}, ${compileValue(
                    value[2],
                )}]`;
            }
            return compileValue(value[1]);
    }
};

// type Lazy = [0 | 1, Value, [Value, ...Value[]]] | [1, Immediate]; // { lazy: Immediate | App; forced: boolean };
// export type Value = Immediate | Lazy;
// type Immediate = Law | number | bigint | string;
// export type Law = Function & { nameNat: bigint; body: Value };
// type BLazy = [0 | 1, Body, Body] | [1, Immediate];
// type Body = Immediate | BLazy | [3, number]; /* (ref int) */

export const toBody = (value: Value, maxIndex: number): Body => {
    switch (typeof value) {
        case 'bigint':
        case 'number':
            if (value <= maxIndex) {
                if (value === 0 || value === 0n) {
                    return [3, 'this'];
                }
                return [3, `$${Number(value)}`];
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
                    toBody(pair[1], maxIndex),
                ];
            }
    }
    return value;
};

export const compileLaw = (
    name: string,
    args: string[],
    lets: { name: string; value: Body }[],
    body: Body,
) => {
    const fn = `function ${clean(name)} (${args.join(', ')}) {${lets
        .map((lt) => `\n    const ${lt.name} = [0, -1, -1];`)
        .join('')}${lets
        .map(
            ({ name, value }, i) =>
                `\n    setLocal(${name}, ${compileValue(value)});`,
        )
        .join('')}
    return ${compileValue(body)};
}`;
    const SIMPLE = true;
    if (SIMPLE) {
        return fn;
    }
    return `asLaw(${fn}, ${asciiToNat(name)}n, ${JSON.stringify(body, (_, v) =>
        typeof v === 'bigint' ? v + 'n' : v,
    )})`;
};

export const prepareLaw = (arity: number, body: Value) => {
    const args: string[] = [];
    for (let i = 1; i <= arity; i++) {
        args.push(`$${i}`);
    }
    const lets: Value[] = [];
    const inner = extractLets(body, lets);
    const maxIndex = arity + lets.length;
    const innerB = toBody(inner, maxIndex);
    const letsB = lets.map((value, i) => ({
        name: `$${arity + 1 + i}`,
        value: toBody(value, maxIndex),
    }));

    return { args, lets: letsB, inner: innerB };
};

// export const compile = (name: string, arity: number, body: Value) => {
//     if (arity === 0) {
//         return compileValue(toBody(body, 0));
//     }
//     const args: string[] = [];
//     for (let i = 1; i <= arity; i++) {
//         args.push(`$${i}`);
//     }
//     const lets: Value[] = [];
//     const inner = extractLets(body, lets);
//     const maxIndex = arity + lets.length;
//     const innerB = toBody(inner, maxIndex);
//     const letsB = lets.map((value) => toBody(value, maxIndex));

//     return compileLaw(name, args, letsB, innerB);
// };

export const clean = (name: string) =>
    name
        .replace(/!/g, '$bang')
        .replace(/\+/g, '$pl')
        .replace(/\-/g, '$_')
        .replace(/[^0-9a-zA-Z_$]/g, '_');

export type Ctx = {
    pins: string[];
    processLaw(name: string, arity: number, value: Value): void;
    nameFn(name: string | null, hash: string): string;
};

export const oneVal = (val: NVal, ctx: Ctx): Value => {
    switch (val.v[0]) {
        case PIN:
            return ctx.pins[val.v[1]];
        case LAW:
            const name = ctx.nameFn(
                val.v[1] > 0 ? natToAscii(val.v[1]) : null,
                objectHash(val.v),
            );
            ctx.processLaw(name, Number(val.v[2]), oneVal(val.v[3], ctx));
            return name;
        case APP:
            return [0, oneVal(val.v[1], ctx), oneVal(val.v[2], ctx)];
        case NAT:
            return val.v[1];
    }
};

export const preparePins = (
    val: Val,
    nameFn: (name: string, hash: string) => string,
) => {
    const npins: [NVal, Val][] = [];
    const changed = findPins(val, npins);
    const pinHashes = npins.map(([nv, v]) => {
        if (nv.v[0] === NAT && OPNAMES[Number(nv.v[1])]) {
            return OPNAMES[Number(nv.v[1])];
        }
        const hash = objectHash(nv);
        if (nv.v[0] === LAW) {
            const name = nameFn(natToAscii(nv.v[1]), hash);
            return name;
        }
        return hash;
    });

    return {
        pins: npins.map((v) => v[0]),
        pinHashes,
        root: changed,
    };
};

const nameFn = (name: string, hash: string) => {
    return (name ? clean(name) + '_' : '') + hash.slice(0, 4);
};

export type Toplevels = Record<
    string,
    | {
          type: 'law';
          name: string;
          args: string[];
          lets: { name: string; value: Body }[];
          body: Body;
      }
    | {
          type: 'plain';
          value: Body;
      }
>;

export const compileVal2 = (val: Val) => {
    const { pins, pinHashes, root } = preparePins(val, nameFn);

    const toplevel: Toplevels = {};
    const ctx: Ctx = {
        pins: pinHashes,
        processLaw(name, arity, body) {
            const { args, lets, inner } = prepareLaw(arity, body);
            toplevel[name] = { type: 'law', name, args, lets, body: inner };
        },
        nameFn,
    };
    pins.forEach((nv, i) => {
        const hash = pinHashes[i];
        if (nv.v[0] === LAW) {
            const { args, lets, inner } = prepareLaw(
                Number(nv.v[2]),
                oneVal(nv.v[3], ctx),
            );
            toplevel[hash] = {
                type: 'law',
                name: hash,
                args,
                lets,
                body: inner,
            };
        } else {
            toplevel[hash] = { type: 'plain', value: oneVal(nv, ctx) };
        }
    });

    toplevel.main = { type: 'plain', value: oneVal(root, ctx) };

    return toplevel;
};

export const compileVal = (val: Val) => {
    const tops = compileVal2(val);

    const toplevel: Record<string, string> = {};
    Object.entries(tops).forEach(([hash, top]) => {
        if (top.type === 'law') {
            toplevel[hash] = compileLaw(top.name, top.args, top.lets, top.body);
        } else {
            toplevel[hash] = compileValue(top.value);
        }
    });

    return toplevel;
};

export const compileMain = (tops: Toplevels) => {
    const toplevel: Record<string, string> = {};
    Object.entries(tops).forEach(([hash, top]) => {
        if (top.type === 'law') {
            toplevel[hash] = compileLaw(top.name, top.args, top.lets, top.body);
        } else {
            toplevel[hash] = compileValue(top.value);
        }
    });

    const code = Object.entries(toplevel)
        .map(([name, body]) => `PINS[${JSON.stringify(name)}] = ${body};`)
        .join('\n\n');

    return code;
};

export const runMain = (code: string): Value => {
    new Function(`{asLaw, PINS, setLocal}`, code)({
        asLaw,
        PINS,
        setLocal,
    });

    const jetPlus = asLaw(
        (a: Value, b: Value) => {
            a = force(a);
            b = force(b);
            if (typeof a !== 'bigint' && typeof a !== 'number') return 0;
            if (typeof b !== 'bigint' && typeof b !== 'number') return 0;
            if (typeof a === 'number' && typeof b === 'number') return a + b;
            return BigInt(a) + BigInt(b);
        },
        0n,
        0,
    );

    const jetMul = asLaw(
        (a: Value, b: Value) => {
            a = force(a);
            b = force(b);
            if (typeof a !== 'bigint' && typeof a !== 'number') return 0;
            if (typeof b !== 'bigint' && typeof b !== 'number') return 0;
            if (typeof a === 'number' && typeof b === 'number') return a * b;
            return BigInt(a) * BigInt(b);
        },
        0n,
        0,
    );

    Object.keys(PINS).forEach((k) => {
        if (k.startsWith('$pl_') || k === '+') {
            PINS[k] = jetPlus;
        }
    });
    PINS.mul = jetMul;

    return forceDeep(PINS.main);
};

export const jsjit: RT = {
    setRequireOpPin(v) {
        if (!v) throw new Error(`not about that live`);
    },
    run(v, saveTo?: string) {
        const code = compileMain(compileVal2(v));
        if (saveTo) {
            writeFileSync(
                saveTo,
                `import {asLaw, PINS, forceDeep, show, setLocal} from './ps/runtime';\n` +
                    code +
                    '\nconsole.log(show(forceDeep(PINS.main)))',
            );
        }

        return show(runMain(code));
    },
};

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
            // maybeCollapse(value, pinArities);
            if (value.length === 3) {
                return `[${value[0]}, ${compileValue(
                    value[1],
                    pinArities,
                )}, ${compileValue(value[2], pinArities)}]`;
            }
            return compileValue(value[1], pinArities);
    }
};

// type Lazy = [0 | 1, Value, [Value, ...Value[]]] | [1, Immediate]; // { lazy: Immediate | App; forced: boolean };
// export type Value = Immediate | Lazy;
// type Immediate = Law | number | bigint | string;
// export type Law = Function & { nameNat: bigint; body: Value };
type BLazy = [0 | 1, Body, Body] | [1, Immediate];
type Body = Immediate | BLazy | [3, number]; /* (ref int) */

export const toBody = (value: Value, maxIndex: number): Body => {
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
                    toBody(pair[1], maxIndex),
                ];
            }
    }
    return value;
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
            const name = nameFn(natToAscii(nv.v[1]), hash);
            pinArities[name] = Number(nv.v[2]);
            return name;
        }
        return hash;
    });

    return {
        pins: npins.map((v) => v[0]),
        pinHashes,
        pinArities,
        root: changed,
    };
};

const nameFn = (name: string, hash: string) => {
    return (name ? clean(name) + '_' : '') + hash.slice(0, 4);
};

export const compileVal = (val: Val) => {
    const { pins, pinHashes, pinArities, root } = preparePins(val, nameFn);

    const toplevel: Record<string, string> = {};
    const ctx: Ctx = {
        pins: pinHashes,
        processLaw(name, arity, value) {
            pinArities[name] = Number(arity);
            toplevel[name] = compile(name, arity, value, pinArities);
        },
        nameFn,
    };
    pins.forEach((nv, i) => {
        const hash = pinHashes[i];
        if (nv.v[0] === LAW) {
            toplevel[hash] = compile(
                hash,
                Number(nv.v[2]),
                oneVal(nv.v[3], ctx),
                pinArities,
            );
        } else {
            toplevel[hash] = compileValue(oneVal(nv, ctx), pinArities);
        }
    });

    const main = oneVal(root, ctx);

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

        const jetPlus = asLaw(
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

        Object.keys(PINS).forEach((k) => {
            if (k.startsWith('$pl_')) {
                PINS[k] = jetPlus;
            }
        });

        return show(forceDeep(PINS.main));
    },
};

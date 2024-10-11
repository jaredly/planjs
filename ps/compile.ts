import objectHash from 'object-hash';
import { findPins, NVal } from '../runtime/arraybuffer';
import { APP, LAW, NAT, OPNAMES, PIN, Val } from '../runtime/types';
import {
    asLaw,
    force,
    forceDeep,
    Law,
    PINS,
    setLocal,
    show,
    Value,
} from './runtime';
import { asciiToNat, natToAscii } from '../runtime/natToAscii';
import { RT } from '../runtime/runtime2';
import { writeFileSync } from 'fs';

const asApp = (v: Value): null | [Value, Value] =>
    typeof v === 'object' && v.length === 3 ? [v[1], v[2]] : null;

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

const compileValue = (value: Value): string => {
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
            if (value.length === 3) {
                return `[${value[0]}, ${compileValue(value[1])}, ${compileValue(
                    value[2],
                )}]`;
            }
            return compileValue(value[1]);
    }
};

const compileBody = (value: Value, maxIndex: number): string => {
    switch (typeof value) {
        case 'bigint':
        case 'number':
            if (value === 0 || value === 0n) return 'this';
            if (value <= maxIndex) {
                return `$${value}`;
            }
            return 'lol' + compileValue(value);
        case 'object':
            const pair = asApp(value);
            if (!pair) return compileValue(value);
            if (pair[0] === 2 || pair[0] === 2n) return compileValue(pair[1]);
            const inner = asApp(pair[0]);
            if (inner && (inner[0] === 0 || inner[0] === 0n)) {
                return `[0, ${compileBody(inner[1], maxIndex)}, ${compileBody(
                    pair[1],
                    maxIndex,
                )}]`;
            }
    }
    return compileValue(value);
};

export const compile = (name: string, arity: number, body: Value) => {
    if (arity === 0) {
        return compileBody(body, 0);
    }
    const args: string[] = [];
    for (let i = 1; i <= arity; i++) {
        args.push(`$${i}`);
    }
    const lets: Value[] = [];
    const inner = extractLets(body, lets);
    const maxIndex = arity + lets.length;
    return `asLaw(function ${name} (${args.join(', ')}) {${lets
        .map((_, i) => `\n    const $${i + arity + 1} = [0, -1, -1];`)
        .join('')}${lets
        .map(
            (value, i) =>
                `\n    setLocal($${i + arity + 1}, ${compileBody(
                    value,
                    maxIndex,
                )});`,
        )
        .join('')}
    return ${compileBody(inner, maxIndex)};
}, ${asciiToNat(name)}n, ${JSON.stringify(body, (_, v) =>
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
): Value => {
    switch (val.v[0]) {
        case PIN:
            return pins[val.v[1]];
        case LAW:
            const name =
                (val.v[1] > 0 ? clean(natToAscii(val.v[1])) + '_' : '') +
                objectHash(val.v).slice(0, 4);
            fns[name] = compile(
                name,
                // natToAscii(val.v[1]),
                Number(val.v[2]),
                oneVal(val.v[3], pins, fns),
            );
            return name;
        case APP:
            return [
                0,
                oneVal(val.v[1], pins, fns),
                oneVal(val.v[2], pins, fns),
            ];
        case NAT:
            return val.v[1];
    }
};

export const compileVal = (val: Val) => {
    const npins: [NVal, Val][] = [];
    const changed = findPins(val, npins);
    const pinHashes = npins.map(([nv, v]) => {
        if (nv.v[0] === NAT && OPNAMES[Number(nv.v[1])]) {
            return OPNAMES[Number(nv.v[1])];
        }
        const hash = objectHash(nv);
        if (nv.v[0] === LAW) {
            return clean(natToAscii(nv.v[1])) + '_' + hash.slice(0, 4);
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
                oneVal(nv.v[3], pinHashes, toplevel),
            );
        } else {
            toplevel[hash] = compileValue(oneVal(nv, pinHashes, toplevel));
        }
    });

    toplevel.main = compileValue(oneVal(changed, pinHashes, toplevel));

    return toplevel;
};

export const jsjit: RT = {
    setRequireOpPin(v) {
        if (!v) throw new Error(`not about that live`);
    },
    run(v) {
        const tops = compileVal(v);
        const code = Object.entries(tops)
            .map(([name, body]) => `PINS[${JSON.stringify(name)}] = ${body};`)
            .join('\n\n');
        // console.log(code);
        writeFileSync(
            'code.js',
            `import {asLaw, PINS, forceDeep, show, setLocal} from './ps/runtime';\n` +
                code +
                '\nconsole.log(show(forceDeep(PINS.main)))',
        );

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

        return show(forceDeep(PINS.main));
    },
};

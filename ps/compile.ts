import { Value } from './runtime';

const asApp = (v: Value): null | [Value, Value] =>
    typeof v === 'object' && Array.isArray(v.lazy) ? v.lazy : null;

// NOTE: Not forcing anything here
// looks like I don't in runtime2 either
const extractLets = (body: Value, lets: Value[]): Value => {
    const top = asApp(body);
    if (!top) return body;
    const next = asApp(top[0]);
    if (!next) return body;
    // (1 v b)
    if (next[0] === 1 || next[0] === 1n) {
        lets.push(top[1]);
        return extractLets(next[1], lets);
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
            if (Array.isArray(value.lazy)) {
                return `{forced: false, lazy:[${
                    (compileValue(value.lazy[0]), compileValue(value.lazy[1]))
                }]}`;
            }
            return compileValue(value.lazy);
    }
};

const compileBody = (value: Value, maxIndex: number): string => {
    switch (typeof value) {
        case 'bigint':
        case 'number':
            if (value <= maxIndex) {
                return `$${value}`;
            }
            return compileValue(value);
        case 'object':
            const pair = asApp(value);
            if (!pair) return compileValue(value);
            if (pair[0] === 2 || pair[0] === 2n) return compileValue(pair[1]);
            const inner = asApp(pair[0]);
            if (inner && (inner[0] === 0 || inner[0] === 0n)) {
                return `{forced: false, lazy:[${
                    (compileBody(inner[1], maxIndex),
                    compileBody(pair[1], maxIndex))
                }]}`;
            }
    }
    return compileValue(value);
};

export const compile = (arity: number, body: Value) => {
    const args: string[] = [];
    for (let i = 1; i <= arity; i++) {
        args.push(`$${i}`);
    }
    const lets: Value[] = [];
    const inner = extractLets(body, lets);
    const maxIndex = arity + lets.length;
    return `function(${args.join(', ')}) {
    ${lets
        .map((_, i) => `const $${i + arity + 1} = {lazy: 0, forced: false};`)
        .join('\n    ')}
    ${lets.map(
        (value, i) =>
            `$${i + arity + 1}.lazy = ${compileBody(value, maxIndex)}`,
    )}
    return ${compileBody(inner, maxIndex)};
}`;
};

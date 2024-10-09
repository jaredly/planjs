// A pseudo ast, for fun
import {
    APP,
    LAW,
    NAT,
    natToAscii,
    OPCODE,
    OPNAMES,
    OPS,
    PIN,
    REQUIRE_OP_PIN,
    showVal,
    Val,
} from './runtime';
import equal from 'fast-deep-equal';

export type AST =
    | { type: 'app'; target: AST; arg: AST }
    | { type: 'pin'; ref: number }
    | { type: 'law'; name: string; args: bigint; body: AST }
    | { type: 'let'; value: AST; body: AST }
    | { type: 'maybe-ref'; value: bigint }
    | { type: 'nat'; value: bigint }
    | { type: 'primop'; op: OPCODE }
    | { type: 'recurse'; level: number }
    | { type: 'ref' };

const unwrap = (v: AST): AST[] => {
    if (v.type === 'app') {
        return [...unwrap(v.target), v.arg];
    }
    return [v];
};

const show = (v: AST, pins: Pins): string => {
    switch (v.type) {
        case 'app':
            return `(${unwrap(v)
                .map((v) => show(v, pins))
                .join(' ')})`;
        case 'pin':
            const ast = pins[v.ref].ast;
            if (ast.type === 'law') {
                return `${ast.name}`;
            }
            return `<${v.ref}>`;
        case 'law': {
            const args: string[] = [];
            for (let i = 0; i < v.args; i++) {
                args.push(`$${i + 1}`);
            }
            if (!args.length && v.name)
                return `(def ${v.name} ${show(v.body, pins)})`;
            return `(${v.name ? 'defn ' + v.name + ' ' : 'fn '}[${args.join(
                ' ',
            )}] ${show(v.body, pins)})`;
        }
        case 'let':
            return `let ?? = ${show(v.value, pins)} in ${show(v.body, pins)}`;
        case 'maybe-ref':
            if (v.value > 1024) {
                return `"${natToAscii(v.value)}"`;
            }
            return `$${v.value}`;
        case 'nat':
            return v.value + '';
        case 'primop':
            return OPNAMES[v.op];
        case 'recurse':
            return `<recurse ${v.level}>`;
        case 'ref':
            return `<?? unevaluated ref ??>`;
    }
};

const parseBody = (v: Val, trace: Val[], pins: Pins): AST => {
    if (trace.includes(v)) {
        const at = trace.indexOf(v);
        return { type: 'recurse', level: trace.length - at };
    }
    const otrace = trace;
    trace = [...trace, v];
    const { v: val } = v;

    if (val[0] === APP) {
        const [_, f1, arg1] = val;
        if (f1.v[0] === APP) {
            const [_, f2, arg2] = f1.v;
            if (f2.v[0] === NAT) {
                if (f2.v[1] === 0n) {
                    const arg = parseBody(arg1, trace, pins);
                    if (
                        !REQUIRE_OP_PIN &&
                        arg2.v[0] === APP &&
                        arg2.v[1].v[0] === NAT &&
                        arg2.v[1].v[1] === 2n &&
                        arg2.v[2].v[0] === NAT &&
                        arg2.v[2].v[1] <= 4
                    ) {
                        return {
                            type: 'app',
                            target: {
                                type: 'primop',
                                op: Number(arg2.v[2].v[1]) as 4,
                            },
                            arg,
                        };
                    }
                    return {
                        type: 'app',
                        target: parseBody(arg2, trace, pins),
                        arg,
                    };
                }
                if (f2.v[1] === 1n) {
                    return {
                        type: 'let',
                        value: parseBody(arg2, trace, pins),
                        body: parseBody(arg1, trace, pins),
                    };
                }
            }
        }
        if (f1.v[0] === NAT && f1.v[1] === 2n) {
            return parse(arg1, trace, pins);
        }
    }
    if (val[0] === NAT) {
        return { type: 'maybe-ref', value: val[1] };
    }

    return parse(v, otrace, pins);
};

type Pins = { ast: AST; val: Val }[];

export const parse = (v: Val, trace: Val[], pins: Pins): AST => {
    if (trace.includes(v)) {
        const at = trace.indexOf(v);
        return { type: 'recurse', level: trace.length - at };
    }
    trace = [...trace, v];
    const { v: val } = v;
    switch (val[0]) {
        case PIN:
            if (val[1].v[0] === NAT && val[1].v[1] <= 4n) {
                return { type: 'primop', op: Number(val[1].v[1]) as 4 };
            }
            const got = pins.findIndex((p) => equal(p.val, val[1]));
            if (got !== -1) {
                return { type: 'pin', ref: got };
            }
            const ast = parse(val[1], trace, pins);
            pins.push({ ast, val: val[1] });

            return { type: 'pin', ref: pins.length - 1 };
        case LAW:
            return {
                type: 'law',
                name: natToAscii(val[1]),
                args: val[2],
                body: parseBody(val[3], trace, pins),
            };
        case APP:
            if (val[1].v[0] === NAT && val[1].v[1] <= 4n && !REQUIRE_OP_PIN) {
                return {
                    type: 'app',
                    target: { type: 'primop', op: Number(val[1].v[1]) as 4 },
                    arg: parse(val[2], trace, pins),
                };
            }
            return {
                type: 'app',
                target: parse(val[1], trace, pins),
                arg: parse(val[2], trace, pins),
            };
        case NAT:
            return { type: 'nat', value: val[1] };
        case 4:
            return { type: 'ref' };
    }
};

export const showNice = (val: Val, debug = false) => {
    const pins: Pins = [];
    const main = parse(val, [], pins);
    return (
        pins
            .map(
                (p, i) =>
                    `PIN ${i}: ${show(p.ast, pins)}` +
                    (debug
                        ? `\n${showVal(p.val, {
                              hidePinLaw: true,
                              trace: [],
                          })}`
                        : ''),
            )
            .join('\n') + `\n${show(main, pins)}`
    );
};

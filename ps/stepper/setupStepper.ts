import { Loc, keyForLoc } from 'j3/one-world/shared/nodes';
import { asciiToNat } from '../../runtime/natToAscii';
import { OPS } from '../../runtime/types';
import { findFree } from '../../web/astToValue';
import { AST } from '../../web/types';
import { ptr, Ref, MValue, Memory } from './types';
import { equal } from './showMValue';
import { prepareLaw } from './prepareLaw';
import { alloc } from './runtime';

type Ctx = {
    processLaw(
        lawNum: number,
        name: { text: string; loc: Loc } | undefined,
        args: string[],
        lets: { name: string; value: AST }[],
        value: AST,
    ): ptr;
    locPin: (loc: Loc) => Ref;
    lawNum: { v: number };
    alloc(v: MValue): ptr;
    pin(v: MValue): Ref;
};

export const addMain = (memory: Memory, args: MValue[]) => {
    if (!memory.laws.main) {
        throw new Error(`no main law`);
    }
    if (args.length !== memory.laws.main.arity) {
        throw new Error(`wrong number of args to main`);
    }

    const main = prepareLaw(
        memory.laws.main.buffer,
        args.map((arg) => ({
            type: 'LOCAL',
            v: alloc(memory, arg),
        })),
        memory.heap.length,
    );
    memory.heap.push(...main);
    const dest = memory.heap.length - 1;
    memory.stack.push({ at: dest, reason: 'main' });
    return dest;
};

export const setupStepper = (tops: AST[], mainArgs?: MValue[]) => {
    const memory: Memory = {
        heap: [],
        stack: [],
        laws: {},
    };
    const locPos: Record<string, ptr> = {};

    const alloc = (v: MValue, dest?: number): ptr => {
        if (dest != null) {
            memory.heap[dest] = v;
            return dest;
        }
        memory.heap.push(v);
        return memory.heap.length - 1;
    };

    tops.forEach((top) => {
        if (top.type === 'law' && top.name) {
            locPos[keyForLoc(top.name.loc)] = alloc({ type: 'NAT', v: 100n });
        }
    });

    const pins: { value: MValue; ptr: ptr }[] = [];

    const ctxFor = (buffer: MValue[], base: string, lawNum: { v: number }) => {
        const ctx: Ctx = {
            processLaw(fns, name, args, lets, value) {
                const id = fns === 0 ? base : `${base}_${fns}`;
                memory.laws[id] = allocLaw(id, args, lets, value, lawNum);
                if (name) {
                    const ptr = locPos[keyForLoc(name.loc)];
                    if (memory.heap[ptr].type !== 'LAW') {
                        memory.heap[ptr] = { type: 'LAW', v: asciiToNat(id) };
                        return ptr;
                    }
                }
                return alloc({ type: 'LAW', v: asciiToNat(id) });
            },
            alloc(v) {
                buffer.push(v);
                return buffer.length - 1;
            },
            lawNum,
            locPin(loc) {
                const k = keyForLoc(loc);
                if (locPos[k] == null) throw new Error(`unknown loc pin ${k}`);
                return { type: 'PIN', v: locPos[k] };
            },
            pin(v) {
                const found = pins.find((f) => equal(f.value, v));
                if (found) return { type: 'PIN', v: found.ptr };
                const ptr = alloc(v);
                pins.push({ value: v, ptr });
                return { type: 'PIN', v: ptr };
            },
        };
        return ctx;
    };

    const allocLaw = (
        base: string,
        args: string[],
        lets: { name: string; value: AST }[],
        value: AST,
        lawNum: { v: number },
    ): Memory['laws'][''] => {
        const local: Memory['laws'][''] = {
            arity: args.length,
            buffer: [],
        };
        const ctx = ctxFor(local.buffer, base, lawNum);
        const locals = [base, ...args, ...lets.map((l) => l.name)];

        lets.forEach(({ value }, i) => {
            local.buffer.push({ type: 'NAT', v: 0n });
        });

        lets.forEach(({ value }, i) => {
            const res = mvalueFromAST(value, locals, ctx);
            local.buffer[i] = { type: 'REF', ref: res };
        });

        const main = mvalueFromAST(value, locals, ctx);
        if (main.type !== 'LOCAL' || main.v !== local.buffer.length - 1) {
            local.buffer.push({ type: 'REF', ref: main });
        }

        return local;
    };

    const ptrs = tops.map((top, i) => {
        let base = (top.type === 'law' && top.name?.text) || `top${i}`;

        return mvalueFromAST(top, [], ctxFor(memory.heap, base, { v: 0 }));
    });

    return { memory, ptrs };
};

export const mvalueFromAST = (node: AST, locals: string[], ctx: Ctx): Ref => {
    switch (node.type) {
        case 'app': {
            let res = mvalueFromAST(node.target, locals, ctx);
            for (let i = 0; i < node.args.length; i++) {
                res = {
                    type: 'LOCAL',
                    v: ctx.alloc({
                        type: 'APP',
                        f: res,
                        x: mvalueFromAST(node.args[i], locals, ctx),
                        ev: false,
                        loc: node.args[i].loc,
                    }),
                    loc: node.loc,
                };
            }
            return res;
        }
        case 'array':
            throw new Error('not yet');
        case 'nat':
            return {
                type: 'LOCAL',
                v: ctx.alloc({ type: 'NAT', v: node.number, loc: node.loc }),
            };
        case 'builtin':
            const code = OPS[node.name as 'LAW'];
            return ctx.pin({ type: 'NAT', v: BigInt(code), loc: node.loc });
        case 'law':
            const name = node.name?.text ?? 'self';
            const fnLocals = [
                name,
                ...node.args,
                ...node.lets.map((l) => l.name),
            ];
            let extraArgs: string[] = [];
            findFree(node.body, fnLocals, extraArgs);
            // assume everything else is global
            extraArgs = extraArgs.filter((f) => locals.includes(f));
            let fn = ctx.lawNum.v++;
            let res: Ref = {
                type: 'PIN',
                v: ctx.processLaw(
                    fn,
                    node.name,
                    [...extraArgs, ...node.args],
                    node.lets,
                    node.body,
                ),
                loc: node.loc,
            };
            for (let i = 0; i < extraArgs.length; i++) {
                const arg = extraArgs[i];
                if (locals.indexOf(arg) === -1)
                    throw new Error(`unbound free vbl ${arg}`);
                res = {
                    type: 'LOCAL',
                    v: ctx.alloc({
                        type: 'APP',
                        f: res,
                        x: {
                            type: 'STACK',
                            v: locals.indexOf(arg),
                        },
                        ev: false,
                        loc: node.loc,
                    }),
                    loc: node.loc,
                };
            }
            return res;
        case 'local':
            const at = locals.indexOf(node.name);
            if (at === -1) {
                throw new Error(`unbound local ${node.name}`);
            }
            return { type: 'STACK', v: at };
        case 'string':
            if (node.templates.length) throw new Error('not supported tpl yet');
            return {
                type: 'LOCAL',
                v: ctx.alloc({ type: 'NAT', v: asciiToNat(node.first) }),
            };
        case 'pin':
            return ctx.locPin(node.ref);
    }
};

import { IDRef, Loc, RecNode } from 'j3/one-world/shared/nodes';
import { Body, Value } from '../ps/normal/runtime';
import { AST } from './types';
import { asciiToNat } from '../runtime/natToAscii';

type Ctx = {
    processLaw(
        name: string | undefined,
        args: string[],
        lets: { name: string; value: Body }[],
        value: Body,
    ): Value;
    locHash: (loc: Loc) => string;
};

export const findFree = (node: AST, locals: string[], found: string[]) => {
    switch (node.type) {
        case 'app':
            findFree(node.target, locals, found);
            node.args.forEach((n) => findFree(n, locals, found));
            return;
        case 'array':
            node.items.forEach((n) => findFree(n, locals, found));
            return;
        case 'builtin':
        case 'nat':
        case 'pin':
        case 'string':
            return;
        case 'law':
            const fnLocals = node.args.concat(node.lets.map((l) => l.name));
            findFree(node.body, locals.concat(fnLocals), found);
            return;
        case 'local':
            if (!locals.includes(node.name) && !found.includes(node.name)) {
                found.push(node.name);
            }
            return;
    }
};

export const fromRecNode = (node: AST, locals: string[], ctx: Ctx): Body => {
    switch (node.type) {
        case 'app': {
            let res = fromRecNode(node.target, locals, ctx);
            for (let i = 0; i < node.args.length; i++) {
                res = [0, res, fromRecNode(node.args[i], locals, ctx)];
            }
            return res;
        }
        case 'array':
            throw new Error('not yet');
        case 'nat':
            return node.number;
        case 'builtin':
            return node.name;
        case 'law':
            const fnLocals = [
                node.name?.text ?? 'self',
                ...node.args,
                ...node.lets.map((l) => l.name),
            ];
            let extraArgs: string[] = [];
            findFree(node.body, fnLocals, extraArgs);
            // assume everything else is global
            extraArgs = extraArgs.filter((f) => locals.includes(f));
            const args = [
                node.name?.text ?? 'self',
                ...extraArgs,
                ...node.args,
            ];
            const allLocals = args.concat(node.lets.map((l) => l.name));
            // console.log('law', args, allLocals, extraArgs);
            let res = ctx.processLaw(
                node.name?.text,
                args,
                node.lets.map((l) => ({
                    name: l.name,
                    value: fromRecNode(l.value, allLocals, ctx),
                })),
                fromRecNode(node.body, allLocals, ctx),
            );
            for (let arg of extraArgs) {
                if (locals.indexOf(arg) === -1)
                    throw new Error(`unbound free vbl ${arg}`);
                res = [0, res, locals.indexOf(arg)];
            }
            return res;
        case 'local':
            const at = locals.indexOf(node.name);
            if (at === -1) {
                // console.log('n', locals);
                // throw new Error(`unbound local ${node.name}`);
                return node.name;
            }
            return [3, at];
        case 'string':
            if (node.templates.length) throw new Error('not supported tpl yet');
            return asciiToNat(node.first);
        case 'pin':
            return ctx.locHash(node.ref);
    }
};

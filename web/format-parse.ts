import { CTX } from 'j3/one-world/evaluators/simplest';
import { Id, IDRef, Loc, RecNode } from 'j3/one-world/shared/nodes';
import { AST, Let } from './types';
import { asciiToNat } from '../runtime/natToAscii';

export const getExport = (top: RecNode): Id<Loc> | void => {
    if (
        top.type === 'list' &&
        top.items.length >= 2 &&
        top.items[0].type === 'id' &&
        (top.items[0].text === 'defn' || top.items[0].text === 'def') &&
        top.items[1].type === 'id'
    ) {
        return top.items[1];
    }
};

const parseLet = (ctx: CTX, node: RecNode): Let | null => {
    if (
        node.type === 'list' &&
        node.items.length === 3 &&
        node.items[0].type === 'id' &&
        node.items[0].text === 'let' &&
        node.items[1].type === 'id'
    ) {
        const value = parseExpr(ctx, node.items[2]);
        return value ? { name: node.items[1].text, value } : null;
    }
    ctx.errors.push({ loc: node.loc, text: 'bad let' });
    return null;
};

const topForms: Record<
    string,
    (ctx: CTX, loc: Loc, ...args: RecNode[]) => AST | void
> = {
    // TODO: defs can have lets
    def(ctx, loc, name, ...body) {
        if (!name || !body.length || name.type !== 'id' || name.ref) {
            ctx.errors.push({ loc, text: 'bad def form' });
            return;
        }
        const lets: Let[] = [];
        for (let i = 0; i < body.length - 1; i++) {
            const l = parseLet(ctx, body[i]);
            if (l) lets.push(l);
        }
        const expr = parseExpr(ctx, body[body.length - 1]);
        ctx.exports?.push({ kind: 'value', loc: name.loc });
        return expr
            ? {
                  type: 'law',
                  name,
                  args: [],
                  lets,
                  loc,
                  body: expr,
              }
            : undefined;
    },
    defn(ctx, loc, name, args, ...body) {
        if (!name || !args || !body.length || name.type !== 'id') {
            console.log(name, args, body);
            ctx.errors.push({ loc, text: 'bad defn form' });
            return;
        }
        ctx.layouts[getLoc(loc)] = {
            type: 'vert',
            layout: { tightFirst: 3, indent: 4 },
        };

        ctx.exports?.push({ kind: 'value', loc: name.loc });
        const fn = forms.fn(ctx, loc, args, ...body);
        return fn?.type === 'law' ? { ...fn, name } : undefined;
    },
    // defmacro(ctx, loc, name, args, value) {
    //     if (
    //         !name ||
    //         !args ||
    //         !value ||
    //         name.type !== 'id' ||
    //         name.ref ||
    //         args.type !== 'array' ||
    //         !args.items.every((item) => item.type === 'id')
    //     ) {
    //         ctx.errors.push({ loc, text: 'bad form' });
    //         return;
    //     }
    //     ctx.exports?.push({ kind: 'macro', loc: name.loc });
    //     const body = parseExpr(ctx, value);
    //     return body
    //         ? {
    //               type: 'defmacro',
    //               args: args.items.map((arg) => (arg as Id<Loc>).text),
    //               loc: name.loc,
    //               body,
    //           }
    //         : undefined;
    // },
};

const getLoc = (l: Loc) => l[l.length - 1][1];

const forms: Record<
    string,
    (ctx: CTX, loc: Loc, ...args: RecNode[]) => AST | void
> = {
    fn(ctx, loc, args, ...body) {
        if (
            !args ||
            !body.length ||
            args.type !== 'array' ||
            !args.items.every((arg) => arg.type === 'id')
        ) {
            ctx.errors.push({ loc, text: 'bad fn form' });
            return;
        }
        const lets: Let[] = [];
        for (let i = 0; i < body.length - 1; i++) {
            const l = parseLet(ctx, body[i]);
            if (l) lets.push(l);
        }
        const expr = parseExpr(ctx, body[body.length - 1]);
        return expr
            ? {
                  type: 'law',
                  lets,
                  args: args.items.map((arg) => (arg as Id<Loc>).text),
                  body: expr,
                  loc,
              }
            : undefined;
    },
};

export const fixGlobals = (node: RecNode, globals: Record<string, IDRef>) => {
    switch (node.type) {
        case 'list':
        case 'record':
        case 'array':
            node.items.forEach((n) => fixGlobals(n, globals));
            return;
        case 'string':
            node.templates.forEach((t) => fixGlobals(t.expr, globals));
            return;
        case 'table':
            node.rows.forEach((r) => r.forEach((c) => fixGlobals(c, globals)));
            return;
        case 'id':
            if (!node.ref && globals[node.text]) {
                const ref = globals[node.text];
                if (ref.type === 'toplevel' && ref.loc === node.loc) {
                    return;
                }
                node.ref = globals[node.text];
            }
            return;
    }
};

const parseExpr = (ctx: CTX, value: RecNode): AST | void => {
    switch (value.type) {
        case 'string':
            if (value.templates.length) {
                return;
            }
            const templates = [];
            for (let item of value.templates) {
                const expr = parseExpr(ctx, item.expr);
                if (!expr) return;
                templates.push({ expr, suffix: item.suffix });
            }
            return {
                type: 'string',
                first: value.first,
                templates,
                loc: value.loc,
            };
        case 'array': {
            const items: AST[] = [];
            for (let item of value.items) {
                const parsed = parseExpr(ctx, item);
                if (!parsed) return;
                items.push(parsed);
            }
            return { type: 'array', items, loc: value.loc };
        }
        case 'id':
            if (value.ref?.type === 'toplevel') {
                ctx.references.push({ loc: value.loc, ref: value.ref });
                return {
                    type: 'pin',
                    ref: value.ref.loc,
                    loc: value.loc,
                };
            }
            if (value.ref?.type === 'builtin') {
                ctx.references.push({ loc: value.loc, ref: value.ref });
                return {
                    type: 'builtin',
                    name: value.text,
                    // kind: value.ref.kind,
                    loc: value.loc,
                };
            }
            if (value.text.length > 0) {
                const num = Number(value.text);
                if (Number.isInteger(num)) {
                    return { type: 'nat', number: BigInt(num), loc: value.loc };
                }
                // if (Number.isFinite(num)) {
                //     return { type: 'float', value: num };
                // }
            }
            if (ctx.cursor != null && ctx.cursor === value.loc[0][1]) {
                ctx.autocomplete = {
                    local: [],
                    kinds: ['kwd', 'value'],
                };
                // } else if (ctx.cursor != null) {
                //     console.log('an id', ctx.cursor, value.loc[0][1]);
            }
            if (value.text === '') {
                ctx.errors.push({ loc: value.loc, text: 'blank' });
                return;
            }
            return { type: 'local', loc: value.loc, name: value.text };

        case 'list':
            if (
                value.type === 'list' &&
                value.items.length > 0 &&
                value.items[0].type === 'id'
            ) {
                const id = value.items[0].text;
                if (forms[id]) {
                    return forms[id](ctx, value.loc, ...value.items.slice(1));
                }
            }
            if (value.items.length === 0) {
                return { type: 'builtin', name: 'nil', loc: value.loc };
            }
            if (
                value.items.length === 1 &&
                value.items[0].type === 'id' &&
                !value.items[0].ref &&
                value.items[0].text === ''
            ) {
                return { type: 'builtin', name: 'nil', loc: value.loc };
            }
            if (value.items.length > 1) {
                const target = parseExpr(ctx, value.items[0]);
                const args = value.items
                    .slice(1)
                    .filter(
                        (t) => !(t.type === 'id' && !t.ref && t.text === ''),
                    )
                    .map((arg) => parseExpr(ctx, arg));
                return target && args.every((arg) => !!arg)
                    ? {
                          type: 'app',
                          target,
                          args: args as AST[],
                          loc: value.loc,
                      }
                    : undefined;
            }
            return parseExpr(ctx, value.items[0]);
    }
    throw new Error(`invalid expr`);
};

export const parseTop = (ctx: CTX, node: RecNode): AST | null => {
    if (node.type === 'rich-block') {
        return null;
    }
    try {
        if (
            node.type === 'list' &&
            node.items.length > 0 &&
            node.items[0].type === 'id'
        ) {
            const id = node.items[0].text;
            if (topForms[id]) {
                if (
                    ctx.cursor != null &&
                    node.items[0].loc[0][1] === ctx.cursor &&
                    node.items.length === 1
                ) {
                    ctx.autocomplete = { kinds: ['kwd'], local: [] };
                }
                return (
                    topForms[id](ctx, node.loc, ...node.items.slice(1)) ?? null
                );
            }
        }
        const expr = parseExpr(ctx, node);
        return expr ?? null;
    } catch (err) {
        ctx.errors.push({ loc: node.loc, text: (err as Error).message });
        return null;
    }
};

export const parse = (node: RecNode) => {
    const ctx: CTX = {
        layouts: {},
        styles: {},
        exports: [],
        errors: [],
        tableHeaders: {},
        autocomplete: undefined,
        references: [],
        // cursor:,
    };
    const top = parseTop(ctx, node);
    return { ...ctx, top };
};

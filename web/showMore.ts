import { recNodeToText } from 'j3/one-world/client/cli/drawDocNode';
// import { SimplestEvaluator } from 'j3/one-world/evaluators/simplest';
import { ABlock } from 'j3/one-world/shared/IR/block-to-attributed-text';
import { Loc, RecNode } from 'j3/one-world/shared/nodes';
import {
    toBody,
    extractLets,
    preparePins,
    Ctx,
    oneVal,
} from '../ps/normal/compile';
import { Body, Value } from '../ps/normal/runtime';
import { natToAscii } from '../runtime/natToAscii';
import { Val, LAW } from '../runtime/types';
import { parse } from './format-parse';

const unAPP = (v: Body, args: Body[]) => {
    if (typeof v === 'object' && v.length === 3) {
        unAPP(v[1], args);
        args.push(v[2]);
    } else {
        args.push(v);
    }
};

const findTopRefs = (v: Body, pins: string[]) => {
    switch (typeof v) {
        case 'bigint':
        case 'number':
            return;
        case 'function':
            return pins.push(natToAscii(v.nameNat));
        case 'string':
            return pins.push(v);
        case 'object':
            if (v[0] === 3) return;
            findTopRefs(v[1], pins);
            if (v.length === 3) findTopRefs(v[2], pins);
            return;
    }
};

const showBody = (v: Body, l: () => Loc): RecNode => {
    switch (typeof v) {
        case 'bigint':
        case 'number':
            return { type: 'id', loc: l(), text: v + '' };
        case 'function':
            return { type: 'id', loc: l(), text: natToAscii(v.nameNat) };
        case 'string':
            return { type: 'id', loc: l(), text: v };
        case 'object':
            if (v[0] === 3) {
                // id ref
                return { type: 'id', loc: l(), text: `$${v[1]}` };
            }
            if (v.length === 2) {
                return showBody(v[1], l);
            }
            const args: Body[] = [];
            unAPP(v, args);
            if (args[0] === 'NCASE' && args.length === 4) {
                return {
                    type: 'list',
                    loc: l(),
                    items: [
                        showBody(args[0], l),
                        {
                            type: 'table',
                            loc: l(),
                            kind: '[',
                            rows: [
                                [
                                    {
                                        type: 'id',
                                        loc: l(),
                                        text: '',
                                        ref: {
                                            type: 'placeholder',
                                            text: 'Zero',
                                        },
                                    },
                                    showBody(args[1], l),
                                ],
                                [
                                    {
                                        type: 'id',
                                        loc: l(),
                                        ref: {
                                            type: 'placeholder',
                                            text: '1+N',
                                        },
                                        text: '',
                                    },
                                    showBody(args[2], l),
                                ],
                            ],
                        },
                        showBody(args[3], l),
                    ],
                };
            }
            if (args[0] === 'PCASE' && args.length === 6) {
                return {
                    type: 'list',
                    loc: l(),
                    items: [
                        showBody(args[0], l),
                        {
                            type: 'table',
                            loc: l(),
                            kind: '[',
                            rows: [
                                [
                                    {
                                        type: 'id',
                                        loc: l(),
                                        text: '',
                                        ref: {
                                            type: 'placeholder',
                                            text: 'Pin',
                                        },
                                    },
                                    showBody(args[1], l),
                                ],
                                [
                                    {
                                        type: 'id',
                                        loc: l(),
                                        ref: {
                                            type: 'placeholder',
                                            text: 'Law',
                                        },
                                        text: '',
                                    },
                                    showBody(args[2], l),
                                ],
                                [
                                    {
                                        type: 'id',
                                        loc: l(),
                                        ref: {
                                            type: 'placeholder',
                                            text: 'App',
                                        },
                                        text: '',
                                    },
                                    showBody(args[3], l),
                                ],
                                [
                                    {
                                        type: 'id',
                                        loc: l(),
                                        ref: {
                                            type: 'placeholder',
                                            text: 'Nat',
                                        },
                                        text: '',
                                    },
                                    showBody(args[4], l),
                                ],
                            ],
                        },
                        showBody(args[5], l),
                    ],
                };
            }
            return {
                type: 'list',
                loc: l(),
                items: args.map((arg) => showBody(arg, l)),
            };
    }
};
const showLaw = (
    name: string,
    arity: number,
    body: Value,
    WIDTH: number,
    l: () => Loc,
): ABlock => {
    // if (arity === 0) {
    //     const total = showBody(toBody(body, 0), l);
    // }
    const args: string[] = [];
    for (let i = 1; i <= arity; i++) {
        args.push(`$${i}`);
    }
    const lets: Value[] = [];
    const inner = extractLets(body, lets);
    const maxIndex = arity + lets.length;
    const node: RecNode = {
        type: 'list',
        loc: l(),
        items: [
            { type: 'id', loc: l(), text: 'defn' },
            { type: 'id', loc: l(), text: name },
            {
                type: 'array',
                loc: l(),
                items: args.map((text) => ({ type: 'id', loc: l(), text })),
            },
            ...lets.map(
                (lt, i): RecNode => ({
                    type: 'list',
                    loc: l(),
                    items: [
                        { type: 'id', loc: l(), text: 'let' },
                        { type: 'id', loc: l(), text: `$${i + arity + 1}` },
                        showBody(toBody(lt, maxIndex), l),
                    ],
                }),
            ),
            showBody(toBody(inner, maxIndex), l),
        ],
    };

    const ps = parse(node);
    console.log('parsed', name, ps);
    return recNodeToText(node, ps, WIDTH);
};
const nameFn = (name: string, hash: string) => name || hash; //`${name}#${hash.slice(0, 4)}`;

export const showMore = (v: Val): ABlock => {
    const { pins, pinHashes, pinArities, root } = preparePins(v, nameFn);
    const toplevel: Record<string, ABlock> = {};
    const WIDTH = 50;
    let idx = 0;
    const l = (): Loc => [['repo', idx++]];
    const ctx: Ctx = {
        pins: pinHashes,
        nameFn,
        processLaw(name, arity, value) {
            pinArities[name] = Number(arity);
            addDeps(name, value);
            toplevel[name] = showLaw(name, arity, value, WIDTH, l);
        },
    };

    const pinDeps: Record<string, string[]> = {};
    const addDeps = (name: string, value: Body) => {
        const deps: string[] = [];
        findTopRefs(value, deps);
        pinDeps[name] = deps;
    };

    pins.forEach((nv, i) => {
        const hash = pinHashes[i];
        if (nv.v[0] === LAW) {
            const value = oneVal(nv.v[3], ctx);
            ctx.processLaw(hash, Number(nv.v[2]), value);
        } else {
            const value = oneVal(nv, ctx);
            addDeps(hash, value);
            const node: RecNode = {
                type: 'list',
                items: [
                    { type: 'id', text: 'def', loc: l() },
                    { type: 'id', text: hash, loc: l() },
                    showBody(value, l),
                ],
                loc: l(),
            };
            toplevel[hash] = recNodeToText(node, parse(node), WIDTH);
        }
    });

    const seen: Record<string, true> = {};
    const tops: ABlock[] = [];

    const lowest: Record<string, number> = {}

    const addFor = (top: string,) => {
        if (seen[top]) return;
        seen[top] = true;
        tops.push(toplevel[top]);
        if (!pinDeps[top]) {
            console.log(pinDeps, top);
            throw new Error(`not`);
        }
        pinDeps[top].forEach((name) => {
            addFor(name);
        });
    };

    const rootValue = oneVal(root, ctx);
    const rootDeps: string[] = [];
    findTopRefs(rootValue, rootDeps);
    rootDeps.forEach(addFor);
    const node = showBody(rootValue, l);
    const main = recNodeToText(node, parse(node), WIDTH);

    return tops.reverse().concat([main]).flat();

    // return [...Object.values(toplevel), main].flat();
};
export const rgb = ({ r, g, b }: { r: number; g: number; b: number }) =>
    `rgb(${r} ${g} ${b})`;

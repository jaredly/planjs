import { recNodeToText } from 'j3/one-world/client/cli/drawDocNode';
import { SimplestEvaluator } from 'j3/one-world/evaluators/simplest';
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

const unAPP = (v: Body, args: Body[]) => {
    if (typeof v === 'object' && v.length === 3) {
        unAPP(v[1], args);
        args.push(v[2]);
    } else {
        args.push(v);
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
    if (arity === 0) {
        const total = showBody(toBody(body, 0), l);
    }
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

    const ps = SimplestEvaluator.parse(node);
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
            toplevel[name] = showLaw(name, arity, value, WIDTH, l);
        },
    };
    pins.forEach((nv, i) => {
        const hash = pinHashes[i];
        if (nv.v[0] === LAW) {
            ctx.processLaw(hash, Number(nv.v[2]), oneVal(nv.v[3], ctx));
        } else {
            const node = showBody(oneVal(nv, ctx), l);
            toplevel[hash] = recNodeToText(
                node,
                SimplestEvaluator.parse(node),
                WIDTH,
            );
        }
    });

    const node = showBody(oneVal(root, ctx), l);
    const main = recNodeToText(node, SimplestEvaluator.parse(node), WIDTH);
    return [...Object.values(toplevel), main].flat();
};
export const rgb = ({ r, g, b }: { r: number; g: number; b: number }) =>
    `rgb(${r} ${g} ${b})`;

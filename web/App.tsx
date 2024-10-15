import React, { useEffect, useMemo, useState } from 'react';
import { getMain } from '../ps/parseTop';
import { plainBody, showNice } from '../pst';
import { LAW, PIN, Val } from '../runtime/types';
import {
    Ctx,
    extractLets,
    jsjit,
    oneVal,
    preparePins,
    toBody,
} from '../ps/normal/compile';

const builtins = `
(defn + [a b]
    (NCASE b (fn [a] (INC (+ a b))) a))
`;

const initialText = `
(defn ! [v _] v)
(defn + [a b]
    (NCASE b (fn [a] (INC (+ a b))) a))
(defn lcase [lst nil cons]
    (PCASE
        (! nil)
        (! nil)
        cons
        (! nil)
        lst))
(defn zip [f one two]
    (lcase one
        0
        (fn [a one]
            (lcase two
                0
                (fn [b two]
                    ((f a b) (zip f one two)))))))
(defn drop [n lst]
    (NCASE
        lst
        (fn [n_]
            (lcase lst lst
                (fn [a rest] (drop n_ rest))))
        n))
(defn take [n lst]
    (NCASE 0 (fn [n_]
        (lcase lst
            0
            (fn [head tail] (head (take n_ tail)))))
        n))
(defn fib [n]
    (let [self   (0 (1 (zip + self offset)))
          offset (drop 1 self)]
        (take n self)))
(def main (fib 10))
`;

const key = 'plan:sandbox';

import { Nodes, RecNode, toMap } from 'j3/one-world/shared/nodes';
import {
    ABlock,
    aBlockToString,
} from 'j3/one-world/shared/ir/block-to-attributed-text';
import { findPins, NVal } from '../runtime/arraybuffer';
import { natToAscii } from '../runtime/natToAscii';
import { Body, Value } from '../ps/normal/runtime';
import { IR, nodeToIR } from 'j3/one-world/shared/IR/intermediate';
import { iterTopNodes } from 'j3/one-world/client/cli/docNodeToIR';
import { irToBlock } from 'j3/one-world/shared/IR/ir-to-blocks';
import { recNodeToText } from 'j3/one-world/client/cli/drawDocNode';

const showBody = (v: Body): RecNode => {
    switch (typeof v) {
        case 'bigint':
        case 'number':
            return { type: 'id', loc: [], text: v + '' };
        case 'function':
            return { type: 'id', loc: [], text: natToAscii(v.nameNat) };
        case 'string':
            return { type: 'id', loc: [], text: v };
        case 'object':
            if (v[0] === 3) {
                // id ref
                return { type: 'id', loc: [], text: `$${v[1]}` };
            }
            if (v.length === 2) {
                return showBody(v[1]);
            }
            return {
                type: 'list',
                loc: [],
                items: [showBody(v[1]), showBody(v[2])],
            };
    }
};

const showLaw = (
    name: string,
    arity: number,
    body: Value,
    WIDTH: number,
): ABlock => {
    if (arity === 0) {
        const total = showBody(toBody(body, 0));
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
        loc: [],
        items: [
            { type: 'id', loc: [], text: 'defn' },
            { type: 'id', loc: [], text: name },
            {
                type: 'array',
                loc: [],
                items: args.map((text) => ({ type: 'id', loc: [], text })),
            },
            ...lets.map(
                (lt, i): RecNode => ({
                    type: 'list',
                    loc: [],
                    items: [
                        { type: 'id', loc: [], text: 'let' },
                        { type: 'id', loc: [], text: `${i + arity + 1}` },
                        showBody(toBody(lt, maxIndex)),
                    ],
                }),
            ),
            showBody(toBody(inner, maxIndex)),
        ],
    };

    // const nodes: Nodes = {};
    // const root = toMap(node, nodes);
    // const irs: Record<number, IR> = {};
    // iterTopNodes(
    //     root,
    //     { type: 'doc-node', doc: '', ids: [], toplevel: '' },
    //     nodes,
    //     (node, path) => {
    //         irs[node.loc] = nodeToIR(node, path, {
    //             styles: {}, // parsed.styles,
    //             layouts: {}, // parsed.layouts,
    //             tableHeaders: {}, // parsed.tableHeaders,
    //             getName: () => null,
    //         });
    //     },
    // );
    // irToBlock(irs[root], irs)

    return recNodeToText(node, SimplestEvaluator.parse(node), WIDTH);
};
import { SimplestEvaluator } from 'j3/one-world/evaluators/simplest';

const showMore = (v: Val): ABlock => {
    const { pins, pinHashes, pinArities, root } = preparePins(v);
    const toplevel: Record<string, ABlock> = {};
    const WIDTH = 50;
    const ctx: Ctx = {
        pins: pinHashes,
        processLaw(name, arity, value) {
            pinArities[name] = Number(arity);
            toplevel[name] = showLaw(name, arity, value, WIDTH);
        },
    };
    pins.forEach((nv, i) => {
        const hash = pinHashes[i];
        if (nv.v[0] === LAW) {
            ctx.processLaw(hash, Number(nv.v[2]), oneVal(nv.v[3], ctx));
        } else {
            const node = showBody(oneVal(nv, ctx));
            toplevel[hash] = recNodeToText(
                node,
                SimplestEvaluator.parse(node),
                WIDTH,
            );
        }
    });

    const node = showBody(oneVal(root, ctx));
    const main = recNodeToText(node, SimplestEvaluator.parse(node), WIDTH);
    return [...Object.values(toplevel), main].flat();
};

// const valToRecNode = (v: NVal, pins: NVal[]): RecNode => {
//     switch (v.v[0]) {
//         case PIN:
//             const ref = pins[v.v[1]];
//             if (ref.v[0] === LAW) {
//                 return { type: 'id', loc: [], text: natToAscii(ref.v[1]) };
//             } else {
//                 return { type: 'id', loc: [], text: `pin$${ref.v[1]}` };
//             }
//         case LAW: {
//             const args: RecNode[] = [];
//             for (let i = 0; i < v.v[2]; i++) {
//                 args.push({ type: 'id', loc: [], text: `$${i + 1}` });
//             }
//             return {
//                 type: 'list',
//                 items: [
//                     { type: 'id', loc: [], text: 'defn' },
//                     { type: 'id', loc: [], text: natToAscii(v.v[1]) },
//                     { type: 'array', loc: [], items: args },
//                     ...lets,
//                     bodyValToRecNode(),
//                 ],
//                 loc: [],
//             };
//         }
//     }
// };

const rgb = ({ r, g, b }: { r: number; g: number; b: number }) =>
    `rgb(${r} ${g} ${b})`;

export const aBlockToNodes = (block: ABlock) => {
    return block.map((line, l) => (
        <div key={l}>
            {line.map((chunk, i) => (
                <span
                    key={i}
                    style={{
                        ...chunk.style,
                        color: chunk.style?.color
                            ? rgb(chunk.style.color)
                            : undefined,
                        background: chunk.style?.background
                            ? rgb(chunk.style.background)
                            : undefined,
                    }}
                >
                    {chunk.text}
                </span>
            ))}
        </div>
    ));
};

export const App = () => {
    const [text, setText] = useState(localStorage[key] || initialText);

    useEffect(() => {
        localStorage[key] = text;
    }, [text]);

    const compiled = useMemo(() => {
        try {
            const main = getMain(builtins + text);
            // const full = showNice(main);
            const full = aBlockToNodes(showMore(main));
            let res = '';
            if (
                main.v[0] === PIN &&
                main.v[1].v[0] === LAW &&
                main.v[1].v[2] === 0n
            ) {
                const ran = showNice(jsjit.run(plainBody(main.v[1].v[3])));
                res = ran;
            } else {
                res = `Main should have 0 arguments, not ${main.v[0]}`;
            }
            return { full, res };
        } catch (err) {
            return {
                full: (err as Error).message + '\n' + (err as Error).stack,
                res: '',
            };
        }
    }, [text]);

    return (
        <div
            style={{
                width: '100vw',
                height: '100vh',
                display: 'flex',
                flexDirection: 'row',
            }}
        >
            <textarea
                style={{
                    flex: 1,
                    // width: 500,
                    // height: 800,
                }}
                value={text}
                onChange={(e) => setText(e.target.value)}
            />
            <div
                style={{
                    flex: 1,
                    whiteSpace: 'pre-wrap',
                    padding: 16,
                    fontFamily: 'monospace',
                    minWidth: 0,
                }}
            >
                {compiled.full}
                <br />
                {compiled.res}
            </div>
        </div>
    );
};

import React, { useEffect, useMemo, useState } from 'react';
import {
    Ctx,
    extractLets,
    jsjit,
    oneVal,
    preparePins,
    toBody,
} from '../ps/normal/compile';
import { getMain } from '../ps/parseTop';
import { plainBody, showNice } from '../pst';
import { APP, LAW, NAT, PIN, Val } from '../runtime/types';

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

import { recNodeToText } from 'j3/one-world/client/cli/drawDocNode';
import { SimplestEvaluator } from 'j3/one-world/evaluators/simplest';
import { ABlock } from 'j3/one-world/shared/ir/block-to-attributed-text';
import { Loc, RecNode } from 'j3/one-world/shared/nodes';
import { Body, Value } from '../ps/normal/runtime';
import { natToAscii } from '../runtime/natToAscii';

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
            return {
                type: 'list',
                loc: l(),
                items: [showBody(v[1], l), showBody(v[2], l)],
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

    debugger;
    const ps = SimplestEvaluator.parse(node);
    console.log('parsed', name, ps);
    return recNodeToText(node, ps, WIDTH);
};

const nameFn = (name: string, hash: string) => name || hash; //`${name}#${hash.slice(0, 4)}`;
const showMore = (v: Val): ABlock => {
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
    const [v, setV] = useState(50);

    useEffect(() => {
        localStorage[key] = text;
    }, [text]);

    const compiled = useMemo(() => {
        try {
            const main = getMain(builtins + text);
            // const full = showNice(main);
            const full = aBlockToNodes(showMore(main));
            let res = '';
            let slider = false;
            if (
                main.v[0] === PIN &&
                main.v[1].v[0] === LAW &&
                main.v[1].v[2] === 0n
            ) {
                const ran = showNice(jsjit.run(plainBody(main.v[1].v[3])));
                res = ran;
            } else {
                slider = true;
                const ran = showNice(
                    jsjit.run({ v: [APP, main, { v: [NAT, BigInt(v)] }] }),
                );
                res = ran;
                // res = `Main should have 0 arguments, not ${main.v[1]}`;
            }
            return { full, res, slider };
        } catch (err) {
            return {
                full: (err as Error).message + '\n' + (err as Error).stack,
                res: '',
                slider: false,
            };
        }
    }, [text, v]);

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
                {compiled.slider ? (
                    <input
                        type="range"
                        min="0"
                        max="200"
                        style={{ width: 600 }}
                        value={v}
                        onChange={(e) => setV(+e.target.value)}
                    />
                ) : null}
                <br />
                {compiled.res}
            </div>
        </div>
    );
};

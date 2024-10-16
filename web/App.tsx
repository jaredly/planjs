import React, { useEffect, useMemo, useState } from 'react';
import {
    clean,
    compileMain,
    jsjit,
    runMain,
    Toplevels,
} from '../ps/normal/compile';
import { getMain } from '../ps/parseTop';
import { plainBody, showNice } from '../pst';
import { APP, LAW, NAT, PIN } from '../runtime/types';

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

import { ABlock } from 'j3/one-world/shared/ir/block-to-attributed-text';
import { rgb, showMore } from './showMore';

export const aBlockToNodes = (block: ABlock) => {
    return block.map((line, l) => (
        <div key={l}>
            {line.map((chunk, i) => (
                <span
                    key={`${l}:${i}`}
                    style={{
                        ...chunk.style,
                        color: chunk.style?.color
                            ? rgb(chunk.style.color)
                            : undefined,
                        background: chunk.style?.background
                            ? rgb(chunk.style.background)
                            : undefined,
                        textDecorationStyle: 'dotted',
                    }}
                >
                    {chunk.text}
                </span>
            ))}
        </div>
    ));
};

import { reader, readerMulti } from 'j3/one-world/evaluators/boot-ex/reader';
import { IDRef, keyForLoc, RecNode } from 'j3/one-world/shared/nodes';
import { fromRecNode } from './astToValue';
import { fixGlobals, getExport, parse } from './format-parse';
import { recNodeToText } from 'j3/one-world/client/cli/drawDocNode';
import { forceDeep, show } from '../ps/normal/runtime';

export const App = () => {
    const [text, setText] = useState(localStorage[key] || initialText);
    const [v, setV] = useState(50);

    useEffect(() => {
        localStorage[key] = text;
    }, [text]);

    const compiled = useMemo(() => {
        const maxWidth = 50;
        try {
            const tops: RecNode[] = [];
            let i = 0;
            let fullText = builtins + text;

            const globals: Record<string, IDRef> = {
                NCASE: { type: 'builtin', kind: '' },
                INC: { type: 'builtin', kind: '' },
                PCASE: { type: 'builtin', kind: '' },
                LAW: { type: 'builtin', kind: '' },
                PIN: { type: 'builtin', kind: '' },
            };

            while (i < fullText.length) {
                const result = readerMulti(i, fullText, 'full', globals, false);
                if (!result) break;
                tops.push(result.node);
                i = result.i;
            }
            const full: JSX.Element[] = [];
            const nameForLoc: Record<string, string> = {};

            tops.forEach((top) => {
                const exp = getExport(top);
                if (exp) {
                    globals[exp.text] = {
                        type: 'toplevel',
                        kind: '',
                        loc: exp.loc,
                    };
                    nameForLoc[keyForLoc(exp.loc)] = exp.text;
                }
            });

            tops.forEach((top) => fixGlobals(top, globals));

            const topValues: Toplevels = {};

            tops.forEach((top, i) => {
                const parsed = parse(top);
                if (!parsed.top) {
                    throw new Error(
                        `cant parse I guess ${JSON.stringify(parsed.errors)}`,
                    );
                }
                let base =
                    (parsed.top.type === 'law' && parsed.top.name?.text) ||
                    `top${i}`;
                // base = clean(base);
                const body = fromRecNode(parsed.top, [], {
                    locHash(loc) {
                        return nameForLoc[keyForLoc(loc)];
                        // return loc.map((l) => `${l[0]}_${l[1]}`).join('__');
                    },
                    lawNum: 0,
                    processLaw(fns, name, args, lets, value) {
                        let hash =
                            fns === 0 ? base : `${base}_${fns}_${name ?? ''}`;

                        topValues[hash] = {
                            type: 'law',
                            name: hash,
                            args,
                            lets,
                            body: value,
                        };

                        return hash;
                    },
                });
                if (parsed.top.type !== 'law') {
                    topValues[base] = { type: 'plain', value: body };
                }

                const text = recNodeToText(
                    top,
                    parsed,
                    maxWidth,
                    (loc) => nameForLoc[keyForLoc(loc)],
                );
                full.push(
                    <div style={{ marginBottom: 16 }} key={i}>
                        {aBlockToNodes(text)}
                    </div>,
                );
            });

            let res = '';
            let slider = false;

            const code = compileMain(topValues);
            // res = code; // show(result);
            try {
                const result = runMain(code);
                if (typeof result === 'function') {
                    if (result.length === 0) {
                        res += '\n\n' + show(forceDeep(result()));
                    } else {
                        res += '\n\n' + show(forceDeep(result(BigInt(v))));
                        slider = true;
                    }
                }
            } catch (e) {
                const err = e as Error;

                res += `\n\n${err.message}\n${err.stack}`;
            }
            // res += '\n\n' + show(result);

            // const main = getMain(builtins + text);
            // const full = aBlockToNodes(showMore(main));
            // if (
            //     main.v[0] === PIN &&
            //     main.v[1].v[0] === LAW &&
            //     main.v[1].v[2] === 0n
            // ) {
            //     const ran = showNice(jsjit.run(plainBody(main.v[1].v[3])));
            //     res = ran;
            // } else {
            //     slider = true;
            //     const ran = showNice(
            //         jsjit.run({ v: [APP, main, { v: [NAT, BigInt(v)] }] }),
            //     );
            //     res = ran;
            // }

            return { full, res, slider, code };
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
                <div style={{ display: 'flex' }}>
                    <div style={{ flex: 1 }}>{compiled.full}</div>
                    <div
                        style={{
                            flex: 1,
                            minHeight: 0,
                            overflow: 'auto',
                            height: 500,
                        }}
                    >
                        {compiled.code}
                    </div>
                </div>
                <br />
                {compiled.slider ? (
                    <>
                        <input
                            type="range"
                            min="0"
                            max="200"
                            style={{ width: 600 }}
                            value={v}
                            onChange={(e) => setV(+e.target.value)}
                        />
                        {v}
                    </>
                ) : null}
                <br />
                {compiled.res}
            </div>
        </div>
    );
};

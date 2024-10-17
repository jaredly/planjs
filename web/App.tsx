import React, { useEffect, useMemo, useState } from 'react';
import { compileMain, runMain, Toplevels } from '../ps/normal/compile';
import { Controlled as CodeMirror } from 'react-codemirror2';
// import { clojure } from '@nextjournal/lang-clojure';
require('codemirror/mode/clojure/clojure');

// const builtins = `
// (defn + [a b]
//     (NCASE b (fn [a] (INC (+ a b))) a))
// `;

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
import { rgb } from './showMore';

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

import { recNodeToText } from 'j3/one-world/client/cli/drawDocNode';
import { keyForLoc } from 'j3/one-world/shared/nodes';
import { forceDeep, show } from '../ps/normal/runtime';
import { addMain, setupStepper } from '../ps/stepper/setupStepper';
import { prettyMValue, showMValue } from '../ps/stepper/showMValue';
import { fromAST } from './astToValue';
import { parse } from './format-parse';
import { readSeveral } from './readSeveral';
import { cloneMemory, liveHeap } from '../ps/stepper/types';
import { step } from '../ps/stepper/step';
import { deep } from '../ps/stepper/runtime';

export const App = () => {
    const [text, setText] = useState<string>(localStorage[key] || initialText);
    const [v, setV] = useState(10);

    const [stepN, setStep] = useState(100);

    useEffect(() => {
        localStorage[key] = text;
    }, [text]);

    const compiled = useMemo(() => {
        const maxWidth = 50;
        try {
            let fullText = text;
            const { tops, parseds, nameForLoc, globals } =
                readSeveral(fullText);

            const topValues: Toplevels = {};

            const full: JSX.Element[] = [];
            tops.forEach((top, i) => {
                const parsed = parseds[i];
                if (!parsed.top) throw new Error('unreaachable');
                let base =
                    (parsed.top.type === 'law' && parsed.top.name?.text) ||
                    `top${i}`;
                // base = clean(base);
                const body = fromAST(parsed.top, [], {
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

            const stepper = setupStepper(parseds.map((p) => p.top!));

            let code = 'not now';
            // try {
            //     const result = runMain(code);
            //     if (typeof result === 'function') {
            //         if (result.length === 0) {
            //             res += '\n\n' + show(forceDeep(result()));
            //         } else {
            //             res += '\n\n' + show(forceDeep(result(BigInt(v))));
            //             slider = true;
            //         }
            //     }
            // } catch (e) {
            //     const err = e as Error;
            //     res += `\n\n${err.message}\n${err.stack}`;
            // }

            return { full, code, stepper };
        } catch (err) {
            return {
                full: (err as Error).message + '\n' + (err as Error).stack,
                res: '',
                slider: false,
            };
        }
    }, [text, v]);

    const lol = useMemo(() => {
        const { stepper } = compiled;
        if (!stepper) return;

        let slider = false;
        if (stepper.memory.laws.main.arity === 1) {
            slider = true;
        }

        const memory = cloneMemory(stepper.memory);

        const dest = addMain(
            memory,
            memory.laws.main.arity === 1 ? [{ type: 'NAT', v: BigInt(v) }] : [],
        );

        let i = 0;
        for (; i < stepN && memory.stack.length; i++) {
            step(memory);
        }
        while (i++ < stepN && deep(memory, dest)) {
            for (; i < stepN && memory.stack.length; i++) {
                step(memory);
            }
        }

        return {
            memory,
            dest,
            res: prettyMValue(memory.heap[dest], memory),
            slider,
        };
    }, [compiled.stepper, stepN]);

    return (
        <div
            style={{
                width: '100vw',
                height: '100vh',
                display: 'flex',
                flexDirection: 'row',
            }}
        >
            <div
                style={{
                    // flex: 1,
                    alignSelf: 'stretch',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <CodeMirror
                    value={text}
                    options={{
                        mode: 'clojure',
                        theme: 'material-ocean',
                        lineNumbers: true,
                    }}
                    onBeforeChange={(_, __, value) => {
                        console.log(value);
                        setText(value);
                    }}
                    onChange={(editor, data, v) => {}}
                />
            </div>
            <div
                style={{
                    flex: 1,
                    whiteSpace: 'pre-wrap',
                    padding: 16,
                    fontFamily: 'monospace',
                    minWidth: 0,
                }}
            >
                {lol?.slider ? (
                    <label>
                        Input
                        <input
                            type="range"
                            min="0"
                            max="200"
                            style={{ width: 600 }}
                            value={v}
                            onChange={(e) => setV(+e.target.value)}
                        />
                        {v}
                    </label>
                ) : null}
                <br />
                {lol ? (
                    <label>
                        Steps:
                        <input
                            type="range"
                            min="0"
                            max="2000"
                            style={{ width: 600 }}
                            value={stepN}
                            onChange={(e) => setStep(+e.target.value)}
                        />
                        {stepN}
                    </label>
                ) : null}
                <br />
                {compiled.res}
                {/* <div style={{ display: 'flex' }}>
                    <div style={{ flex: 1 }}>{compiled.full}</div>
                    <div
                        style={{
                            flex: 1,
                            minHeight: 0,
                            overflow: 'auto',
                            // height: 500,
                        }}
                    >
                        {compiled.code}
                    </div>
                </div> */}
                <br />
                {lol ? (
                    <>
                        {lol.res}
                        <table>
                            <tbody>
                                {lol.memory.heap.map((v, i) => (
                                    <tr key={i}>
                                        <td>{i}</td>
                                        <td>{showMValue(v)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {Object.entries(lol.memory.laws).map(
                            ([name, { buffer, arity }]) => (
                                <div key={name} style={{ padding: 16 }}>
                                    <div>
                                        {name} (arity {arity})
                                    </div>
                                    <table>
                                        <tbody>
                                            {buffer.map((v, i) => (
                                                <tr key={i}>
                                                    <td>{i}</td>
                                                    <td>{showMValue(v)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ),
                        )}
                        {/* {JSON.stringify(lol.laws, (_, v) =>
                            typeof v === 'bigint' ? v + '' : v,
                        )} */}
                    </>
                ) : null}
                <br />
            </div>
            <div
                style={{
                    flex: 1,
                    whiteSpace: 'pre-wrap',
                    padding: 16,
                    fontFamily: 'monospace',
                    minWidth: 0,
                }}
            >
                Other here
                {lol ? (
                    <div>
                        <table>
                            <tbody>
                                {liveHeap(lol.memory, lol.dest).map(
                                    ({ value, i }) => (
                                        <tr key={i}>
                                            <td>{i}</td>
                                            <td>{showMValue(value)}</td>
                                        </tr>
                                    ),
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : null}
            </div>
        </div>
    );
};

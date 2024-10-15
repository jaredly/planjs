import React, { useEffect, useMemo, useState } from 'react';
import { jsjit } from '../ps/normal/compile';
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

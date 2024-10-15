import React, { useEffect, useMemo, useState } from 'react';
import { getMain } from '../ps/parseTop';
import { plainBody, showNice } from '../pst';
import { LAW, PIN } from '../runtime/types';
import { jsjit } from '../ps/normal/compile';

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

export const App = () => {
    const [text, setText] = useState(localStorage[key] || initialText);

    useEffect(() => {
        localStorage[key] = text;
    }, [text]);

    const compiled = useMemo(() => {
        try {
            const main = getMain(builtins + text);
            const full = showNice(main);
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

import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { APPS, NAT } from '../runtime/types';
import { jsjit } from './compile';
import { getMain } from './parseTop';

test('simple', () => {
    const main = getMain(`(defn main [x] (1 x))`);
    const res = jsjit.run(APPS(main, { v: [NAT, 10n] }));
    expect(res).toEqual('[1, 10]');
});

test('add', () => {
    const main = getMain(`
(defn + [a b] (NCASE b (fn [a] (INC (+ a b))) a))

(defn main [x] (+ 12 x))
        `);
    const res = jsjit.run(APPS(main, { v: [NAT, 10n] }));
    expect(res).toEqual('22');
});

test('map', () => {
    const main = getMain(`
(defn + [a b] (NCASE b (fn [a] (INC (+ a b))) a))
(defn map_ [map f head tail] ((f head) (map f tail)))
(defn map [f lst] (PCASE 0 0 (map_ map f) f lst))

(defn main [x] (map (+ x) [1 2 3 4]))
        `);
    const res = jsjit.run(APPS(main, { v: [NAT, 10n] }));
    expect(res).toEqual('[11, 12, 13, 14]');
});

test('fibplease', () => {
    const main = getMain(readFileSync('./ps/example_fib.clj', 'utf8'));
    const res = jsjit.run(APPS(main, { v: [NAT, 10n] }));
    expect(res).toEqual('[0, 1, 1, 2, 3, 5, 8, 13, 21, 34, PIN(nil_e620)]');
});

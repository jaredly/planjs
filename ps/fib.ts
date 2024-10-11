import { asciiToNat, natToAscii } from '../runtime/natToAscii';
import { APP, APPS, force, pin, pinLaw, show, Value as V } from './runtime';

pinLaw((x: V, p: V, l: V, a: V, n: V) => APPS('PCASE', p, l, a, n, x), 'pcase');
pinLaw((x: V, z: V, p: V) => APPS('NCASE', z, p, x), 'ncase');
pinLaw((x: V) => APP('INC', x), 'inc');
pinLaw((x: V, _: V) => x, '!');

pinLaw((plus: V, b: V, a: V) => APP('INC', APPS(plus, a, b)), '+1');
pinLaw(function (this: V, a: V, b: V) {
    return APPS('ncase', a, b, APPS('+1', this, b));
}, '+');

pinLaw(
    (lst: V, nil: V, cons: V) =>
        APPS('pcase', lst, APP('!', nil), APP('!', nil), cons, APP('!', nil)),
    'lcase',
);

pin(0, 'nil');

pinLaw(
    (zip: V, f: V, a: V, one: V, b: V, two: V) =>
        APPS(APPS(f, a, b), APPS(zip, f, one, two)),
    'zip2',
);

pinLaw(
    (zip: V, f: V, two: V, a: V, one: V) =>
        APPS('lcase', two, 'nil', APPS('zip2', zip, f, a, one)),
    'zip1',
);
pinLaw(function (this: V, f: V, one: V, two: V) {
    return APPS('lcase', one, 'nil', APPS('zip1', this, f, two));
}, 'zip');

// pinLaw((a: Value, b: Value, c: Value) {
//     return APP('INC', APPS(a, b, c));
// }, '$plus1');
// pinLaw(function $plus(this: Value, a: Value, b: Value) {
//     return APPS('NCASE', b, APPS('$plus1', this, b), a);
// }, 'lol');

const lst = (...args: V[]): V => {
    if (args.length === 1) return args[0];
    return APP(args[0], lst(...args.slice(1)));
};

// console.log(show(force(APPS('lol', 2, 10))));
console.log(show(force(APPS('zip', '+', lst(1, 2, 3, 4), lst(1, 2, 3, 4)))));

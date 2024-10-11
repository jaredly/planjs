import { asciiToNat, natToAscii } from '../runtime/natToAscii';
import { APP, APPS, force, pinLaw, show, Value } from './runtime';

pinLaw(function $plus1(a: Value, b: Value, c: Value) {
    return APP('INC', APPS(a, b, c));
});
pinLaw(function $plus(this: Value, a: Value, b: Value) {
    return APPS('NCASE', b, APPS('$plus1', this, b), a);
}, '$plus');

console.log(show(force(APPS('$plus', 2, 10))));

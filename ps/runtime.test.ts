import { test, expect } from 'bun:test';
import { jsjit } from './compile';
import { APPS, NAT } from '../runtime/types';
import { readTop } from './readTop';
import { readFileSync } from 'fs';
import { named, parseTop } from './parseTop';

const tops = readTop(readFileSync('./ps/example_fib.clj', 'utf8'));
tops.forEach(parseTop);

test('fibplease', () => {
    const res = jsjit.run(APPS(named.main, { v: [NAT, 10n] }));
    expect(res).toEqual('[0, 1, 1, 2, 3, 5, 8, 13, 21, 34, PIN(nil_e620)]');
});

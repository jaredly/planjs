import { test, expect } from 'bun:test';
import { readSeveral } from '../../web/readSeveral';
import { stackMain } from './runtime';

const check = (input: string, output: string) => {
    const { parseds } = readSeveral(input);
    const { memory } = stackMain(parseds);
    if (!memory.laws.main) {
        throw new Error(`no main law`);
    }
};

test('just a number', () => {
    check(`(def main 30)`, '30');
});

test('inc it up', () => {
    check(`(def main (INC 29))`, '30');
});

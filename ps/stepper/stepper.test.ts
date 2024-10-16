import { test, expect } from 'bun:test';
import { readSeveral } from '../../web/readSeveral';
import { deep, prepareLaw, prettyMValue, stackMain, step } from './runtime';

const check = (input: string, output: string) => {
    const { parseds } = readSeveral(input);
    const { memory } = stackMain(parseds);
    if (!memory.laws.main) {
        throw new Error(`no main law`);
    }
    const main = prepareLaw(memory.laws.main.buffer, [], memory.heap.length);
    memory.heap.push(...main);
    const dest = memory.heap.length - 1;
    memory.stack.push({ at: dest });

    // const logs: string[] = [];
    // const log = () => {
    //     logs.push(prettyMValue(memory.heap[dest], memory));
    // };

    // log();
    for (let i = 0; i < 1000 && memory.stack.length; i++) {
        step(memory);
        // log();
    }

    let depth = 0;
    while (deep(memory, dest) && depth++ < 1000) {
        for (let i = 0; i < 1000 && memory.stack.length; i++) {
            step(memory);
            // log();
        }
    }

    // console.log(logs);
    if (memory.stack.length) {
        throw new Error('why is there morestack');
    }
    expect(prettyMValue(memory.heap[dest], memory)).toEqual(output);
};

test('just a number', () => {
    check(`(def main 30)`, '30');
});

test('inc it up', () => {
    check(`(def main (INC 29))`, '30');
});

test('call a fn', () => {
    check(
        `
        (defn hi [x] (INC (INC x)))
        (def main (hi 29))`,
        '31',
    );
});

test('call a fn with two args', () => {
    check(
        `
        (defn hi [x y] (INC (INC x)))
        (def main (hi 29 1))`,
        '31',
    );
});

test('call a fn with two args', () => {
    check(
        `
        (defn hi [x y] (INC (INC y)))
        (def main (hi 29 1))`,
        '3',
    );
});

test('lets do an apppp', () => {
    check(`(def main (1 2 3))`, '(1, 2, 3)');
});

test('do we force deep', () => {
    check(`(def main (1 (INC 1) (INC (INC 1))))`, '(1, 2, 3)');
});

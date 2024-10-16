import { test, expect } from 'bun:test';
import { readSeveral } from '../../web/readSeveral';
import {
    deep,
    Memory,
    prepareLaw,
    prettyMValue,
    showMValue,
    stackMain,
    step,
} from './runtime';

const setup = (input: string) => {
    const { parseds } = readSeveral(input);
    const { memory } = stackMain(parseds);
    if (!memory.laws.main) {
        throw new Error(`no main law`);
    }
    const main = prepareLaw(memory.laws.main.buffer, [], memory.heap.length);
    memory.heap.push(...main);
    const dest = memory.heap.length - 1;
    memory.stack.push({ at: dest });

    return { dest, memory };
};

const check = (input: string, output: string) => {
    const { dest, memory } = setup(input);

    const logs: string[] = [];
    const log = () => {
        logs.push(prettyMValue(memory.heap[dest], memory));
    };

    log();
    for (let i = 0; i < 20 && memory.stack.length; i++) {
        step(memory);
        log();
    }

    let depth = 0;
    while (deep(memory, dest) && depth++ < 20) {
        logs.push(JSON.stringify(memory.stack));
        for (let i = 0; i < 20 && memory.stack.length; i++) {
            step(memory);
            log();
        }
    }

    if (memory.stack.length) {
        // console.log(logs);
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

test('a little ncase as a treat', () => {
    check(`(def main (NCASE 2 10 0))`, '2');
    // check(`(def main (NCASE 2 INC 5))`, '5');
    // check(`(def main (NCASE 2 10 (1 1)))`, '2');
});

const debugMem = (mem: Memory) => {
    return (
        mem.heap
            .map((x, i) => `${i.toString().padStart(2, ' ')}: ${showMValue(x)}`)
            .join('\n') +
        '\n---\n' +
        mem.stack
            .map(
                (frame, i) =>
                    `${i.toString().padStart(2, ' ')}: ${frame.at}${
                        frame.step ? ' ' + frame.step : ''
                    }`,
            )
            .join('\n')
    );
};

test('ncase with nonzero tho', () => {
    check(`(def main (NCASE 2 INC 5))`, '5');
});

test('ncase with madness', () => {
    check(`(def main (NCASE 2 10 (1 1)))`, '2');
    // const { dest, memory } = setup(`(def main (NCASE 2 INC (1 1)))`);
    // expect('\n' + debugMem(memory)).toMatchSnapshot();
    // step(memory);
    // expect('\n' + debugMem(memory)).toMatchSnapshot();
    // step(memory);
    // expect('\n' + debugMem(memory)).toMatchSnapshot();
    // step(memory);
    // expect('\n' + debugMem(memory)).toMatchSnapshot();
    // step(memory);
    // expect('\n' + debugMem(memory)).toMatchSnapshot();
    // expect(prettyMValue(memory.heap[dest], memory)).toEqual('2');
});

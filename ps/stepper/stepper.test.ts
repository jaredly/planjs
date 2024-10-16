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

const check = (input: string, output: string, monitor = false) => {
    const { dest, memory } = setup(input);

    const logs: string[] = [];
    const log = () => {
        if (monitor) {
            logs.push(debugMem(memory));
        }
    };

    log();
    for (let i = 0; i < 20 && memory.stack.length; i++) {
        step(memory);
        log();
    }

    if (memory.stack.length) {
        if (monitor) {
            expect(logs.join('\n\n')).toMatchSnapshot();
        }
        // console.log(logs);
        throw new Error('why is there morestack - before deep');
    }

    let depth = 0;
    while (deep(memory, dest) && depth++ < 20) {
        logs.push(JSON.stringify(memory.stack));
        for (let i = 0; i < 20 && memory.stack.length; i++) {
            step(memory);
            log();
        }
    }

    if (monitor) {
        expect(logs.join('\n\n')).toMatchSnapshot();
    }

    if (memory.stack.length) {
        // console.log(logs);
        throw new Error('why is there morestack - after deep');
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
    check(`(def main (1 2 3))`, '(1 2 3)');
});

test('do we force deep', () => {
    check(`(def main (1 (INC 1) (INC (INC 1))))`, '(1 2 3)');
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
});

test(`nested fn`, () => {
    check(`(def main ((fn [x] (x x)) 2))`, '(2 2)');
});

test(`nested fn w/ scope`, () => {
    check(
        `
        (defn doot [z] ((fn [x] (z x)) 23))
        (def main (doot 2))`,
        '(2 23)',
    );
});

test('can we please plus', () => {
    check(
        `
    (defn + [a b] (NCASE b (fn [a_] (INC (+ a_ b))) a))
    (def main (+ 2 3))
        `,
        '5',
    );
});

test('now for pcase(n) if you pclease', () => {
    check(`(def main (PCASE 0 1 2 3 0))`, '(3 0)');
});

test('now for pcase(a) if you pclease', () => {
    check(`(def main (PCASE 7 8 9 10 (5 6)))`, '(9 5 6)', true);
});

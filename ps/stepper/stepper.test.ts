import { test, expect } from 'bun:test';
import { readSeveral } from '../../web/readSeveral';
import {
    deep,
    Memory,
    MValue,
    prepareLaw,
    prettyMValue,
    showHeap,
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

    if (monitor) {
        expect(
            Object.entries(memory.laws)
                .map(
                    ([name, { buffer, arity }]) =>
                        `LAW ${name} (arity ${arity})\n${showHeap(buffer)}`,
                )
                .join('\n\n'),
        ).toMatchSnapshot();
        expect('Initial Heap:\n' + showHeap(memory.heap)).toMatchSnapshot();
    }

    const logs: string[] = [];
    const log = () => {
        if (monitor) {
            logs.push(debugMem(memory));
        }
    };
    const slog = monitor
        ? (...args: any[]) =>
              logs.push(
                  args
                      .map((m) =>
                          typeof m === 'string' ? m : JSON.stringify(m),
                      )
                      .join(' '),
              )
        : undefined;

    log();
    for (let i = 0; i < 20 && memory.stack.length; i++) {
        try {
            step(memory, slog);
        } catch (err) {
            expect(logs.join('\n\n')).toMatchSnapshot();
            throw err;
        }
        if (monitor) {
            logs.push(prettyMValue(memory.heap[dest], memory));
        }
        log();
    }

    if (monitor) {
        logs.push(`-- finished stack -------------------------------`);
        logs.push(prettyMValue(memory.heap[dest], memory));
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
        showHeap(mem.heap) +
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
    check(`(def main (PCASE 7 8 9 10 (5 6)))`, '(9 5 6)');
});

test('lcase', () => {
    check(
        `
(defn ! [v _] v)
(defn lcase [lst nil cons]
    (PCASE (! nil) (! nil) cons (! nil) lst))

(def main (lcase (1 2) 0 5))
        `,
        '(5 1 2)',
    );

    check(
        `
(defn ! [v _] v)
(defn lcase [lst nil cons]
    (PCASE (! nil) (! nil) cons (! nil) lst))

(def main (lcase 2 7 5))
        `,
        '7',
    );
});

test('take', () => {
    check(
        `
(defn ! [v _] v)
(defn lcase [lst nil cons]
    (PCASE (! nil) (! nil) cons (! nil) lst))
(defn take [n lst]
    (NCASE 0 (fn [n_]
        (lcase lst
            0
            (fn [head tail] (head (take n_ tail)))))
        n))

(def main (take 3 (1 (2 (3 (4 5))))))
        `,
        '(1 (2 (3 0)))',
    );
});

test('tinf', () => {
    check(
        `
(defn ! [v _] v)
(defn lcase [lst nil cons]
    (PCASE (! nil) (! nil) cons (! nil) lst))
(defn take [n lst]
    (NCASE 0 (fn [n_]
        (lcase lst
            0
            (fn [head tail] (head (take n_ tail)))))
        n))

(def main
    (let inf (5 inf))
    (take 3 inf))
        `,
        '(5 (5 (5 0)))',
        true,
    );
});

test.skip('annnnnd now like ... maybe fibonacci', () => {
    check(
        `
(defn + [a b]
    (NCASE b (fn [a] (INC (+ a b))) a))

(defn ! [v _] v)

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
    (let self (0 (1 (zip + self offset))))
    (let offset (drop 1 self))
    (take n self))

(defn inf [x] (let self (x self)) self)

(defn main [n] (take 5 (inf 2)))

        `,
        `(2 2 2 2 2)`,
    );
});

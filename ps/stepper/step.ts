import { natToAscii } from '../../runtime/natToAscii';
import { getValue, unwrap, evaluated, alloc, nat, showHeap } from './runtime';
import { Memory } from './types';
import { prepareLaw } from './prepareLaw';

export const step = (memory: Memory, log?: (...v: any[]) => void) => {
    const frame = memory.stack[0];
    const next = (v: number, reason: string, selfToo = false) => {
        if (memory.stack[0]?.at === v) {
            // throw new Error('why already');
            // if (!selfToo) return;
        }
        if (selfToo) memory.stack.unshift(frame);
        memory.stack.unshift({ at: v, reason });
    };
    const v = getValue(memory, frame.at);
    switch (v.type) {
        case 'NAT':
        case 'LAW':
            memory.stack.shift();
            return;
        case 'APP': {
            if (frame.step === null) {
                frame.step = 'f';
                next(v.f.v, 'resolve APP f');
                // memory.stack.unshift({ at: v.f.v });
                return;
            }
            v.ev = true;
            memory.stack.shift();
            const inner = unwrap(memory, v.f);
            if (!inner) {
                return;
            }
            const [f, args] = inner;
            const fv = getValue(memory, f.v);
            if (fv.type === 'APP') {
                return;
            }
            args.push(v.x);
            if (fv.type === 'NAT') {
                if (f.type === 'PIN') {
                    switch (fv.v) {
                        case 0n: // LAW
                            throw new Error('op law not sup');
                        case 1n: // PCASE
                            if (args.length !== 5) {
                                return;
                            }
                            const [p, l, a, n, x] = args;
                            const value = evaluated(memory, x);
                            if (value == null) {
                                // needs eval
                                v.ev = false;
                                // memory.stack.unshift(frame);
                                frame.step = 'x';
                                next(x.v, 'PCASE value force', true);
                                // memory.stack.unshift({ at: x.v });
                                return;
                            }

                            switch (value.type) {
                                // PIN
                                // LAW
                                case 'APP': {
                                    next(frame.at, 'PCASE app');
                                    // memory.stack.unshift({ at: frame.at });
                                    memory.heap[frame.at] = {
                                        type: 'APP',
                                        ev: false,
                                        f: {
                                            type: 'LOCAL',
                                            v: alloc(memory, {
                                                type: 'APP',
                                                ev: false,
                                                f: a,
                                                x: value.f,
                                            }),
                                        },
                                        x: value.x,
                                    };
                                    return;
                                }
                                case 'NAT': {
                                    next(frame.at, 'PCASE nat');
                                    // memory.stack.unshift({ at: frame.at });
                                    memory.heap[frame.at] = {
                                        type: 'APP',
                                        ev: false,
                                        f: n,
                                        // SOTPSHSOP this is wasteful, don't actually need to alloc
                                        x: {
                                            type: 'LOCAL',
                                            v: alloc(memory, value),
                                        },
                                    };
                                    return;
                                }
                            }

                            return;
                        case 2n: {
                            // NCASE
                            if (args.length !== 3) {
                                return;
                            }
                            const n = nat(memory, args[2]);
                            if (n == null) {
                                // needs eval
                                v.ev = false;
                                // memory.stack.unshift(frame);
                                frame.step = 'x';
                                // memory.stack.unshift({
                                //     at: args[2].v,
                                // });
                                next(args[2].v, 'NCASE arg force', true);
                                return;
                            }

                            // Now to do the ncasing
                            if (n === 0n) {
                                // memory.stack.unshift({ at: frame.at });
                                next(frame.at, 'NCASE 0');
                                memory.heap[frame.at] = {
                                    type: 'REF',
                                    ref: args[0],
                                };
                            } else {
                                next(frame.at, 'NCASE 1+n');
                                // memory.stack.unshift({ at: frame.at });
                                memory.heap[frame.at] = {
                                    type: 'APP',
                                    ev: false,
                                    f: args[1],
                                    x: {
                                        type: 'LOCAL',
                                        v: alloc(memory, {
                                            type: 'NAT',
                                            v: n - 1n,
                                        }),
                                    },
                                };
                            }
                            return;
                        }
                        case 3n: {
                            // INC
                            if (args.length !== 1) {
                                return;
                            }
                            const n = nat(memory, args[0]);
                            if (n == null) {
                                // needs eval
                                v.ev = false;
                                // memory.stack.unshift(frame);
                                frame.step = 'x';
                                // memory.stack.unshift({
                                //     at: args[0].v,
                                // });
                                next(args[0].v, 'INC force arg', true);
                                return;
                            }
                            memory.heap[frame.at] = {
                                type: 'NAT',
                                v: n + 1n,
                            };
                            return;
                        }
                        case 4n: // PIN
                            throw new Error('op pin not sup');
                    }
                    return;
                } else {
                    return;
                }
            }

            // OK SO here's where we get a little fancy
            // because we take the law's heap
            // and we dump it onto the heap
            // and then ... like ... add a frame pointer ...
            const name = natToAscii(fv.v);

            if (name === '+' && args.length === 2) {
                const a = evaluated(memory, args[0]);
                if (a == null) {
                    // needs eval
                    v.ev = false;
                    // memory.stack.unshift(frame);
                    frame.step = 'x';
                    // memory.stack.unshift({ at: args[0].v });
                    next(args[0].v, '+ jet a', true);
                    return;
                }
                const b = evaluated(memory, args[1]);
                if (b == null) {
                    // needs eval
                    v.ev = false;
                    // memory.stack.unshift(frame);
                    frame.step = 'x';
                    // memory.stack.unshift({ at: args[1].v });
                    next(args[1].v, '+ jet b', true);
                    return;
                }
                if (a.type === 'NAT' && b.type === 'NAT') {
                    memory.heap[frame.at] = { type: 'NAT', v: a.v + b.v };
                    return;
                }
            }

            const law = memory.laws[name];
            if (args.length !== law.arity) {
                return; // not gonna
            }

            if (log) {
                log('at', frame, 'calling law', name, 'with args', args);
            }

            const nvs = prepareLaw(law.buffer, args, memory.heap.length);
            if (!nvs.length) throw new Error('metpy law??');

            if (log) {
                log('Heap to add:');
                log(showHeap(nvs, memory.heap.length));
            }

            memory.heap[frame.at] = nvs.pop()!;
            memory.heap.push(...nvs);
            memory.stack.unshift({ at: frame.at, reason: `law ${name} body` });
            return;
        }
    }
};

import ansis from 'ansis';
import { OPCODE, OPNAMES, OPS } from './types';

type Perf = {
    ops: Record<OPCODE, number>;
    laws: Record<string, number>;
    execs: number;
    start: number;
    end: number;
};
export let perf: null | Perf = null;

export const trackPerf = () => {
    perf = {
        laws: {},
        execs: 0,
        ops: {
            [OPS.PIN]: 0,
            [OPS.LAW]: 0,
            [OPS.INC]: 0,
            [OPS.NCASE]: 0,
            [OPS.PCASE]: 0,
        },
        start: Date.now(),
        end: 0,
    };
};
export const reportPerf = (): Perf | null => {
    if (!perf) return null;
    const got = { ...perf, end: Date.now() };
    perf = null;
    return got;
};
export const perfMap = (perf: Perf) => {
    const map: Record<string, number> = { ...perf.laws };
    Object.entries(perf.ops).forEach(([code, count]) => {
        map[OPNAMES[+code]] = count;
    });
    map.execs = perf.execs;
    return map;
};
export const showPerf = (perf: Perf) => {
    console.log(
        ansis.green(`Time: ${((perf.end - perf.start) / 1000).toFixed(2)}s`),
    );
    console.log(`execs`, perf.execs);
    console.log(ansis.blue('primops'));
    Object.entries(perf.ops).forEach(([code, count]) => {
        console.log(` - ${OPNAMES[+code]} : ${count}`);
    });
    console.log(ansis.blue('laws'));
    Object.keys(perf.laws)
        .sort()
        .forEach((name) => {
            console.log(` - ${name || '<anon>'} : ${perf.laws[name]}`);
        });
};

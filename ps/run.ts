import { readFileSync, writeFileSync } from 'fs';
import { readTop } from './readTop';
import { runtime2 } from '../runtime/runtime2';
import { runtime3 } from '../runtime/runtime3';
// import {roundTrip} from '../runtime/runtime3';
import { APPS } from '../runtime/types';
import { NAT, Val } from '../runtime/types';
import { parse as parseNice, showNice } from '../pst';
import { perfMap, reportPerf, showPerf, trackPerf } from '../runtime/perf';
import { jsjit } from './compile';
import { parseTop, named } from './parseTop';

const usage = `run.ts [opts] fname ...args
opts:
- --runtime=2|3
`;

let [_, __, ...args] = process.argv;

const opts: Record<string, string | boolean> = {};
args = args.filter((arg) => {
    if (arg.startsWith('--')) {
        const [name, value] = arg.slice(2).split('=');
        opts[name] = value ?? true;
        return false;
    }
    return true;
});
const fname = args.shift();

if (!fname) {
    console.log(usage);
    process.exit(1);
}

const rtn = opts['runtime'] ?? opts['r'];
const rt = rtn === '3' ? runtime3 : rtn === 'jit' ? jsjit : runtime2;
console.log(`RUNTIME: ${rtn}`);

// We use the new hotness
rt.setRequireOpPin(true);

const tops = readTop(readFileSync(fname, 'utf8'));
// console.log(tops);
tops.forEach(parseTop);

if (opts['show'] || opts['plan']) {
    console.log(showNice(rt.run(named.main)));
}

// Object.entries(named).forEach(([name, v]) => {
//     console.log(name, v);
// });

trackPerf();
if (args.length) {
    console.log('got arghs', args.length);
    console.log(
        showNice(
            rt.run(
                APPS(
                    named.main,
                    ...args.map((a): Val => ({ v: [NAT, BigInt(+a)] })),
                ),
            ),
        ),
    );
} else {
    console.log('here we are');
    console.log(showNice(rt.run(named.main)));
}
showPerf(reportPerf()!);

const make_chart = opts['chart'];

if (make_chart) {
    const all: Record<string, number>[] = [];
    const allNames: string[] = [];
    for (let i = 0; i < 15; i++) {
        trackPerf();
        rt.run(
            APPS(
                named.main,
                ...args.map((a): Val => ({ v: [NAT, BigInt(i)] })),
            ),
        );
        const line = perfMap(reportPerf()!);
        all.push(line);
        Object.keys(line).forEach((name) => {
            if (!allNames.includes(name)) {
                allNames.push(name);
            }
        });
    }
    allNames.sort();
    writeFileSync(
        './perf.csv',
        allNames.join(',') +
            '\n' +
            all
                .map((row) => allNames.map((name) => row[name] ?? 0).join(','))
                .join('\n'),
    );
    console.log('wrote to perf.csv');
}

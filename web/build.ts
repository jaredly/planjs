import { watch } from 'fs';
import { join } from 'path';

const bounce = (time: number, fn: () => unknown) => {
    let wait: null | Timer = null;
    return () => {
        if (wait != null) clearTimeout(wait);
        wait = setTimeout(() => fn(), time);
    };
};

let edited: string[] = [];
const rebuild = bounce(10, () => {
    console.log('rebuilding for', edited);
    edited = [];
    Promise.all([
        Bun.build({
            entrypoints: ['./web/run.tsx'],
            outdir: './web',
            naming: 'run.js',
        }),
        // Bun.build({
        //     entrypoints: ['./one-world/client/cli/xterm/run.ts'],
        //     outdir: './',
        //     naming: 'run.js',
        // }),
    ])
        .then(([one]) => {
            console.log(one.logs);
        })
        .catch((err) => {
            console.log('failed? idk');
        });
});

const ignore = ['.git/', 'node_modules/', 'worker.js', 'run.js'];

watch('.', { recursive: true }, (event, filename) => {
    if (!filename) return;
    if (ignore.some((n) => filename.startsWith(n))) {
        // ignore
        return;
    }
    if (filename.match(/\.tsx?$/)) {
        edited.push(filename);
        rebuild();
    } else {
        console.log('ignore', filename);
    }
});

const service = Bun.serve({
    async fetch(req) {
        let pathname = new URL(req.url).pathname;
        if (pathname.endsWith('/')) {
            pathname += 'index.html';
        }
        const file = Bun.file(join('./web', pathname));
        return new Response(file);
    },
});

console.log(`Serving http://${service.hostname}:${service.port}`);

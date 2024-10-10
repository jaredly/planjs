import ansis from 'ansis';
import { APP, LAW, NAT, PIN, REF, Val } from './types';
import { natToAscii } from './natToAscii';

const colors = [
    ansis.red,
    ansis.gray,
    ansis.green,
    ansis.blue,
    ansis.yellow,
    ansis.magenta,
];

type Ctx = {
    hidePinLaw: boolean;
    trace: Val[];
};

export const show = (
    val: Val,
    ctx: Ctx = { hidePinLaw: false, trace: [] },
): string => {
    if (ctx.trace.includes(val)) {
        const at = ctx.trace.indexOf(val);
        return `<recurse ^${ctx.trace.length - at}>`;
    }
    ctx = { ...ctx, trace: [...ctx.trace, val] };
    // ctx = [...ctx, v];
    const c = colors[ctx.trace.length % colors.length];
    const { v } = val;

    switch (v[0]) {
        case PIN:
            if (ctx.hidePinLaw && v[1].v[0] === LAW) {
                return c(`<law>`);
            }
            return c(`<${show(v[1], ctx)}>`);
        case LAW: {
            return c(`{${natToAscii(v[1]) || '_'} ${v[2]} ${show(v[3], ctx)}}`);
        }
        case APP:
            return c(
                `(${appArgs(val)
                    .map((m) => show(m, ctx))
                    .join(' ')})`,
            );
        case NAT:
            return `${v[1]}`;
        case REF:
            return `[${v[1]
                .map((m, i) => `${ansis.red(i + '')}=${show(m, ctx)}`)
                .join(', ')}][${v[2]}]`;
    }
};

// turn a nested APP(APP(APP(a,b),c),d) into [a,b,c,d]
export const appArgs = (val: Val): Val[] => {
    if (val.v[0] === PIN && val.v[1].v[0] === APP) return appArgs(val.v[1]);
    return val.v[0] === APP ? [...appArgs(val.v[1]), val.v[2]] : [val];
};

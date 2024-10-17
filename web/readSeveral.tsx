import { readerMulti } from 'j3/one-world/evaluators/boot-ex/reader';
import { RecNode, IDRef, keyForLoc } from 'j3/one-world/shared/nodes';
import { getExport, parse } from './format-parse';
import { AST } from './types';

export const readSeveral = (fullText: string) => {
    const tops: RecNode[] = [];
    let i = 0;

    const globals: Record<string, IDRef> = {
        NCASE: { type: 'builtin', kind: '' },
        INC: { type: 'builtin', kind: '' },
        PCASE: { type: 'builtin', kind: '' },
        LAW: { type: 'builtin', kind: '' },
        PIN: { type: 'builtin', kind: '' },
    };

    while (i < fullText.length) {
        const result = readerMulti(i, fullText, 'full', globals, false);
        if (!result) break;
        tops.push(result.node);
        i = result.i;
    }
    const nameForLoc: Record<string, string> = {};

    tops.forEach((top) => {
        const exp = getExport(top);
        if (exp) {
            globals[exp.text] = {
                type: 'toplevel',
                kind: '',
                loc: exp.loc,
            };
            nameForLoc[keyForLoc(exp.loc)] = exp.text;
        }
    });

    // tops.forEach((top) => fixGlobals(top, globals));

    const parseds: AST[] = [];

    tops.forEach((top, i) => {
        const parsed = parse(top, globals);
        if (!parsed.top) {
            throw new Error(
                `cant parse I guess ${JSON.stringify(parsed.errors)}`,
            );
        }
        parseds.push(parsed.top);
    });

    return { tops, parseds, nameForLoc, globals };
};

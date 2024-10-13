import { Sexp } from './parseTop';

const white = /\s/;
const skip = (text: string, i: number) => {
    while (i < text.length && text[i].match(white)) {
        i++;
    }
    return i;
};
const pair = { '[': ']', '(': ')', '{': '}' };
const read = (text: string, i: number, dest: Sexp[]): number => {
    if (i >= text.length) return i;
    if (text[i] === ';') {
        const n = text.slice(i).indexOf('\n');
        if (n === -1) {
            return text.length;
        }
        i += n;
    }
    if (text[i] === '(' || text[i] === '[' || text[i] === '{') {
        const first = text[i] as '[';
        const look = pair[first];
        i++;
        const items: Sexp[] = [];
        while (text[i] !== look && i < text.length) {
            i = read(text, i, items);
            i = skip(text, i);
        }
        i++;
        dest.push({ items, kind: first });
        return i;
    }
    i = skip(text, i);
    const next = text.slice(i).match(/^[^\s()\[\]{};]+/);
    if (next) {
        dest.push(next[0]);
        i += next[0].length;
    }

    return i;
};
export const readTop = (text: string) => {
    let i = 0;
    const tops: Sexp[] = [];
    while (i < text.length) {
        const ni = read(text, i, tops);
        if (ni === i) break;
        i = ni;
    }
    return tops;
};

type Rune = string;
type Name = string;

type Exp =
    | { type: 'name'; name: string }
    | { type: 'nest'; rune: string; args: Exp[] }
    | { type: 'juxt'; items: Exp[] };

const namerx = /[a-zA-Z_]+/;
const runerx = /[$!#%&*+,-./:<=>?@\\^`|~]+/;
const white = /\s/;

const skip = (text: string, i: number) => {
    while (text[i].match(white)) {
        i++;
    }
    return i;
};

type Nest = string | Nest[];

const parse = (text: string, i: number, dest: Nest[]): number => {
    if (i >= text.length) return i;
    if (text[i] === '(') {
        i++;
        const items: Nest[] = [];
        while (text[i] !== ')') {
            i = parse(text, i, items);
            i = skip(text, i);
        }
        i++;
        dest.push(items);
        return i;
    }
    return 0;
};

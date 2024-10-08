import equal from 'fast-deep-equal';
import {
    APPS,
    asVal,
    Force,
    Input,
    LAW,
    NAT,
    OPS,
    PIN,
    show,
    Val,
} from './runtime';

let LOG = false;

const chk = (msg: string, x: Val, y: Val) => {
    if (LOG) console.log(`expected`, show(x), `input`, show(y), msg);
    y = Force(y);
    if (equal(x, y)) {
        console.log(`✅ ${msg}`);
        return;
    }
    console.log(`🚨 ${show(x)} != ${show(y)}`, msg);
};

const mapp =
    (op: number | Val) =>
    (...args: (Val | number)[]) =>
        APPS(op, ...args);

const n = (n: number): Val => [NAT, BigInt(n)];
const inc = mapp([PIN, n(OPS.INC)]);
const law = mapp([PIN, n(OPS.LAW)]);
const pin = mapp([PIN, n(OPS.PIN)]);
const ncase = mapp([PIN, n(OPS.NCASE)]);
const pcase = mapp([PIN, n(OPS.PCASE)]);
const toNat = mapp(ncase(n(0), inc()));

const _ = APPS;

chk('nat', [NAT, 5n], inc(4));

chk('law', [LAW, 1n, 2n, n(3)], law(1, 2, 3));
chk('pin', [PIN, n(5)], pin(inc(4)));

chk('ncase', n(9), toNat(n(9)));
chk('ncase2', n(0), toNat(pin(n(9))));

chk('P___', APPS(1, 2), pcase(1, 0, 0, 0, pin(2)));
chk('_L__', APPS(1, 2, 3, 4), pcase(0, 1, 0, 0, law(2, 3, 4)));
chk('__A_', _(1, 2, 3), pcase(0, 0, 1, 0, _(2, 3)));
chk('___N', _(1, 2), pcase(0, 0, 0, 1, 2));

chk('basic law (self)', [LAW, 0n, 2n, n(0)], law(0, 2, 0, 7, 8));
chk('basic law (arg 1)', n(7), law(0, 2, 1, 7, 8));
chk('basic law (arg 2)', n(8), law(0, 2, 2, 7, 8));
chk('basic law (const)', n(3), law(0, 2, 3, 7, 8));

// (0, f, x) -> (f x)
// (1, v, b) -> (let v in b)
// (2, x)    -> x
const lapp = (f: Input, x: Input) => _(0, f, x);
const lapps = (...args: Input[]) => {
    let target = asVal(args.shift()!);
    while (args.length) {
        target = lapp(target, args.shift()!);
    }
    return target;
};
const llet = (v: Input, b: Input) => _(1, v, b);
const lconst = (v: Input) => _(2, v);

chk('law dsl CONST', n(32), law(0, 1, lconst(32), 0));

const k = law(0, 2, 1);
const appHead = mapp(pcase(0, 0, k, 0));
chk('apphead', n(200), appHead(_(200, 3)));
chk('first of inf', n(100), appHead(law(99, 1, llet(lapp(1, 2), 2), 100)));

chk('pinlaw', [LAW, 1n, 2n, n(0)], pin(law(), 1, 2, 0));
chk('pinlaw2', [LAW, 1n, 2n, n(0)], pin(law(1), 2, 0));
chk('pinlaw3', [PIN, [LAW, 1n, 2n, n(0)]], pin(law(1, 2, 0), 3, 4));
// HMMM is this supposed to collapse?
// chk('pinlaw4', [PIN, [LAW, 1, 2, n(0)]], pin(pin(law(1, 2, 0)), 3, 4));
chk('pinlaw4', [PIN, [PIN, [LAW, 1n, 2n, n(0)]]], pin(pin(law(1, 2, 0)), 3, 4));

chk('arg 1', n(9), law(0, 1, 1, 9));
chk('arg n stuff', n(8), law(0, 1, llet(1, 2), 8));

chk('a thing', n(7), law(0, 1, llet(3 /*2*/, llet(7 /*3*/, 2)), 9 /*1*/));

chk(
    'more complx',
    _(1, _(0, 2)),
    law(
        0,
        1, // | ? ($0 $1)
        _(
            1,
            _(0, _(2, 0), 3), // @ $2 = (0 $3)
            _(
                1,
                _(2, 2), // @ $3 = 2
                _(0, 1, 2), // | ($1 $2)
            ),
        ),
        1, // 1
    ),
);

LOG = false;
//  -- more complex example
//     chk (1%(0%2))
//              (law%0%1%           --   | ? ($0 $1)
//                (1% (0%(2%0)%3)%  --     @ $2 = (0 $3)
//                (1% (2%2)%        --     @ $3 = 2
//                 (0%1%2)))%       --     | ($1 $2)
//              1)                  --   1

chk(
    'trivial cycles are ok if not used',
    n(7),
    _(_(law(0, 1, _(1, 7, _(1, 3, 2)), 9))),
);
// -- trivial cycles are okay if not used.
// chk 7 ( (law % 0 % 1 %  --   | ? ($0 $1)
//           (1% 7%        --     @ $2 = 7
//           (1% 3%        --     @ $3 = $3
//                         --     $2
//            2))%         --   9
//         9))

const z1 = law(0, 1, _(2, 0)); //  --  z1 _ = 0
const z3 = law(0, 3, _(2, 0)); //  --  z3 _ _ _ = 0

const a = (f: Input, x: Input) => _(0, f, x);
const lenHelp = law(0, 3, lapp(inc(), lapp(1, 2)));
const len = law(0, 1, lapp(lapp(lapp(pcase(z1, z3), lapp(lenHelp, 0)), z1), 1));
// const lawE = (n:Input,a:Input,b:Input) => law(n,a,b)
// a f x = (0 % f % x)
// lawE n a b = (law % n % a % b)

const k3 = law(0, 4, 1);
const i = law(0, 1, 1);

// -- length of an array
// --
// --     lenHelp len h t = inc (len h)
// --     len x = planCase z1 z3 (\len h t -> inc (len h))  n x
// lenHelp = lawE 0 3 (inc `a` (1 `a` 2))
// len = lawE 0 1 (((planCase % z1 % z3) `a` (lenHelp `a` 0)) `a` z1 `a` 1)

chk('length of array', n(9), _(len, _(0, 1, 2, 3, 4, 5, 6, 7, 8, 9)));
chk('length of array2', n(0), _(len, 1));
chk('length of array3', n(1), _(len, _(20, 10)));

// const toNat=_(natCase, 0, inc)
const head_ = law(0, 3, lapp(1, 2)); //    -- \head h t -> head h
const headF = law(
    0,
    1,
    lapps(pcase(), lapp(k, 1), lapp(k3, 1), lapp(head_, 0), i, 1),
);
const tag = law(0, 1, lapp(toNat(), lapp(headF, 1))); //

chk('head of closure', n(7), _(headF, _(7, 1, 2, 3, 4, 5, 6, 7, 8, 9)));
chk('head law', [PIN, [NAT, BigInt(OPS.LAW)]], _(headF, law(1, 2)));

// -- tag of ADT (head cast to nat)
chk('tag of ADT', n(7), _(tag, _(7, 1, 2, 3, 4, 5, 6, 7, 8, 9)));
chk('tag of ADT law', n(0), _(tag, law(1, 2)));

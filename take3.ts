//

export {}
type tPIN = 0;
type tLAW = 1;
type tAPP = 2;
type tNAT = 3;
type tHOL = 4;
type nat = number;
type VAL = [tPIN, VAL] | [tLAW, nat, nat, VAL] | [tAPP, VAL, VAL] | [tNAT, nat] | [tHOL];

const PIN: tPIN = 0;
const LAW: tLAW = 1;
const APP: tAPP = 2;
const NAT: tNAT = 3;
const HOL: tHOL = 4;

const OPS = {
    PIN: 0,
    LAW: 1,
    INC: 2,
    NCASE: 3,
    PCASE: 4,
} as const;

const opArity = {
    [OPS.PIN]: 1,
    [OPS.LAW]: 3,
    [OPS.INC]: 1,
    [OPS.NCASE]: 3,
    [OPS.PCASE]: 5,
}

const arity = (v: VAL): number => {
    switch (v[0]) {
        case APP:
            const [_, fn, arg] = v
            return arity(fn) - 1
        case PIN:
            if (v[1][0] === NAT) {
                if (v[1][1] in opArity) {
                    return opArity[v[1][1]]
                }
                throw new Error(`invalid opcode ${v[1][1]}`)
            }
            return arity(v[1])
        case LAW: {
            const [_, __, arity, ___] = v
            return arity
        }
        case NAT:
            return 0
        case HOL:
            throw new Error(`cant arity a hole`)
    }
    throw new Error(`invalid val`)
}

const asNat = (v: VAL) => {
    if (v[0] !== NAT) throw new Error(`not a nat ${v}`)
    return v[1]
}

const call = (target: VAL, ...args: VAL[]) => {
    while (args.length) {
        if (arity(target) === 1) {
            target = subst(target, [args.shift()!])
        } else {
            target = [APP, target, args.shift()!]
        }
    }
    return target
}

const opEval = {
    [OPS.PIN]: (x: VAL) => [PIN, x],
    [OPS.LAW]: (id: VAL, arity: VAL, body: VAL) => [LAW, asNat(id), asNat(arity), body],
    [OPS.INC]: (num: VAL) => [NAT, asNat(num) + 1],
    [OPS.NCASE]: (zero: VAL, other: VAL, x: VAL) => {
        const n = asNat(x)
        return n === 0 ? zero : call(other, [NAT, n - 1])
    },
    [OPS.PCASE]: (p: VAL, l: VAL, a: VAL, n: VAL, x: VAL) => {
        switch (x[0]) {
            case PIN:
                return call(p, x[1])
            case LAW:
                return call(l, [NAT, x[1]], [NAT, x[2]], x[3])
            case APP:
                return call(a, x[1], x[2])
            case NAT:
                return call(n, x)
            case HOL:
                throw new Error(`hol pcase`)
        }
    }
}

const subst = (target: VAL, values: VAL[]):VAL => {
    switch (target[0]) {
        case PIN:
            if (target[1][0] === LAW) {
                const [_, n, arity, b] = target[1]
                return runLaw(arity, [target, ...values].reverse(), b)
            } else {
                return subst(target[1], values)

            }
        case LAW: {
            const [_, n, arity, b] = target
            return runLaw(arity, [target, ...values].reverse(), b)
        }
        case APP:
            return subst(target[1], [target[2], ...values])
        case NAT: {
            const f = opEval[target[1]]
            if (!f) throw new Error(`invalid op ${target[1]}`)
            if (f.length !== values.length - 1) {
                throw new Error(`wrong number of args for op ${target[1]}: ${values.length - 1}`)
            }
            return f(...values.slice(1))
        }
        case HOL:
            throw new Error('subst hol')
    }
    throw new Error(`invalid opcode: ${target[0]}`)
}

const run =

// const pin: VAL = [PIN, [NAT, 0]]
// const law: VAL = [PIN, [NAT, 1]]
// const inc: VAL = [PIN, [NAT, 2]]
// const natCase: VAL = [PIN, [NAT, 3]]
// const planCase: VAL = [PIN, [NAT, 4]]

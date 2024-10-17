import { MValue, Ref } from './types';

export const prepareLaw = (
    buffer: MValue[],
    args: Ref[],
    p0: number,
): MValue[] => {
    const modRef = (ref: Ref): Ref => {
        switch (ref.type) {
            case 'PIN':
                return ref;
            case 'LOCAL':
                return { type: 'LOCAL', v: p0 + ref.v };
            case 'STACK':
                if (ref.v === 0) throw new Error('self sry');
                if (ref.v <= args.length) {
                    return args[ref.v - 1];
                }
                return { type: 'LOCAL', v: p0 + ref.v - args.length - 1 };
        }
    };

    return buffer.map((value) => {
        switch (value.type) {
            case 'NAT':
            case 'LAW':
                return value;
            case 'REF':
                return { type: 'REF', ref: modRef(value.ref) };
            case 'APP':
                return {
                    type: 'APP',
                    f: modRef(value.f),
                    x: modRef(value.x),
                    ev: false,
                };
        }
    });
};

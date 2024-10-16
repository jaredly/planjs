import { Loc } from 'j3/one-world/shared/nodes';

export type Let = { name: string; value: AST };

export type AST =
    | {
          type: 'law';
          name?: { text: string; loc: Loc };
          args: string[];
          lets: Let[];
          body: AST;
          loc: Loc;
      }
    | {
          type: 'string';
          first: string;
          templates: { expr: AST; suffix: string }[];
          loc: Loc;
      }
    | { type: 'array'; items: AST[]; loc: Loc }
    // | {type: 'list', items: AST[], loc: Loc}
    | { type: 'nat'; number: bigint; loc: Loc }
    | { type: 'local'; name: string; loc: Loc }
    | { type: 'pin'; ref: Loc; loc: Loc }
    | { type: 'builtin'; name: string; loc: Loc }
    | { type: 'app'; target: AST; args: AST[]; loc: Loc };

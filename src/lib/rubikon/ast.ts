// The Rubikon syntax tree: what the parser makes, as plain JSON.
//
// Every node has a `kind` and a `loc` (where it starts in the source).
// See rubikon-json.md for the format, with examples.

export interface Loc {
	line: number;
	column: number;
}

// --- Files and definitions ---

export interface RubikonFile {
	kind: 'file';
	imports: Import[];
	defs: Definition[];
	loc: Loc;
}

// `import cfop` or `import cfop as c`.
export interface ImportModule {
	kind: 'import';
	module: string;
	alias: string | null;
	loc: Loc;
}

// `from cfop import sexy, sune as mySune`.
export interface ImportNames {
	kind: 'from';
	module: string;
	names: ImportedName[];
	loc: Loc;
}

export interface ImportedName {
	name: string;
	alias: string | null;
}

export type Import = ImportModule | ImportNames;

export type Definition = Let | Fun | Algo;

export interface TypeRef {
	name: string;
	arg: string | null; // Set(Location): name 'Set', arg 'Location'
}

export interface Param {
	name: string;
	type: TypeRef;
}

// --- Statements ---

export interface Let {
	kind: 'let';
	name: string;
	type: TypeRef | null;
	value: Expr;
	loc: Loc;
}

export interface Fun {
	kind: 'fun';
	name: string;
	params: Param[];
	result: TypeRef;
	body: Statement[];
	loc: Loc;
}

// `algo [name[(params)]] ["description"] [goal cond] { … }`.  `params` is
// null when there's no parameter list (a stage, or `main`).
export interface Algo {
	kind: 'algo';
	name: string | null;
	params: Param[] | null;
	description: string | null;
	goal: Cond | null;
	body: Statement[];
	loc: Loc;
}

export interface Do {
	kind: 'do';
	value: Expr;
	loc: Loc;
}

export interface Return {
	kind: 'return';
	value: Expr;
	loc: Loc;
}

export interface If {
	kind: 'if';
	cond: Cond;
	then: Statement[];
	else: Statement[] | null; // `else if …` is an else holding one If
	loc: Loc;
}

// What a case does: `-> do …`, or `-> ()` for nothing.
export type Action = Do | Nothing;

export interface Nothing {
	kind: 'nothing';
	loc: Loc;
}

export interface Case {
	kind: 'case';
	cond: Cond;
	action: Action;
	loc: Loc;
}

export interface Match {
	kind: 'match';
	cases: Case[];
	otherwise: Action | null;
	loc: Loc;
}

// `search U* y* as t { … } else search …`.
export interface Search {
	kind: 'search';
	generators: MoveToken[];
	as: string;
	cases: Case[];
	otherwise: Action | null;
	else: Search | null;
	loc: Loc;
}

export interface Each {
	kind: 'each';
	turn: MoveToken;
	body: Statement[];
	loc: Loc;
}

// `until goal max n { … }` (cond is a Goal) or `until <cond> max n { … }`.
export interface Until {
	kind: 'until';
	cond: Cond;
	max: number;
	body: Statement[];
	loc: Loc;
}

export type Statement = Let | Fun | Algo | Do | Return | If | Match | Search | Each | Until;

// --- Expressions (values) ---

// One move in standard notation: `R`, `U2`, `F'`, `Rw`, `M2`, `y'`.
// turns: 1 clockwise, 2 half, 3 counterclockwise.
export interface MoveToken {
	kind: 'move';
	name: string;
	turns: 1 | 2 | 3;
	loc: Loc;
}

// Items played one after another: `R U R' U'`.  Only made for two or more.
export interface Seq {
	kind: 'seq';
	items: Expr[];
	loc: Loc;
}

// A variable, or a module's name: `sune`, `cfop.sune`.
export interface Name {
	kind: 'name';
	module: string | null;
	name: string;
	loc: Loc;
}

// A place: `uf`, `rfu`, `u`.  Checked to be a real location.
export interface LocationLit {
	kind: 'location';
	name: string;
	loc: Loc;
}

// One cell of a pattern or face picture.
export type Cell =
	{ kind: 'any' } | { kind: 'color'; face: string } | { kind: 'not'; face: string };

// `/u__/`, `/df/r`.
export interface PatternLit {
	kind: 'pattern';
	cells: Cell[];
	anyRotation: boolean;
	loc: Loc;
}

// One cycle: `(uf ur ub)`, `(urf)+`.  twist: 0, 1 (`+`), or 2 (`-`).
export interface CycleLit {
	kind: 'cycle';
	places: string[];
	twist: 0 | 1 | 2;
	loc: Loc;
}

// `()`: nothing, the identity.
export interface Identity {
	kind: 'identity';
	loc: Loc;
}

// `x'` for a name or a group: `t'`, `(R U)'`.
export interface Inverse {
	kind: 'inverse';
	of: Expr;
	loc: Loc;
}

// `(R U R' U')3`.
export interface Repeat {
	kind: 'repeat';
	of: Expr;
	times: number;
	loc: Loc;
}

// `w<p>`: w p w'.
export interface Conjugate {
	kind: 'conjugate';
	wrapper: Expr;
	body: Expr;
	loc: Loc;
}

// `commutator(R, U)`, `lift(/df/r)`, `solved(df dr)`, `cfop.f(x)`.
export interface Call {
	kind: 'call';
	module: string | null;
	name: string;
	args: Expr[];
	loc: Loc;
}

export type Expr =
	| MoveToken
	| Seq
	| Name
	| LocationLit
	| PatternLit
	| CycleLit
	| Identity
	| Inverse
	| Repeat
	| Conjugate
	| Call;

// --- Conditions ---

export interface And {
	kind: 'and';
	items: Cond[];
	loc: Loc;
}

export interface Or {
	kind: 'or';
	items: Cond[];
	loc: Loc;
}

export interface Not {
	kind: 'not';
	of: Cond;
	loc: Loc;
}

// `uf is /df/`, `uf is not /df/`, `df is p`.
export interface Is {
	kind: 'is';
	place: Expr;
	pattern: Expr;
	negated: boolean;
	loc: Loc;
}

// `cube has (uf ur ub)`, `positions(cube) has (ufl urf) (ulb ubr)`.
export interface Has {
	kind: 'has';
	subject: Expr;
	cycles: CycleLit[];
	loc: Loc;
}

export interface Equals {
	kind: 'equals';
	left: Expr;
	right: Expr;
	loc: Loc;
}

// `face U [_u_ / uuu / _u_]`: rows[0] is the back row for U.
export interface FacePicture {
	kind: 'face';
	face: string;
	rows: Cell[][];
	loc: Loc;
}

// A value used as a condition: `solved(df)`, `placed(urf ufl)`.
export interface Test {
	kind: 'test';
	value: Expr;
	loc: Loc;
}

// `until goal …`: the enclosing algo's goal.
export interface Goal {
	kind: 'goal';
	loc: Loc;
}

export type Cond = And | Or | Not | Is | Has | Equals | FacePicture | Test | Goal;

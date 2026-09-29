// Rubikon grammar (Peggy).  Makes the syntax tree in ast.ts.
//
// Whitespace, newlines, and # comments are insignificant: every statement
// and case starts with a keyword, and a keyword can't start a move, name,
// or place, so a move sequence ends where the next keyword begins.

{{
  const KEYWORDS = new Set([
    'algo', 'goal', 'let', 'fun', 'return', 'do', 'each', 'match', 'search',
    'as', 'case', 'otherwise', 'else', 'until', 'max', 'if', 'not', 'and',
    'or', 'in', 'is', 'all', 'has', 'face', 'import', 'from'
  ]);
  const TURNS = { '': 1, '2': 2, "'": 3 };
  const TWIST = { '': 0, '+': 1, '-': 2 };
}}

{
  function here() {
    const s = location().start;
    return { line: s.line, column: s.column };
  }
  function seq(items) {
    return items.length === 1 ? items[0] : { kind: 'seq', items, loc: items[0].loc };
  }
}

// ---------------------------------------------------------------- Files

File
  = _ imports:(@Import _)* defs:(@TopDef _)*
    { return { kind: 'file', imports, defs, loc: { line: 1, column: 1 } }; }

Import
  = FROM _ module:Ident _ IMPORT _ head:ImportedName tail:(_ "," _ @ImportedName)*
    { return { kind: 'from', module, names: [head, ...tail], loc: here() }; }
  / IMPORT _ module:Ident alias:(_ AS _ @Ident)?
    { return { kind: 'import', module, alias: alias ?? null, loc: here() }; }

ImportedName
  = name:Ident alias:(_ AS _ @Ident)?
    { return { name, alias: alias ?? null }; }

TopDef = Let / Fun / Algo

// ---------------------------------------------------------------- Statements

Statement = Let / Fun / Algo / Do / Return / If / Match / Search / Each / Until

Block = "{" _ body:(@Statement _)* "}" { return body; }

Let
  = LET _ name:Ident type:(_ ":" _ @Type)? _ "=" _ value:Expr
    { return { kind: 'let', name, type: type ?? null, value, loc: here() }; }

Fun
  = FUN _ name:Ident params:Params _ ":" _ result:Type _ body:Block
    { return { kind: 'fun', name, params, result, body, loc: here() }; }

Algo
  = ALGO name:(_ @Ident)? params:Params? description:(_ @String)? goal:(_ GOAL _ @Cond)? _ body:Block
    {
      return {
        kind: 'algo', name: name ?? null, params: params ?? null,
        description: description ?? null, goal: goal ?? null, body, loc: here()
      };
    }

Params
  = "(" _ list:(head:Param tail:(_ "," _ @Param)* { return [head, ...tail]; })? _ ")"
    { return list ?? []; }

Param = name:Ident _ ":" _ type:Type { return { name, type }; }

Type
  = name:TypeName arg:("(" _ @TypeName _ ")")?
    { return { name, arg: arg ?? null }; }

Do = DO _ value:Expr { return { kind: 'do', value, loc: here() }; }

Return = RETURN _ value:Expr { return { kind: 'return', value, loc: here() }; }

If
  = IF _ cond:Cond _ then:Block otherwise:(_ ELSE _ @(Block / i:If { return [i]; }))?
    { return { kind: 'if', cond, then, else: otherwise ?? null, loc: here() }; }

Match
  = MATCH _ "{" _ cases:(@Case _)* otherwise:(@Otherwise _)? "}"
    { return { kind: 'match', cases, otherwise: otherwise ?? null, loc: here() }; }

Case
  = CASE _ cond:Cond _ "->" _ action:Action
    { return { kind: 'case', cond, action, loc: here() }; }

Otherwise = OTHERWISE _ "->" _ @Action

Action
  = Do
  / "(" _ ")" { return { kind: 'nothing', loc: here() }; }

Search
  = SEARCH _ generators:(@Generator _)+ AS _ as:Ident _
    "{" _ cases:(@Case _)* otherwise:(@Otherwise _)? "}" next:(_ ELSE _ @Search)?
    {
      return {
        kind: 'search', generators, as, cases, otherwise: otherwise ?? null,
        else: next ?? null, loc: here()
      };
    }

Generator = @Move "*"

Each = EACH _ turn:Move _ body:Block { return { kind: 'each', turn, body, loc: here() }; }

Until
  = UNTIL _ cond:(GOAL { return { kind: 'goal', loc: here() }; } / Cond) _ MAX _ max:Int _ body:Block
    { return { kind: 'until', cond, max, body, loc: here() }; }

// ---------------------------------------------------------------- Expressions

// Items side by side, played in order.
Expr = head:Term tail:(_ @Term)* { return seq([head, ...tail]); }

// An atom, then any number of ' (inverse), then an optional conjugate
// w<p> (no space before <), which can itself be inverted.
Term
  = base:Atom primes:"'"* conj:("<" _ @Expr _ ">")? after:"'"*
    {
      let t = base;
      for (const _p of primes) t = { kind: 'inverse', of: t, loc: base.loc };
      if (conj !== null) t = { kind: 'conjugate', wrapper: t, body: conj, loc: base.loc };
      for (const _p of after) t = { kind: 'inverse', of: t, loc: base.loc };
      return t;
    }

Atom = Paren / Call / QualifiedName / Move / Location / Name / Pattern

// ( ) is the identity; (uf ur ub) a cycle; (R U)3 a group, repeated.
Paren
  = "(" _ ")" { return { kind: 'identity', loc: here() }; }
  / Cycle
  / "(" _ inner:Expr _ ")" times:$[0-9]*
    {
      return times === '' ? inner
        : { kind: 'repeat', of: inner, times: Number(times), loc: here() };
    }

Cycle
  = "(" _ head:LocationName tail:(_ @LocationName)* _ ")" twist:$[+-]?
    { return { kind: 'cycle', places: [head, ...tail], twist: TWIST[twist], loc: here() }; }

// No space between a function's name and its "(".
Call
  = name:(QualifiedName / Name) "(" _ args:Args? _ ")"
    { return { kind: 'call', module: name.module, name: name.name, args: args ?? [], loc: here() }; }

Args = head:Expr tail:(_ "," _ @Expr)* { return [head, ...tail]; }

QualifiedName
  = module:Ident "." name:Ident
    { return { kind: 'name', module, name, loc: here() }; }

Name = name:Ident { return { kind: 'name', module: null, name, loc: here() }; }

// A move: a face or wide face, a slice, or a whole cube turn, then ' or 2.
Move
  = name:$([UDLRFB] "w"? / [MES] / [xyz]) mod:$("2" / "'")? !IdentChar
    { return { kind: 'move', name, turns: TURNS[mod], loc: here() }; }

Location = name:LocationName { return { kind: 'location', name, loc: here() }; }

// Face letters only; checked against the real places.  Corners are named
// clockwise, so a counterclockwise spelling gets a hint.
LocationName
  = name:$[udfblr]+ !IdentChar
    {
      if (!options.isLocation(name)) {
        const hint = options.clockwise(name);
        error(hint ? `Not a location: ${name} (corners are named clockwise: ${hint})`
                   : `Not a location: ${name}`);
      }
      return name;
    }

Pattern
  = "/" cells:PatternCell+ "/" rotation:"r"? !IdentChar
    { return { kind: 'pattern', cells, anyRotation: rotation !== null, loc: here() }; }

PatternCell
  = "_" { return { kind: 'any' }; }
  / "!" face:$[udfblr] { return { kind: 'not', face }; }
  / face:$[udfblr] { return { kind: 'color', face }; }

// ---------------------------------------------------------------- Conditions

Cond = head:AndCond tail:(_ OR _ @AndCond)*
  { return tail.length === 0 ? head : { kind: 'or', items: [head, ...tail], loc: head.loc }; }

AndCond = head:NotCond tail:(_ AND _ @NotCond)*
  { return tail.length === 0 ? head : { kind: 'and', items: [head, ...tail], loc: head.loc }; }

NotCond
  = NOT _ of:NotCond { return { kind: 'not', of, loc: here() }; }
  / FacePicture
  / "(" _ @Cond _ ")"
  / Comparison

// A value, then: is [not] <pattern>, has <cycles>, == <value>, or nothing
// (a value used as a condition, like solved(df)).
Comparison
  = left:Term _ IS negated:(_ NOT)? _ pattern:Term
    { return { kind: 'is', place: left, pattern, negated: negated !== null, loc: left.loc }; }
  / left:Term _ HAS _ cycles:(@Cycle _)+
    { return { kind: 'has', subject: left, cycles, loc: left.loc }; }
  / left:Expr _ "==" _ right:Expr
    { return { kind: 'equals', left, right, loc: left.loc }; }
  / value:Term
    { return { kind: 'test', value, loc: value.loc }; }

// face U [_u_ / uuu / _u_]: three rows of three cells, spaces optional.
FacePicture
  = FACE _ face:$[UDLRFB] !IdentChar _ "[" _ head:FaceRow tail:(_ "/" _ @FaceRow)* _ "]"
    {
      const rows = [head, ...tail];
      if (rows.length !== 3 || rows.some((r) => r.length !== 3)) {
        error('A face picture has three rows of three cells');
      }
      return { kind: 'face', face, rows, loc: here() };
    }

FaceRow = head:PatternCell tail:(_ @PatternCell)* { return [head, ...tail]; }

// ---------------------------------------------------------------- Words

// A name: lower case first, not a keyword, not x, y, or z (moves), and not
// made only of face letters (that would read as a place).
Ident
  = name:$([a-z] IdentChar*)
    &{ return !KEYWORDS.has(name) && !/^[xyz]$/.test(name) && !/^[udfblr]+$/.test(name); }
    { return name; }

TypeName = $([A-Z] [A-Za-z]+)

IdentChar = [A-Za-z0-9_]

String = '"' chars:$[^"\n]* '"' { return chars; }

Int = digits:$[0-9]+ { return Number(digits); }

ALGO      = "algo"      !IdentChar
GOAL      = "goal"      !IdentChar
LET       = "let"       !IdentChar
FUN       = "fun"       !IdentChar
RETURN    = "return"    !IdentChar
DO        = "do"        !IdentChar
EACH      = "each"      !IdentChar
MATCH     = "match"     !IdentChar
SEARCH    = "search"    !IdentChar
AS        = "as"        !IdentChar
CASE      = "case"      !IdentChar
OTHERWISE = "otherwise" !IdentChar
ELSE      = "else"      !IdentChar
UNTIL     = "until"     !IdentChar
MAX       = "max"       !IdentChar
IF        = "if"        !IdentChar
NOT       = "not"       !IdentChar
AND       = "and"       !IdentChar
OR        = "or"        !IdentChar
IS        = "is"        !IdentChar
HAS       = "has"       !IdentChar
FACE      = "face"      !IdentChar
IMPORT    = "import"    !IdentChar
FROM      = "from"      !IdentChar

// Whitespace and comments.
_ = ([ \t\r\n] / Comment)*

Comment = "#" [^\n]*

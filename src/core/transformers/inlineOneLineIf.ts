import { Tree, Node } from 'web-tree-sitter';
import { Transformer } from './types';
import { LineDescriptor, LineBuilder } from '../descriptors';
import { isErrorNode, containsError, blockStatements, blockHasCommentOnRow } from '../astUtils';

/**
 * Collapses if/else-if/else chains where any branch has exactly one visible
 * statement. The format puts each branch on its own line, with the closing `}`
 * of the previous branch starting that line — which is the Go-idiomatic position
 * for `else`:
 *
 *   if err != nil {          →   if err != nil { return err        (collapsed)
 *       return err               } else if ok {                    (collapsed)
 *   } else if ok {               } else { x = 0 }                 (collapsed)
 *       return nil
 *   } else {
 *       x = 0
 *   }
 *
 * Mixed chains work naturally — multi-statement branches get `} else ... {` as
 * their opening line and keep their body intact:
 *
 *   if err != nil { return err      ← single-stmt, collapsed
 *   } else {                        ← multi-stmt, expanded
 *       x = compute()
 *       y = x + 1
 *   }
 *
 * The output is always valid Go (braces are preserved, just faded). Each
 * collapsed line carries a per-column `colMap` so hover / go-to-definition still
 * resolve to exact source positions.
 */
export class InlineOneLineIfTransformer implements Transformer {
  readonly id = 'inlineOneLineIf';
  readonly label = 'Inline one-line if blocks';

  transform(input: LineDescriptor[], tree: Tree | null, _configValue?: unknown): LineDescriptor[] {
    // No AST available — skip transformation rather than risk incorrect output.
    if (!tree) return input;

    const present = new Set(input.map((d) => d.sourceLine));
    const descBySource = new Map(input.map((d) => [d.sourceLine, d] as const));

    // Build source-row → outermost if_statement node map for O(1) lookup.
    const ifByRow = new Map<number, Node>();
    collectIfNodes(tree.rootNode, ifByRow);

    const output: LineDescriptor[] = [];
    let i = 0;
    while (i < input.length) {
      const d = input[i];
      const ifNode = ifByRow.get(d.sourceLine);
      if (ifNode) {
        const res = buildChainOutput(ifNode, present, descBySource);
        if (res) {
          output.push(...res.output);
          // Skip the header descriptor plus every descriptor within the chain.
          i++;
          while (i < input.length && input[i].sourceLine <= res.endRow) i++;
          continue;
        }
      }
      output.push(d);
      i++;
    }
    return output;
  }
}

interface Branch {
  ifNode: Node | null; // the if_statement (for if / else-if); null for else
  header: string; // "if x" / "else if y" / "else" (no brace)
  block: Node; // consequence or else block
  headerRow: number;
  closingRow: number; // source row of the closing brace
  braceCol: number; // column of the opening `{`
  closeBraceCol: number; // column of the closing `}`
}

interface BranchEval {
  canCollapse: boolean;
  stmt: Node | null; // the single remaining statement node
  desc: LineDescriptor | undefined; // its descriptor (carries faded/highlighted)
}

function buildChainOutput(
  outerNode: Node,
  present: Set<number>,
  descBySource: Map<number, LineDescriptor>
): { output: LineDescriptor[]; endRow: number } | null {
  const chain = parseChain(outerNode, descBySource);
  if (!chain) return null;

  const evals = chain.branches.map((b) => evalBranch(b, present, descBySource));

  // Only proceed when at least one branch can be compressed; all-expanded chains
  // are left entirely untouched (they look identical, just re-arranged).
  if (!evals.some((e) => e.canCollapse)) return null;

  const { branches, baseIndent, endRow } = chain;
  const output: LineDescriptor[] = [];

  for (let bi = 0; bi < branches.length; bi++) {
    const b = branches[bi];
    const e = evals[bi];
    const isFirst = bi === 0;
    const isLast = bi === branches.length - 1;
    const prev = isFirst ? null : branches[bi - 1];

    if (e.canCollapse) {
      const d = buildCollapsedBranchLine(baseIndent, b, e, isFirst, isLast, prev);
      if (d.text.length > 120) {
        // Too long — keep this branch expanded instead.
        appendExpandedBranch(output, baseIndent, b, isFirst, isLast, present, descBySource, prev);
      } else {
        output.push(d);
      }
    } else {
      appendExpandedBranch(output, baseIndent, b, isFirst, isLast, present, descBySource, prev);
    }
  }

  return { output, endRow };
}

function parseChain(
  outerNode: Node,
  descBySource: Map<number, LineDescriptor>
): { branches: Branch[]; endRow: number; baseIndent: string } | null {
  const headerText = (row: number) => descBySource.get(row)?.text ?? '';
  const baseIndent = leadingWhitespace(headerText(outerNode.startPosition.row));
  const branches: Branch[] = [];

  let current: Node | null = outerNode;
  let isFirst = true;

  while (current?.type === 'if_statement') {
    const conseq = current.childForFieldName('consequence');
    if (!conseq) return null;

    // Only collapse single-line if headers (multi-line conditions are left as-is).
    const headerRow = current.startPosition.row;
    if (conseq.startPosition.row !== headerRow) return null;

    branches.push({
      ifNode: current,
      header: buildIfHeader(current, isFirst) ?? fallbackHeader(headerText(headerRow), isFirst),
      block: conseq,
      headerRow,
      closingRow: conseq.endPosition.row,
      braceCol: conseq.startPosition.column,
      closeBraceCol: Math.max(0, conseq.endPosition.column - 1),
    });

    const alt = current.childForFieldName('alternative');
    if (!alt) break;

    if (alt.type === 'if_statement') {
      current = alt;
      isFirst = false;
    } else if (alt.type === 'block') {
      branches.push({
        ifNode: null,
        header: 'else',
        block: alt,
        headerRow: alt.startPosition.row,
        closingRow: alt.endPosition.row,
        braceCol: alt.startPosition.column,
        closeBraceCol: Math.max(0, alt.endPosition.column - 1),
      });
      break;
    } else {
      break;
    }
  }

  if (branches.length === 0) return null;
  return { branches, endRow: outerNode.endPosition.row, baseIndent };
}

function evalBranch(
  b: Branch,
  present: Set<number>,
  descBySource: Map<number, LineDescriptor>
): BranchEval {
  const stmts = blockStatements(b.block).filter((s) => present.has(s.startPosition.row));

  // Body rows still visible (excludes lines hidden by an earlier transformer).
  const bodyRows: number[] = [];
  for (let r = b.headerRow + 1; r < b.closingRow; r++) if (present.has(r)) bodyRows.push(r);

  const stmt = stmts[0];
  const single =
    stmts.length === 1 &&
    bodyRows.length === 1 &&
    stmt.startPosition.row === stmt.endPosition.row &&
    bodyRows[0] === stmt.startPosition.row;

  const desc = single ? descBySource.get(stmt.startPosition.row) : undefined;

  // A trailing line-comment on the body line would swallow the synthesized ` }`,
  // breaking valid-Go output — leave such a branch expanded.
  const safe = single && !!desc && !blockHasCommentOnRow(b.block, stmt.startPosition.row);

  return { canCollapse: safe, stmt: safe ? stmt : null, desc: safe ? desc : undefined };
}

// Builds the single output line for a collapsed (single-stmt) branch:
//
//   first, not-last:  `<indent><header> { <stmt>`         (no closing `}`)
//   first, last:      `<indent><header> { <stmt> }`
//   non-first:        `<indent>} <header> { <stmt>`        (the `}` closes the prev branch)
//   non-first, last:  `<indent>} <header> { <stmt> }`
//
// The closing `}` of a non-last branch is provided by the *next* branch's
// opening `}`, keeping `else` on the same line as `}` (Go requirement).
function buildCollapsedBranchLine(
  baseIndent: string,
  b: Branch,
  e: BranchEval,
  isFirst: boolean,
  isLast: boolean,
  prev: Branch | null
): LineDescriptor {
  const stmt = e.stmt!;
  const desc = e.desc!;
  const stmtText = desc.text.trim();
  const stmtIndentLen = desc.text.length - desc.text.trimStart().length;

  const lb = new LineBuilder();
  lb.appendAt(baseIndent, { line: b.headerRow, col: 0 });

  if (!isFirst && prev) {
    // `} ` — the `}` closes the previous branch's block.
    lb.appendAt('}', { line: prev.closingRow, col: prev.closeBraceCol });
    lb.appendAt(' ', { line: b.headerRow, col: 0 });
  }

  lb.append(b.header, b.headerRow, baseIndent.length);
  lb.appendAt(' ', { line: b.headerRow, col: b.braceCol });
  lb.appendAt('{', { line: b.headerRow, col: b.braceCol });
  lb.appendAt(' ', { line: b.headerRow, col: b.braceCol });
  lb.append(stmtText, stmt.startPosition.row, stmtIndentLen);

  if (isLast) {
    lb.appendAt(' ', { line: stmt.startPosition.row, col: stmtIndentLen + stmtText.length });
    lb.appendAt('}', { line: b.closingRow, col: b.closeBraceCol });
  }

  const { text, colMap } = lb.build();
  return {
    sourceLine: b.headerRow,
    text,
    collapsed: true,
    colMap,
    faded: desc.faded,
    highlighted: desc.highlighted,
  };
}

// Appends descriptors for a multi-statement (non-collapsed) branch. The `}`
// that closes the previous branch is prepended to the opening line (if not-first)
// so that `else` always appears on the same line as `}` in the output.
//
// The closing `}` of this branch is only emitted when it is the last branch —
// otherwise the NEXT branch's opening line will supply the `}`.
function appendExpandedBranch(
  out: LineDescriptor[],
  baseIndent: string,
  b: Branch,
  isFirst: boolean,
  isLast: boolean,
  present: Set<number>,
  descBySource: Map<number, LineDescriptor>,
  prev: Branch | null
): void {
  // Opening line: `[} ]<header> {`
  const prefix = !isFirst && prev ? `} ` : '';
  out.push({ sourceLine: b.headerRow, text: `${baseIndent}${prefix}${b.header} {` });

  // Body (only visible lines).
  for (let r = b.headerRow + 1; r < b.closingRow; r++) {
    if (present.has(r)) {
      const d = descBySource.get(r);
      if (d) out.push(d);
    }
  }

  // Closing `}` only when last; non-last closing `}` is provided by the next branch.
  if (isLast) {
    out.push({ sourceLine: b.closingRow, text: `${baseIndent}}` });
  }
}

function leadingWhitespace(line: string): string {
  return (line.match(/^(\s*)/) ?? ['', ''])[1];
}

// Builds an if/else-if header from the AST: `if [init; ]cond` (else-if gets an
// `else ` prefix). Returns null if the condition field is missing so the caller
// can fall back to the text-based reconstruction.
function buildIfHeader(ifNode: Node, isFirst: boolean): string | null {
  const condition = ifNode.childForFieldName('condition');
  if (!condition) return null;
  const initializer = ifNode.childForFieldName('initializer');
  const initPart = initializer ? `${initializer.text.trim().replace(/;$/, '').trim()}; ` : '';
  const core = `if ${initPart}${condition.text.trim()}`;
  return isFirst ? core : `else ${core}`;
}

// Legacy text-based header reconstruction, used only when AST fields are unavailable.
function fallbackHeader(headerLine: string, isFirst: boolean): string {
  if (isFirst) return headerLine.trim().replace(/\s*\{$/, '').trim();
  return headerLine.trim().replace(/^\}\s*/, '').replace(/\s*\{$/, '').trim();
}

function collectIfNodes(node: Node, map: Map<number, Node>): void {
  // Skip unparseable regions entirely (subtree-level degradation).
  if (isErrorNode(node)) return;
  if (node.type === 'if_statement') {
    // Only register the outermost if at each row; nested else-if chains are walked
    // from the outer node. A chain with any syntax error inside is left untouched
    // so we never collapse half-typed code.
    if (!map.has(node.startPosition.row) && !containsError(node)) {
      map.set(node.startPosition.row, node);
    }
  }
  for (const child of node.children) {
    if (child) collectIfNodes(child, map);
  }
}

/* Turning a module into something a plain <script> can hold: drop the
 * import and export statements and nothing else. Shared by build.mjs and
 * test-core.mjs so that "inlined" means exactly one thing -- if the two
 * disagreed about it, the drift test would compare the wrong strings and
 * pass while the prototype ran stale code. */

function stripModuleSyntax(src){
  const out = src
    .replace(/^import\s+\{[\s\S]*?\}\s+from\s+["'][^"']+["'];[ \t]*$/gm, "")
    .replace(/\nexport \{[\s\S]*?\n\};[\s\S]*$/, "\n");
  if (/^\s*(import|export)\b/m.test(out))
    throw new Error("stripModuleSyntax left an import/export behind");
  return out.trim() + "\n";
}

export { stripModuleSyntax };

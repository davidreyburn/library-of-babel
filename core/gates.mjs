/* Printed at the end of `npm test`, because the Node suite is not all of the
   gates and a green run should not imply that it is.
 *
 * Two of them need a browser. Node has none, and the repository has no
 * dependencies on purpose, so they are pages you open rather than commands
 * you run -- and a thing nobody is reminded of is a thing nobody runs. */
console.log(`
  Two gates need a browser and are not run here:

    core/conformance.html   the GPU agrees with the CPU about the lattice
    core/pagecheck.html     the pages actually work -- they boot, the panel
                            fills, the keys do something, something is on
                            the canvas, nothing threw, and no draw call was
                            rejected

  npm start, then open them. pagecheck's first run links the shader, which
  takes about a minute and a half on a machine that has not seen it.

  And before a release, open pagecheck a second time under a second GPU
  backend -- Chrome takes --use-angle=<metal|gl|swiftshader>, each with its
  own --user-data-dir. This is not belt-and-braces. Bug log 21a put the bug
  back and measured it: on a permissive driver the error queue is empty, the
  canvas is not blank, and all 29 assertions pass on a page that is broken
  everywhere else. One machine cannot see this class.
`);
